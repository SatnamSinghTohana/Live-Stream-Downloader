
chrome.runtime.onInstalled.addListener(() => {
    console.log("Ullu Live Stream And Video Recorder installed.");
    chrome.storage.local.set({
        recordingState: {
            state: "inactive",
            startTime: 0,
            pausedDuration: 0,
            lastPauseTime: 0
        }
    });
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    chrome.storage.local.get(['recordingState'], (result) => {
        if (result.recordingState && result.recordingState.tabId === tabId) {
            chrome.storage.local.set({
                recordingState: {
                    state: "inactive",
                    startTime: 0,
                    pausedDuration: 0,
                    lastPauseTime: 0,
                    tabId: null
                }
            });
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "updateState") {
        const newState = request.state;
        newState.tabId = sender.tab ? sender.tab.id : null;
        chrome.storage.local.set({ recordingState: newState });
    } else if (request.action === "getTabId") {
        sendResponse({ tabId: sender.tab ? sender.tab.id : null });
    }
});
