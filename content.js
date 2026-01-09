/**
 * Spyder Live Stream Downloader - Content Script
 * Author: Satnam Singh Laloda
 */

let mediaRecorder;
let recordedChunks = [];
let pipVideo = null;
let currentStream = null;
let targetVideoElement = null;
let recordingStartTime = 0;
let totalPausedDuration = 0;
let lastPauseTime = 0;
let syncCheckInterval = null;
let activeSyncPause = null;
let activeSyncResume = null;
let activeSyncStop = null;

// Helper to update global state in storage
function updateGlobalState(state) {
    chrome.runtime.sendMessage({
        action: "updateState",
        state: {
            state: state,
            startTime: recordingStartTime,
            pausedDuration: totalPausedDuration,
            lastPauseTime: lastPauseTime
        }
    });
}

// Initialize state from storage if recording was active for this tab
let isStateRecovered = false;
const recoveryPromise = new Promise((resolve) => {
    chrome.storage.local.get(['recordingState'], (result) => {
        const stateData = result.recordingState;
        if (stateData && stateData.state !== "inactive") {
            chrome.runtime.sendMessage({action: "getTabId"}, (response) => {
                if (response && response.tabId === stateData.tabId) {
                    recordingStartTime = stateData.startTime || 0;
                    totalPausedDuration = stateData.pausedDuration || 0;
                    lastPauseTime = stateData.lastPauseTime || 0;
                }
                isStateRecovered = true;
                resolve();
            });
        } else {
            isStateRecovered = true;
            resolve();
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start") {
        startRecording(request.sourceIndex).then(() => {
            recordingStartTime = Date.now();
            totalPausedDuration = 0;
            lastPauseTime = 0;
            updateGlobalState("recording");
            sendResponse({status: "started", startTime: recordingStartTime});
        }).catch(err => {
            console.error("Error starting recording:", err);
            sendResponse({status: "error", message: err.message});
        });
        return true;
    } else if (request.action === "getSources") {
        const sources = findAllVideoSources(document).map((el, index) => {
            return {
                index: index,
                label: `${el.tagName} ${el.offsetWidth}x${el.offsetHeight}`,
                id: el.id || el.className || `Source ${index + 1}`
            };
        });
        sendResponse({sources: sources});
    } else if (request.action === "stop") {
        stopRecording("user_request");
        updateGlobalState("inactive");
        sendResponse({status: "stopped"});
    } else if (request.action === "pause") {
        pauseRecording();
        lastPauseTime = Date.now();
        updateGlobalState("paused");
        sendResponse({status: "paused"});
    } else if (request.action === "resume") {
        resumeRecording();
        if (lastPauseTime > 0) {
            totalPausedDuration += (Date.now() - lastPauseTime);
            lastPauseTime = 0;
        }
        updateGlobalState("recording");
        sendResponse({status: "resumed"});
    } else if (request.action === "togglePip") {
        togglePip().then(() => {
            sendResponse({status: "pip_toggled"});
        });
        return true;
    } else if (request.action === "getState") {
        recoveryPromise.then(() => {
            sendResponse({
                state: mediaRecorder ? mediaRecorder.state : "inactive",
                startTime: recordingStartTime,
                pausedDuration: totalPausedDuration,
                lastPauseTime: lastPauseTime
            });
        });
        return true;
    }
});

// Find all video elements, including those in Shadow DOMs and iframes recursively
function findAllVideoSources(root) {
    let sources = [];
    
    // 1. Find videos
    const videos = Array.from(root.querySelectorAll('video'));
    sources = sources.concat(videos);
    
    // 2. Find canvases (as fallback for some streaming sites)
    const canvases = Array.from(root.querySelectorAll('canvas'));
    sources = sources.concat(canvases);
    
    // 3. Search in Shadow DOMs
    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            sources = sources.concat(findAllVideoSources(el.shadowRoot));
        }
    }
    
    // 4. Search in iframes (if same-origin)
    const iframes = root.querySelectorAll('iframe');
    for (const iframe of iframes) {
        try {
            if (iframe.contentDocument) {
                sources = sources.concat(findAllVideoSources(iframe.contentDocument));
            }
        } catch (e) {
            // Cross-origin iframe, cannot access
        }
    }
    
    return sources;
}

async function startRecording(sourceIndex) {
    targetVideoElement = null;
    
    const videoSources = findAllVideoSources(document);
    
    if (videoSources.length > 0) {
        if (sourceIndex !== undefined && videoSources[sourceIndex]) {
            targetVideoElement = videoSources[sourceIndex];
        } else {
            // Default: Pick the largest visible element
            targetVideoElement = videoSources.reduce((prev, curr) => {
                const prevArea = (prev.offsetWidth || 0) * (prev.offsetHeight || 0);
                const currArea = (curr.offsetWidth || 0) * (curr.offsetHeight || 0);
                return (currArea > prevArea) ? curr : prev;
            });
        }
    }
    
    if (!targetVideoElement) {
        throw new Error("इस पेज पर कोई वीडियो एलिमेंट नहीं मिला।");
    } else {
        if (typeof targetVideoElement.captureStream === 'function') {
            currentStream = targetVideoElement.captureStream();
        } else if (typeof targetVideoElement.mozCaptureStream === 'function') {
            currentStream = targetVideoElement.mozCaptureStream();
        } else {
            throw new Error("इस वीडियो एलिमेंट पर CaptureStream सपोर्टेड नहीं है।");
        }
    }

    // Using a higher bitrate and specific codec if available, like OBS settings
    const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 5000000 // 5Mbps for high quality
    };
    
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8,opus';
    }

    mediaRecorder = new MediaRecorder(currentStream, options);
    recordedChunks = [];

    // Add event listeners to sync recording with video playback
    if (targetVideoElement && targetVideoElement.tagName === 'VIDEO') {
        activeSyncPause = () => {
            // Only pause if we are recording and the video hasn't actually ended
            if (mediaRecorder && mediaRecorder.state === "recording" && !targetVideoElement.ended) {
                // Buffer check: readyState < 3 means not enough data to play smoothly
                const isBuffering = targetVideoElement.readyState < 3;
                if (targetVideoElement.paused || isBuffering || targetVideoElement.seeking) {
                    pauseRecording();
                    lastPauseTime = Date.now();
                    updateGlobalState("paused");
                    console.log(`Recording paused (Reason: ${targetVideoElement.paused ? 'paused' : (targetVideoElement.seeking ? 'seeking' : 'buffering')})`);
                }
            }
        };
        activeSyncResume = () => {
            if (mediaRecorder && mediaRecorder.state === "paused") {
                // Only resume if video is actually playing and has enough data
                if (!targetVideoElement.paused && !targetVideoElement.ended && targetVideoElement.readyState >= 3 && !targetVideoElement.seeking) {
                    resumeRecording();
                    if (lastPauseTime > 0) {
                        totalPausedDuration += (Date.now() - lastPauseTime);
                        lastPauseTime = 0;
                    }
                    updateGlobalState("recording");
                    console.log("Recording resumed");
                }
            }
        };

        activeSyncStop = () => {
            stopRecording("video_ended");
        };

        targetVideoElement.addEventListener('pause', activeSyncPause);
        targetVideoElement.addEventListener('play', activeSyncResume);
        targetVideoElement.addEventListener('waiting', activeSyncPause);
        targetVideoElement.addEventListener('playing', activeSyncResume);
        targetVideoElement.addEventListener('stalled', activeSyncPause);
        targetVideoElement.addEventListener('seeking', activeSyncPause);
        targetVideoElement.addEventListener('seeked', activeSyncResume);
        targetVideoElement.addEventListener('canplay', activeSyncResume);
        targetVideoElement.addEventListener('ended', activeSyncStop);

        // Auto-stop if video element is removed or frozen
        let lastCurrentTime = -1;
        let freezeCounter = 0;
        
        syncCheckInterval = setInterval(() => {
            if (!targetVideoElement || !targetVideoElement.isConnected) {
                stopRecording("element_removed");
                return;
            }

            const currentTime = targetVideoElement.currentTime;
            const isVideoPaused = targetVideoElement.paused;

            // Check if video is playing but currentTime is not advancing
            if (mediaRecorder.state === "recording" && !isVideoPaused) {
                if (currentTime === lastCurrentTime) {
                    freezeCounter++;
                    if (freezeCounter > 2) { // 2 seconds of freeze
                        console.log("Video stalled, pausing recording...");
                        activeSyncPause();
                        freezeCounter = 0;
                    }
                } else {
                    freezeCounter = 0;
                }
            } else if (mediaRecorder.state === "paused" && !isVideoPaused) {
                // Robust recovery: If recorder is paused but video is moving again
                if (currentTime !== lastCurrentTime && lastCurrentTime !== -1 && targetVideoElement.readyState >= 3) {
                    console.log("Video resumed, resuming recording...");
                    activeSyncResume();
                    freezeCounter = 0;
                }
            } else {
                freezeCounter = 0;
            }

            lastCurrentTime = currentTime;
        }, 1000);
        
        // Stop recording when current stream ends (e.g. source change)
        if (currentStream.getVideoTracks().length > 0) {
            currentStream.getVideoTracks()[0].onended = () => {
                stopRecording("track_ended");
            };
        }
    }

    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            recordedChunks.push(event.data);
        }
    };

    mediaRecorder.onerror = (event) => {
        console.error("MediaRecorder error:", event.error);
        stopRecording("recorder_error");
    };

    mediaRecorder.onstop = () => {
        if (document.pictureInPictureElement) {
            document.exitPictureInPicture();
        }
        if (pipVideo) {
            pipVideo.pause();
            pipVideo.srcObject = null;
            pipVideo.remove();
            pipVideo = null;
        }

        // Cleanup event listeners and intervals
        if (targetVideoElement && targetVideoElement.tagName === 'VIDEO') {
            if (activeSyncPause) {
                targetVideoElement.removeEventListener('pause', activeSyncPause);
                targetVideoElement.removeEventListener('waiting', activeSyncPause);
                targetVideoElement.removeEventListener('stalled', activeSyncPause);
                targetVideoElement.removeEventListener('seeking', activeSyncPause);
            }
            if (activeSyncResume) {
                targetVideoElement.removeEventListener('play', activeSyncResume);
                targetVideoElement.removeEventListener('playing', activeSyncResume);
                targetVideoElement.removeEventListener('seeked', activeSyncResume);
                targetVideoElement.removeEventListener('canplay', activeSyncResume);
            }
            targetVideoElement.removeEventListener('ended', activeSyncStop);
        }
        if (syncCheckInterval) {
            clearInterval(syncCheckInterval);
            syncCheckInterval = null;
        }
        activeSyncPause = null;
        activeSyncResume = null;
        activeSyncStop = null;
        window.onbeforeunload = null;

        targetVideoElement = null;
        recordingStartTime = 0;
        totalPausedDuration = 0;
        lastPauseTime = 0;
        updateGlobalState("inactive");

        if (recordedChunks.length === 0) {
            console.warn("No recorded chunks available, skipping save.");
            return;
        }

        const blob = new Blob(recordedChunks, {
            type: 'video/webm'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        a.href = url;
        a.download = `recording_${new Date().getTime()}.webm`;
        a.click();
        window.URL.revokeObjectURL(url);
        
        currentStream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start(1000);
    
    // Save recording if the tab is closed
    window.onbeforeunload = () => {
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            stopRecording("tab_closed");
        }
    };
}

function stopRecording(reason = "manual") {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        console.log(`Stopping recording. Reason: ${reason}`);
        mediaRecorder.stop();
    }
}

function pauseRecording() {
    if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.pause();
    }
}

function resumeRecording() {
    if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
    }
}

async function togglePip() {
    if (!currentStream || !targetVideoElement) return;

    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            // Use the original video element if found
            if (targetVideoElement.readyState >= 2) {
                await targetVideoElement.requestPictureInPicture();
            } else {
                // Fallback for elements that might not support PiP directly or are canvases
                if (!pipVideo) {
                    pipVideo = document.createElement('video');
                    pipVideo.muted = true;
                    pipVideo.style.display = 'none';
                    document.body.appendChild(pipVideo);
                }
                pipVideo.srcObject = currentStream;
                await pipVideo.play();
                await pipVideo.requestPictureInPicture();
            }
        }
    } catch (err) {
        console.error("PiP error:", err);
    }
}
