const { app, Menu, Tray, nativeImage, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const fs = require('fs');
const { syncToCloud } = require('./sync');

let tray = null;
let isPaused = false;
let backendProcess = null;

function launchBackend() {
  const isWin = process.platform === 'win32';
  const backendBinary = isWin ? 'server.exe' : 'server';
  const backendPath = path.join(__dirname, 'backend', backendBinary);

  console.log("🚀 Launching Python backend:", backendPath);
  backendProcess = spawn(backendPath, [], {
    detached: true,
    stdio: 'ignore',
  });

  backendProcess.unref();
}

function openAuthWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 300,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });
  win.loadFile('auth.html');
}

// Store JWT in a local file
ipcMain.handle('store-token', (_, token) => {
  fs.writeFileSync(path.join(__dirname, 'token.json'), JSON.stringify({ token }));
});

ipcMain.handle('get-token', () => {
  return getStoredToken(); // reuse your existing method
});

function getStoredToken() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'token.json'), 'utf-8');
    const { token } = JSON.parse(raw);
    return token;
  } catch {
    return null;
  }
}

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

function getFocusSummary() {
  const token = getStoredToken();  // from preload or token.json

  if (!token) {
    console.log("❌ No token found.");
    return;
  }

  fetch("https://focusbee-cloud.onrender.com/focus/me/focus-summary", {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  })
  .then(res => res.json())
  .then(data => {
    console.log("🧠 Focus Summary:", data.summary);
    // Optionally: show popup or render in dashboard.html
    new Notification({
      title: "🧠 Focus Summary",
      body: data.summary
    }).show();
  })
  .catch(err => {
    console.error("❌ Failed to fetch focus summary:", err.message);
  });
}


function openChatWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 400,
    webPreferences: {
        contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // ✅ inject preload.js here
    }
  });
  win.loadFile("chat.html");
}





function createTray() {
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Pause/Resume Reminders', click: togglePause },
    { label: 'Show Stats', click: showStats },
    { label: 'Open Dashboard', click: openDashboard },
    { label: 'Quit', click: () => app.quit() },
    { label: 'Login', click: openAuthWindow },
    { label: 'Focus Summary', click: getFocusSummary },
    { label: '🧠 Talk to Focus Assistant', click: openChatWindow }
  ]);
  tray.setToolTip('FocusBae is running');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  launchBackend();
  createTray();
    console.log("🕒 Starting auto sync...");
  setInterval(syncToCloud, 15 * 60 * 1000); 
});
