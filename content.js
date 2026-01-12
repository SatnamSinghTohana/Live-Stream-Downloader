
let mediaRecorder;
let recordedChunks = [];
let currentStream = null;
let targetVideoElement = null;
let recordingStartTime = 0;
let totalPausedDuration = 0;
let lastPauseTime = 0;
let syncCheckInterval = null;
let activeSyncPause = null;
let activeSyncResume = null;
let activeSyncStop = null;

async function ysFixWebmDuration(blob, duration, type = 'video/webm') {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const buffer = reader.result;
            const sections = [
                { name: 'Duration', id: 0x4489, type: 'float', value: duration },
            ];

            resolve(new Blob([buffer], { type }));
        };
        reader.readAsArrayBuffer(blob);
    });
}

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

let isStateRecovered = false;
const recoveryPromise = new Promise((resolve) => {
    chrome.storage.local.get(['recordingState'], (result) => {
        const stateData = result.recordingState;
        if (stateData && stateData.state !== "inactive") {
            chrome.runtime.sendMessage({ action: "getTabId" }, (response) => {
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
        startRecording(request.sourceIndex, { ...request.settings, videoTitle: request.videoTitle }).then(() => {
            recordingStartTime = Date.now();
            totalPausedDuration = 0;
            lastPauseTime = 0;
            updateGlobalState("recording");
            sendResponse({ status: "started", startTime: recordingStartTime });
        }).catch(err => {
            console.error("Error starting recording:", err);
            sendResponse({ status: "error", message: err.message });
        });
        return true;
    } else if (request.action === "getSources") {
        const allSources = findAllVideoSources(document);

        const validSourcesData = allSources
            .map((el, index) => ({ el, index })) // Keep original index
            .filter(({ el }) => {
                const width = el.videoWidth || el.offsetWidth || 0;
                const height = el.videoHeight || el.offsetHeight || 0;
                // Min size 120x120 to filter out tracking pixels/ads, and must have data
                return width > 120 && height > 120 && el.readyState > 0;
            });

        const sources = validSourcesData.map(({ el, index }) => {
            let name = document.title || "Video";

            name = name.replace(/^\(\d+\)\s*/, '');

            if (validSourcesData.length > 1) {
                const w = el.videoWidth || el.offsetWidth;
                const h = el.videoHeight || el.offsetHeight;
                name = `${name} (${w}x${h})`;
            } else {
                if (name.length > 50) name = name.substring(0, 47) + "...";
            }

            return {
                index: index, // Original index for startRecording
                name: name,
                url: el.currentSrc || el.src || ""
            };
        });

        sendResponse({ sources: sources });
    } else if (request.action === "stop") {
        stopRecording("user_request");
        updateGlobalState("inactive");
        sendResponse({ status: "stopped" });
    } else if (request.action === "pause") {
        pauseRecording();
        lastPauseTime = Date.now();
        updateGlobalState("paused");
        sendResponse({ status: "paused" });
    } else if (request.action === "resume") {
        resumeRecording();
        if (lastPauseTime > 0) {
            totalPausedDuration += (Date.now() - lastPauseTime);
            lastPauseTime = 0;
        }
        updateGlobalState("recording");
        sendResponse({ status: "resumed" });
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

function findAllVideoSources(root) {
    let sources = [];

    const videos = Array.from(root.querySelectorAll('video'));
    sources = sources.concat(videos);

    const canvases = Array.from(root.querySelectorAll('canvas'));
    sources = sources.concat(canvases);

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
        if (el.shadowRoot) {
            sources = sources.concat(findAllVideoSources(el.shadowRoot));
        }
    }

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

async function startRecording(sourceIndex, settings = {}) {
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

    const bitrate = settings.quality ? parseInt(settings.quality) : 5000000;

    let mimeType = 'video/mp4;codecs=h264,aac';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/mp4';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9,opus';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp8,opus';
    }

    const options = {
        mimeType: mimeType,
        videoBitsPerSecond: bitrate
    };

    mediaRecorder = null;
    mediaRecorder = new MediaRecorder(currentStream, options);
    recordedChunks = [];
    mediaRecorder._appSettings = settings;
    mediaRecorder._videoTitle = settings.videoTitle || "Video";

    if (targetVideoElement && targetVideoElement.tagName === 'VIDEO') {
        activeSyncPause = () => {
            const settings = mediaRecorder._appSettings || {};
            if (mediaRecorder && mediaRecorder.state === "recording" && !targetVideoElement.ended && settings.autoResume !== false) {
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
            const settings = mediaRecorder._appSettings || {};
            if (mediaRecorder && mediaRecorder.state === "paused" && settings.autoResume !== false) {
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

        let lastCurrentTime = -1;
        let freezeCounter = 0;

        syncCheckInterval = setInterval(() => {
            if (!targetVideoElement || !targetVideoElement.isConnected) {
                stopRecording("element_removed");
                return;
            }

            const currentTime = targetVideoElement.currentTime;
            const isVideoPaused = targetVideoElement.paused;

            if (mediaRecorder.state === "recording" && !isVideoPaused) {
                if (currentTime === lastCurrentTime) {
                    freezeCounter++;
                    if (freezeCounter > 2) {
                        console.log("Video stalled, pausing recording...");
                        activeSyncPause();
                        freezeCounter = 0;
                    }
                } else {
                    freezeCounter = 0;
                }
            } else if (mediaRecorder.state === "paused" && !isVideoPaused) {
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

        const settings = mediaRecorder._appSettings || {};

        if (recordedChunks.length === 0) {
            console.warn("No recorded chunks available, skipping save.");
            return;
        }

        const blobType = mediaRecorder.mimeType || 'video/webm';
        const rawBlob = new Blob(recordedChunks, { type: blobType });
        const duration = Date.now() - recordingStartTime - totalPausedDuration;

        const finalBlobPromise = blobType.includes('webm')
            ? ysFixWebmDuration(rawBlob, duration, blobType)
            : Promise.resolve(rawBlob);

        finalBlobPromise.then(finalBlob => {
            if (settings.autoDownload !== false) {
                const url = URL.createObjectURL(finalBlob);
                const a = document.createElement('a');
                document.body.appendChild(a);
                a.style = 'display: none';
                a.href = url;

                const rawTitle = mediaRecorder._videoTitle || "Ullu_Live_Stream_And_Video_Recorder";
                const cleanTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
                const timestamp = new Date().getTime();
                const isMp4 = blobType.includes('mp4');
                const ext = isMp4 ? 'mp4' : 'webm';

                a.download = `${cleanTitle}_${timestamp}.${ext}`;
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                }, 100);
            }
        });

        currentStream.getTracks().forEach(track => track.stop());
    };

    mediaRecorder.start(1000);

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


