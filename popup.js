/**
 * Spyder Live Stream Downloader - Popup Script
 * Author: Satnam Singh Laloda
 */

let timerInterval;
let startTime;
let pausedDuration = 0;
let isPaused = false;
let lastPauseTime = 0;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const pipBtn = document.getElementById('pipBtn');
const timerDisplay = document.getElementById('timer');

const videoSourcesSelect = document.getElementById('videoSources');
const sourceSelector = document.getElementById('sourceSelector');
const libraryList = document.getElementById('libraryList');
const recCount = document.getElementById('recCount');
const clearLibraryBtn = document.getElementById('clearLibrary');
const statusText = document.getElementById('statusText');
const timerCard = document.getElementById('timerCard');
const donateBtn = document.getElementById('donateBtn');

function updateTimer() {
    const now = Date.now();
    let diff = 0;
    
    if (startTime) {
        if (isPaused) {
            diff = (lastPauseTime || now) - startTime - pausedDuration;
        } else {
            diff = now - startTime - pausedDuration;
        }
    }

    if (diff < 0) diff = 0;

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    timerDisplay.innerText = 
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function startTimer(extStartTime, extPausedDuration, extIsPaused, extLastPauseTime) {
    startTime = extStartTime;
    pausedDuration = extPausedDuration || 0;
    isPaused = extIsPaused || false;
    lastPauseTime = extLastPauseTime || 0;
    
    if (timerInterval) clearInterval(timerInterval);
    if (startTime && startTime > 0) {
        timerInterval = setInterval(updateTimer, 1000);
        if (!isPaused) timerCard.classList.add('recording');
        updateTimer();
    } else {
        timerDisplay.innerText = "00:00:00";
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    startTime = null;
    pausedDuration = 0;
    isPaused = false;
    lastPauseTime = 0;
    timerDisplay.innerText = "00:00:00";
    timerCard.classList.remove('recording');
}

startBtn.addEventListener('click', () => {
    const sourceIndex = videoSourcesSelect.value;
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "start", sourceIndex: sourceIndex}, function(response) {
            if (response && response.status === "started") {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                pauseBtn.style.display = "flex";
                pipBtn.style.display = "flex";
                sourceSelector.style.display = "none"; // Hide selector during recording
                statusText.innerText = "Recording";
                startTimer(response.startTime, 0, false, 0);
            } else if (response && response.status === "error") {
                statusText.innerText = "Error";
                setTimeout(() => {
                    statusText.innerText = "Ready";
                }, 3000);
            }
        });
    });
});

stopBtn.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "stop"}, function(response) {
            if (response && response.status === "stopped") {
                resetUI();
                statusText.innerText = "Saved";
            }
        });
    });
});

pauseBtn.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "pause"}, function(response) {
            if (response && response.status === "paused") {
                isPaused = true;
                lastPauseTime = Date.now();
                pauseBtn.style.display = "none";
                resumeBtn.style.display = "flex";
                statusText.innerText = "Paused";
                timerCard.classList.remove('recording');
                updateTimer();
            }
        });
    });
});

resumeBtn.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "resume"}, function(response) {
            if (response && response.status === "resumed") {
                isPaused = false;
                if (lastPauseTime > 0) {
                    pausedDuration += (Date.now() - lastPauseTime);
                    lastPauseTime = 0;
                }
                pauseBtn.style.display = "flex";
                resumeBtn.style.display = "none";
                statusText.innerText = "Recording";
                timerCard.classList.add('recording');
                updateTimer();
            }
        });
    });
});

pipBtn.addEventListener('click', () => {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "togglePip"}, function(response) {
            if (response && response.status === "pip_toggled") {
                console.log("PiP toggled");
            }
        });
    });
});

donateBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=satnamtoor12@gmail.com&item_name=Support%20Spyder%20Live%20Stream%20Downloader%20Project&currency_code=USD' });
});

clearLibraryBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all recording history from this list? (Files will remain on your computer)")) {
        chrome.downloads.erase({filenameRegex: 'recording_.*\\.webm'}, () => {
            loadLibrary();
        });
    }
});

function resetUI() {
    startBtn.disabled = true; // Will be enabled by loadSources if video exists
    stopBtn.disabled = true;
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";
    stopTimer();
    loadLibrary(); // Refresh library after saving
    loadSources(); // This will update status to Ready if video found
    
    // Also update storage state
    chrome.runtime.sendMessage({
        action: "updateState",
        state: {
            state: "inactive",
            startTime: 0,
            pausedDuration: 0,
            lastPauseTime: 0
        }
    });
}

async function loadLibrary() {
    chrome.downloads.search({
        limit: 10,
        orderBy: ['-startTime'],
        filenameRegex: 'recording_.*\\.webm'
    }, (items) => {
        if (!items || items.length === 0) {
            libraryList.innerHTML = '<div style="text-align: center; padding: 20px; font-size: 12px; color: var(--text-muted);">No recordings yet</div>';
            recCount.innerText = "0";
            return;
        }

        recCount.innerText = items.length;
        libraryList.innerHTML = '';
        
        items.forEach(item => {
            const date = new Date(item.startTime).toLocaleString();
            const filename = item.filename ? item.filename.split('\\').pop().split('/').pop() : `recording_${item.id}.webm`;
            const size = item.fileSize ? (item.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'Size unknown';
            
            const itemEl = document.createElement('div');
            itemEl.className = 'recording-item';
            itemEl.innerHTML = `
                <div class="rec-info">
                    <div class="rec-name">${filename}</div>
                    <div class="rec-date">${date} • ${size}</div>
                </div>
                <div class="rec-actions">
                    <button class="rec-btn download-rec" data-id="${item.id}" title="Show in folder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                    </button>
                    <button class="rec-btn delete-rec" data-id="${item.id}" title="Remove from list">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                </div>
            `;
            
            itemEl.querySelector('.download-rec').addEventListener('click', () => {
                chrome.downloads.show(item.id);
            });

            itemEl.querySelector('.delete-rec').addEventListener('click', () => {
                chrome.downloads.erase({id: item.id}, () => {
                    loadLibrary();
                });
            });
            
            libraryList.appendChild(itemEl);
        });
    });
}

function loadSources() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {action: "getSources"}, function(response) {
                if (chrome.runtime.lastError) {
                    statusText.innerText = "Open a video page";
                    startBtn.disabled = true;
                    sourceSelector.style.display = "none";
                    return;
                }
                if (response && response.sources && response.sources.length > 0) {
                    sourceSelector.style.display = "block";
                    videoSourcesSelect.innerHTML = '';
                    response.sources.forEach(source => {
                        const option = document.createElement('option');
                        option.value = source.index;
                        option.textContent = `${source.id} (${source.label})`;
                        videoSourcesSelect.appendChild(option);
                    });
                    
                    if (statusText.innerText !== "Recording" && statusText.innerText !== "Paused" && statusText.innerText !== "Saved") {
                        statusText.innerText = "Ready";
                        startBtn.disabled = false;
                    }
                } else {
                    sourceSelector.style.display = "none";
                    if (statusText.innerText !== "Recording" && statusText.innerText !== "Paused") {
                        statusText.innerText = "No video found";
                        startBtn.disabled = true;
                    }
                }
            });
        }
    });
}

// Check current state on popup open
function restoreState() {
    chrome.storage.local.get(['recordingState'], (result) => {
        const stateData = result.recordingState;
        if (stateData && stateData.state !== "inactive") {
            // First check if we are on the same tab where recording might be happening
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                const currentTab = tabs[0];
                if (!currentTab) return;

                if (stateData.tabId === currentTab.id) {
                    // Pre-apply state from storage to avoid flickering or 00:00:00
                    applyStateToUI(stateData);
                    
                    // Then send message to confirm state with content script
                    chrome.tabs.sendMessage(currentTab.id, {action: "getState"}, function(response) {
                        if (chrome.runtime.lastError) {
                            // Content script might have crashed or not ready, but storage says recording
                            return;
                        }
                        if (response) {
                            applyStateToUI(response);
                        }
                    });
                } else {
                    // Recording is in another tab
                    statusText.innerText = "Recording in another tab";
                    startBtn.disabled = true;
                }
            });
        }
    });
}

function applyStateToUI(response) {
    if (!response || !response.state) return;
    
    if (response.state === "recording") {
        if (response.startTime > 0) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            pauseBtn.style.display = "flex";
            resumeBtn.style.display = "none";
            pipBtn.style.display = "flex";
            statusText.innerText = "Recording";
            startTimer(response.startTime, response.pausedDuration, false, 0);
        }
    } else if (response.state === "paused") {
        if (response.startTime > 0) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            pauseBtn.style.display = "none";
            resumeBtn.style.display = "flex";
            pipBtn.style.display = "flex";
            statusText.innerText = "Paused";
            startTimer(response.startTime, response.pausedDuration, true, response.lastPauseTime);
        }
    } else if (response.state === "inactive") {
        if (response.startTime === 0 || !response.startTime) {
            resetUI();
        }
    } else {
        pipBtn.style.display = "flex";
    }
}

// Initial load
loadLibrary();
loadSources();
restoreState();

// Refresh library when download completes
chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        loadLibrary();
    }
});

// Sync UI with storage changes (important for auto-pause during buffering)
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.recordingState) {
        const newState = changes.recordingState.newValue;
        if (newState) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0] && newState.tabId === tabs[0].id) {
                    applyStateToUI(newState);
                }
            });
        }
    }
});
