# Live Stream Downloader

An advanced, professional browser extension for high-quality video capture from any web page, including complex dynamic streaming platforms with advanced protection mechanisms.

## 🛠 Easy Installation Guide

If you are a beginner, follow these simple steps to install the extension:

1. **Download the Project**:
   - [Click here to download the ZIP file directly](https://github.com/SatnamSinghTohana/Live-Stream-Downloader/archive/refs/heads/main.zip)
   - Or clone using Git: `https://github.com/SatnamSinghTohana/Live-Stream-Downloader.git`
   - Once downloaded, right-click the zip file and select **Extract All** (Unzip).

2. **Open Browser Settings**:
   - Open Google Chrome.
   - In the address bar at the top, type `chrome://extensions/` and press Enter.

3. **Enable Developer Mode**:
   - On the extensions page, look for the **Developer mode** toggle in the top right corner and turn it **ON**.

4. **Load the Extension**:
   - Click the **Load unpacked** button that appears on the top left.
   - Navigate to and select the folder you just extracted (Note: Select the folder that contains the `manifest.json` file).

Congratulations! **Live Stream Downloader** is now installed. You can Pin it to your toolbar by clicking the 'Puzzle' icon in the top right of Chrome.

## 🚀 Features

- **OBS-Style Capture**: Deep-scans Shadow DOMs and Iframes to find hidden video elements and canvas sources.
- **Smart Source Selection**: Automatically identifies the best video source or allows manual selection from a list of available videos on the page.
- **High-Quality Recording**: Configured for **5Mbps** bitrate and up to **60 FPS** for smooth, crystal-clear results.
- **Modern Glassmorphism UI**: Features a premium "Glass Style" interface with translucent backgrounds, blur effects, and smooth transitions.
- **Picture-in-Picture (PiP)**: One-click PiP mode to watch the video in a floating window while browsing or recording.
- **Recent Recordings Library**: Integrated library to view and manage your last 10 recordings with file size and timestamp details.
- **Persistent Logic**: Accuracy is maintained even when the popup is closed; the timer and state are synced with the background/content script.
- **Pause/Resume Support**: Seamlessly pause and resume your recordings without losing time accuracy.
- **Smart Buffering Detection**: Automatically pauses recording when the video buffers or stalls, and resumes when playback continues, ensuring no gaps in the final file.
- **Support the Project**: Integrated "Buy me a kulcha" button for secure PayPal support (`satnamtoor12@gmail.com`).


## 📖 How to Use

1. **Navigate**: Go to any website containing a video (e.g., YouTube, Twitch, and other live platforms).
2. **Open Extension**: Click the **Live Stream Downloader** icon in your browser's extension bar.
3. **Select Source**: If multiple video elements are found, choose the specific one you want to record from the dropdown.
4. **Start Recording**: Click the **🔴 Record** button. The status will pulse red, and the timer will start.
5. **Smart Sync**: Recording will auto-pause if the video buffers or if you manually pause the video.
6. **Mini View**: Click the **🖼️ PiP** button to pop the video out into a floating window.
7. **Stop & Save**: Click the **⏹️ Stop** button. Your video will be automatically processed and downloaded as a `.webm` file.
8. **Library**: View your previous sessions in the **Recent Recordings** section at the bottom of the popup.

## 🏗 Technical Architecture

- **Manifest V3**: Fully compliant with the latest security and performance standards for Chrome Extensions.
- **Shadow DOM Scanning**: Recursive algorithm to detect video elements nested deep within modern web components.
- **Smart State Recovery**: Recording state is securely recovered via `chrome.storage.local` even after page refreshes.
- **Event-Driven Sync**: Continuous monitoring of `waiting`, `playing`, and `readyState` ensures precise synchronization between video and recording.

## ⚠️ Disclaimer

This tool is intended for educational and personal use only. The developer shall not be held responsible for any misuse or use of this extension for illegal purposes.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

**Designed by Satnam Singh Laloda**
