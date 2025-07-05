const { app, Menu, Tray, nativeImage, BrowserWindow } = require('electron');
const path = require('path');
const axios = require('axios');

let tray = null;
let isPaused = false;

function togglePause() {
    isPaused = !isPaused;
    const action = isPaused ? 'pause' : 'resume';

    console.log(`🔁 Sending ${action} request to Python...`);
    axios.post(`http://localhost:5001/${action}`)
        .then(() => {
            console.log(`✅ Reminders ${action}d`);
        })
        .catch(err => {
            console.error(`❌ Failed to ${action}:`, err.message);
        });
}

function showStats() {
    console.log("📊 Fetching stats...");
    axios.get('http://localhost:5001/stats')
        .then(res => {
            console.log("✅ Stats:", res.data);
        })
        .catch(err => {
            console.error("❌ Failed to fetch stats:", err.message);
        });
}

function openDashboard() {
  const win = new BrowserWindow({
    width: 500,
    height: 500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  win.loadFile('dashboard.html');
}


function createTray() {
    const iconPath = path.join(__dirname, 'iconTemplate.png');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

    tray = new Tray(icon);
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Pause/Resume Reminders', click: togglePause },
        { label: 'Show Stats', click: showStats },
        { label: 'Quit', click: () => app.quit() },
        { label: 'Open Dashboard', click: openDashboard },
    ]);
    tray.setToolTip('FocusBae is running');
    tray.setContextMenu(contextMenu);
}


app.whenReady().then(createTray);
