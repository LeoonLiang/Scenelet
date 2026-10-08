const { BrowserWindow } = require('electron');

// Decode and resize in an isolated renderer, keeping the main process responsive.
// The renderer only sees URLs registered by the main-process photo protocol.
async function createIndexer() {
  const worker = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  worker.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try { await worker.loadURL('data:text/html,' + encodeURIComponent('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src framewall: data:; script-src \'none\'">')); } catch (error) { worker.destroy(); throw error; }
  return {
    async read(url) {
      return worker.webContents.executeJavaScript(`new Promise((resolve, reject) => {
        const img = new Image();
        const timer = setTimeout(() => { img.src = ''; reject(new Error('Image decoding timed out')); }, 30000);
        img.onerror = () => { clearTimeout(timer); reject(new Error('Unreadable image')); };
        img.onload = () => {
          clearTimeout(timer);
          try {
            const width = img.naturalWidth, height = img.naturalHeight;
            const scale = Math.min(1, 600 / Math.max(width, height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve({ width, height, thumbnail: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] });
          } catch (error) { reject(error); }
        };
        img.crossOrigin = 'anonymous'; img.src = ${JSON.stringify(url)};
      })`);
    },
    close() { worker.destroy(); },
  };
}
module.exports = { createIndexer };
