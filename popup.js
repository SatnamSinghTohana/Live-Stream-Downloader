
let timerInterval;
let startTime;
let pausedDuration = 0;
let isPaused = false;
let lastPauseTime = 0;

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');

const videoSourcesSelect = document.getElementById('videoSources');
const urlInput = document.getElementById('videoUrlInput');
const libraryList = document.getElementById('libraryList');
const recCount = document.getElementById('recCount');
const clearLibraryBtn = document.getElementById('clearLibrary');
const statusText = document.getElementById('statusText');
const donateBtn = document.getElementById('donateBtn');
const owlLogo = document.getElementById('owlLogo');
const owlStatus = document.getElementById('owlStatus');
const librarySection = document.getElementById('librarySection');
const owlImage = document.getElementById('owlImage');
const owlEyelids = document.getElementById('owlEyelids');
const ringTimer = document.getElementById('ringTimer');
const owlLogoContainer = document.querySelector('.owl-logo-container');
const sourceSelector = document.getElementById('sourceSelector'); // New: explicit selector
let pollingInterval; // New: for source detection polling


const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const closeSettings = document.getElementById('closeSettings');
const settingQuality = document.getElementById('settingQuality');
const settingAutoResume = document.getElementById('settingAutoResume');
const saveNote = document.getElementById('saveNote');


settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('active');
    loadSettings();
});

closeSettings.addEventListener('click', () => {
    settingsPanel.classList.remove('active');
});


function loadSettings() {
    chrome.storage.local.get(['appSettings'], (result) => {
        const settings = result.appSettings || {
            quality: "best",
            autoResume: true
        };
        settingQuality.value = settings.quality || "best";
        settingAutoResume.checked = settings.autoResume !== false;

        updateQualityDropdownUI(settingQuality.value);
    });
}

function showSaveNote() {
    if (!saveNote) return;
    saveNote.style.opacity = '1';
    setTimeout(() => {
        saveNote.style.opacity = '0';
    }, 2000);
}


[settingQuality, settingAutoResume].forEach(el => {
    if (!el) return;
    el.addEventListener('change', () => {
        const settings = {
            quality: settingQuality.value,
            autoResume: settingAutoResume.checked
        };
        chrome.storage.local.set({ appSettings: settings }, showSaveNote);
    });
});


loadSettings();

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

    const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    if (ringTimer) ringTimer.innerText = formatted;
}

function startTimer(extStartTime, extPausedDuration, extIsPaused, extLastPauseTime) {
    startTime = extStartTime;
    pausedDuration = extPausedDuration || 0;
    isPaused = extIsPaused || false;
    lastPauseTime = extLastPauseTime || 0;

    if (timerInterval) clearInterval(timerInterval);
    if (startTime && startTime > 0) {
        timerInterval = setInterval(updateTimer, 1000);
        updateTimer();
    } else {
        if (ringTimer) ringTimer.innerText = "00:00:00";
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    startTime = null;
    pausedDuration = 0;
    isPaused = false;
    lastPauseTime = 0;
    if (ringTimer) ringTimer.innerText = "00:00:00";
}

startBtn.addEventListener('click', () => {
    const sourceIndex = videoSourcesSelect.value;
    if (sourceIndex === "" || sourceIndex === undefined) {
        statusText.innerText = "Please select a source";
        return;
    }

    chrome.storage.local.get(['appSettings'], async (settingsResult) => {
        const settings = settingsResult.appSettings || {
            quality: "5000000",
            autoResume: true
        };

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: "start",
                sourceIndex: sourceIndex,
                videoTitle: videoSourcesSelect.options[videoSourcesSelect.selectedIndex]?.text || "Video",
                settings: settings
            }, function (response) {
                if (response && response.status === "started") {
                    startBtn.disabled = true;
                    startBtn.style.display = "none";
                    stopBtn.disabled = false;
                    stopBtn.style.display = "flex";
                    pauseBtn.style.display = "flex";
                    sourceSelector.style.display = "none";
                    statusText.innerText = "";
                    owlStatus.innerText = "Ullu is recording...";
                    if (owlImage) owlImage.style.display = "none";
                    if (owlEyelids) owlEyelids.style.display = "none";
                    if (ringTimer) ringTimer.style.display = "block";
                    if (owlLogoContainer) owlLogoContainer.classList.add('recording');
                    startTimer(response.startTime, 0, false, 0);
                } else if (response && response.status === "error") {
                    statusText.innerText = "Error";
                    setTimeout(() => {
                        statusText.innerText = "";
                    }, 3000);
                }
            });
        });
    });
});

stopBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "stop" }, function (response) {
            if (response && response.status === "stopped") {
                resetUI();
                statusText.innerText = "Saved";
            }
        });
    });
});

pauseBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "pause" }, function (response) {
            if (response && response.status === "paused") {
                isPaused = true;
                lastPauseTime = Date.now();
                pauseBtn.style.display = "none";
                resumeBtn.style.display = "flex";
                statusText.innerText = "";
                updateTimer();
            }
        });
    });
});

resumeBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "resume" }, function (response) {
            if (response && response.status === "resumed") {
                isPaused = false;
                if (lastPauseTime > 0) {
                    pausedDuration += (Date.now() - lastPauseTime);
                    lastPauseTime = 0;
                }
                pauseBtn.style.display = "flex";
                resumeBtn.style.display = "none";
                statusText.innerText = "";
                updateTimer();
            }
        });
    });
});

donateBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.paypal.com/cgi-bin/webscr?cmd=_xclick&business=satnamtoor12@gmail.com&item_name=Support%20Ullu%20Live%20Stream%20And%20Video%20Recorder&currency_code=USD' });
});

clearLibraryBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear all recording history from this list? (Files will remain on your computer)")) {
        chrome.downloads.erase({ filenameRegex: 'recording_.*\\.webm' }, () => {
            loadLibrary();
        });
    }
});

function resetUI() {
    isPaused = false;
    startTime = null;
    pausedDuration = 0;
    lastPauseTime = 0;

    startBtn.disabled = true;
    startBtn.style.display = "none";
    stopBtn.disabled = true;
    stopBtn.style.display = "none";
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";

    stopTimer();
    loadLibrary();
    loadSources();

    if (owlStatus) owlStatus.innerText = "Ullu is waiting";
    if (owlImage) owlImage.style.display = "block";
    if (owlEyelids) owlEyelids.style.display = "flex";
    if (ringTimer) {
        ringTimer.style.display = "none";
        ringTimer.innerText = "00:00:00";
    }
    if (owlLogoContainer) {
        owlLogoContainer.classList.remove('recording');
        owlLogoContainer.classList.remove('paused');
    }
    if (urlInput) {
        urlInput.parentElement.style.display = "block";
    }
    if (statusText) statusText.innerText = "";
    if (sourceSelector) sourceSelector.style.display = "none";

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
            libraryList.innerHTML = '<div class="empty-state">No recordings found</div>';
            recCount.innerText = "0";
            return;
        }

        recCount.innerText = items.length;
        libraryList.innerHTML = '';

        items.forEach((item, index) => {
            const date = new Date(item.startTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const filename = item.filename ? item.filename.split('\\').pop().split('/').pop() : `recording_${item.id}.webm`;
            const size = item.fileSize ? (item.fileSize / 1024 / 1024).toFixed(1) + ' MB' : 'Size unknown';

            const itemEl = document.createElement('div');
            itemEl.className = 'recording-item';
            itemEl.style.animation = `fadeIn 0.3s ease forwards ${index * 0.05}s`;
            itemEl.style.opacity = '0';

            itemEl.innerHTML = `
                <div class="rec-info">
                    <div class="rec-name" title="${filename}">${filename}</div>
                    <div class="rec-meta">
                        <span>${date}</span>
                        <span style="opacity: 0.5">•</span>
                        <span>${size}</span>
                    </div>
                </div>
                <div class="rec-actions">
                    <button class="rec-btn download-rec" data-id="${item.id}" title="Show in folder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button class="rec-btn delete-rec" data-id="${item.id}" title="Remove from list">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;

            itemEl.querySelector('.download-rec').addEventListener('click', () => {
                chrome.downloads.show(item.id);
            });

            itemEl.querySelector('.delete-rec').addEventListener('click', () => {
                chrome.downloads.erase({ id: item.id }, () => {
                    loadLibrary();
                });
            });

            libraryList.appendChild(itemEl);
        });
    });
}


if (urlInput) {
    urlInput.addEventListener('dragover', (e) => {
        e.preventDefault();
        urlInput.classList.add('pulse-selection');
    });

    urlInput.addEventListener('dragleave', () => {
        urlInput.classList.remove('pulse-selection');
    });

    urlInput.addEventListener('dblclick', function () {
        this.select();
    });

    urlInput.addEventListener('drop', (e) => {
        e.preventDefault();
        urlInput.classList.remove('pulse-selection');
        const url = e.dataTransfer.getData('text').trim();
        if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
            urlInput.value = url;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.update(tabs[0].id, { url: url });
                }
            });
        }
    });

    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            let url = urlInput.value.trim();
            if (url) {
                if (!url.startsWith('http')) url = 'https://' + url;
                statusText.innerText = "Opening URL...";
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.update(tabs[0].id, { url: url }, () => {
                            // Immediate check and start polling
                            setTimeout(loadSources, 1500);
                        });
                    }
                });
            }
        }
    });

    urlInput.addEventListener('blur', () => {
        let url = urlInput.value.trim();
        if (url) {
            if (!url.startsWith('http')) url = 'https://' + url;
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.update(tabs[0].id, { url: url });
                }
            });
        }
    });
}

function loadSources() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
            // Only update input if we aren't currently typing or if it's empty
            if (urlInput && tabs[0].url && document.activeElement !== urlInput) {
                if (tabs[0].url.startsWith('chrome://') || tabs[0].url.startsWith('edge://') || tabs[0].url.startsWith('about:')) {
                    if (urlInput.value !== "") urlInput.value = "";
                } else {
                    urlInput.value = tabs[0].url;
                }
            }

            chrome.tabs.sendMessage(tabs[0].id, { action: "getSources" }, function (response) {
                if (chrome.runtime.lastError) {
                    // Script might not be loaded yet if page just refreshed
                    if (!startTime && statusText.innerText !== "Opening URL...") {
                        statusText.innerText = "Waiting for page...";
                    }
                    startBtn.style.display = "none";
                    if (sourceSelector) sourceSelector.style.display = "none";
                    return;
                }

                if (response && response.sources && response.sources.length > 0) {
                    const bestSource = response.sources[0];
                    videoSourcesSelect.innerHTML = '';
                    response.sources.forEach(source => {
                        const option = document.createElement('option');
                        option.value = source.index;
                        option.textContent = source.name;
                        videoSourcesSelect.appendChild(option);
                    });

                    videoSourcesSelect.value = bestSource.index;

                    if (stopBtn.disabled || stopBtn.style.display === "none") {
                        if (statusText.innerText === "Waiting for page..." || statusText.innerText === "Opening URL...") {
                            statusText.innerText = "";
                        }
                        startBtn.disabled = false;
                        startBtn.style.display = "flex";
                        if (sourceSelector) sourceSelector.style.display = "block";
                        startBtn.classList.remove('pulse-selection');
                    }
                } else {
                    if (stopBtn.disabled || stopBtn.style.display === "none") {
                        if (statusText.innerText !== "Opening URL...") {
                            statusText.innerText = "No video detected";
                        }
                        startBtn.style.display = "none";
                        if (sourceSelector) sourceSelector.style.display = "none";
                    }
                }
            });
        }
    });
}

function startPolling() {
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
        // Only poll if we are NOT recording
        chrome.storage.local.get(['recordingState'], (result) => {
            const state = result.recordingState?.state;
            if (state === "inactive" || !state) {
                loadSources();
            } else {
                if (pollingInterval) {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                }
            }
        });
    }, 3000);
}


function restoreState() {
    chrome.storage.local.get(['recordingState'], (result) => {
        const stateData = result.recordingState;
        if (stateData && stateData.state !== "inactive") {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                const currentTab = tabs[0];
                if (!currentTab) return;

                if (stateData.tabId === currentTab.id) {
                    applyStateToUI(stateData);
                    chrome.tabs.sendMessage(currentTab.id, { action: "getState" }, function (response) {
                        if (chrome.runtime.lastError) {
                            chrome.storage.local.set({ recordingState: { state: "inactive", startTime: 0 } });
                            resetUI();
                            return;
                        }
                        if (response) {
                            applyStateToUI(response);
                        } else {
                            chrome.storage.local.set({ recordingState: { state: "inactive", startTime: 0 } });
                            resetUI();
                        }
                    });
                } else {
                    statusText.innerText = "Check other tabs";
                    startBtn.disabled = true;
                    startBtn.style.display = "none";
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
            startBtn.style.display = "none";
            stopBtn.disabled = false;
            stopBtn.style.display = "flex";
            pauseBtn.style.display = "flex";
            resumeBtn.style.display = "none";
            statusText.innerText = "";
            if (owlStatus) owlStatus.innerText = "Ullu is recording...";
            if (owlImage) owlImage.style.display = "none";
            if (owlEyelids) owlEyelids.style.display = "none";
            if (ringTimer) ringTimer.style.display = "block";
            if (owlLogoContainer) {
                owlLogoContainer.classList.add('recording');
                owlLogoContainer.classList.remove('paused');
            }
            if (urlInput) urlInput.parentElement.style.display = "none";
            startTimer(response.startTime, response.pausedDuration, false, 0);
        }
    } else if (response.state === "paused") {
        if (response.startTime > 0) {
            startBtn.disabled = true;
            startBtn.style.display = "none";
            stopBtn.disabled = false;
            stopBtn.style.display = "flex";
            pauseBtn.style.display = "none";
            resumeBtn.style.display = "flex";
            statusText.innerText = "";
            if (owlStatus) owlStatus.innerText = "Recording paused...";
            if (owlImage) owlImage.style.display = "none";
            if (owlEyelids) owlEyelids.style.display = "none";
            if (ringTimer) ringTimer.style.display = "block";
            if (owlLogoContainer) {
                owlLogoContainer.classList.add('paused');
                owlLogoContainer.classList.remove('recording');
            }
            if (urlInput) urlInput.parentElement.style.display = "none";
            startTimer(response.startTime, response.pausedDuration, true, response.lastPauseTime);
        }
    } else if (response.state === "inactive") {
        if (response.startTime === 0 || !response.startTime) {
            resetUI();
        }
    }
}


loadLibrary();
loadSources();
restoreState();
startPolling(); // New: Start polling on popup open


chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state && delta.state.current === 'complete') {
        loadLibrary();
    }
});


chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.recordingState) {
        const newState = changes.recordingState.newValue;
        if (newState) {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0] && newState.tabId === tabs[0].id) {
                    applyStateToUI(newState);
                }
            });
        }
    }
});


function initCustomDropdowns() {
    setupCustomDropdown('qualityDropdown', 'settingQuality', 'qualitySelectedText');

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-dropdown')) {
            document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
        }
    });
}

function setupCustomDropdown(containerId, selectId, textId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const trigger = container.querySelector('.custom-select-trigger');
    const select = document.getElementById(selectId);
    const textSpan = document.getElementById(textId);

    trigger.addEventListener('click', () => {
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== container) d.classList.remove('active');
        });
        container.classList.toggle('active');
    });

    container.addEventListener('click', (e) => {
        const option = e.target.closest('.custom-option');
        if (option) {
            const value = option.dataset.value;
            const text = option.innerText;

            textSpan.innerText = text;
            select.value = value;

            container.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            container.classList.remove('active');

            select.dispatchEvent(new Event('change'));
        }
    });
}

function updateQualityDropdownUI(value) {
    const container = document.getElementById('qualityDropdown');
    const textSpan = document.getElementById('qualitySelectedText');
    if (!container || !textSpan) return;
    const options = container.querySelectorAll('.custom-option');

    options.forEach(opt => {
        if (opt.dataset.value === value) {
            opt.classList.add('selected');
            textSpan.innerText = opt.innerText;
        } else {
            opt.classList.remove('selected');
        }
    });
}



if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCustomDropdowns);
} else {
    initCustomDropdowns();
}
