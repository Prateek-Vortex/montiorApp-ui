const { app, Menu, Tray, nativeImage, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn } = require('child_process');
const { syncToCloud } = require('./sync');

let tray = null;
let isPaused = false;

function launchFocusEngine() {
  const enginePath = path.join(__dirname, 'backend', 'tracker.py');

  const python = process.platform === 'win32' ? 'python' : 'python3';

  backendProcess = spawn(python, [enginePath]);

// Optional: log Python output
backendProcess.stdout?.on("data", (data) => {
  console.log(`🐍 Python: ${data.toString()}`);
});
backendProcess.stderr?.on("data", (data) => {
  console.error(`🐍 Python error: ${data.toString()}`);
});

// Ensure Python process is killed on app exit
app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
    console.log("👋 Killed Python focus engine.");
  }
});
}

// 🧠 Token management
ipcMain.handle('store-token', (_, token) => {
  fs.writeFileSync(path.join(__dirname, 'token.json'), JSON.stringify({ token }));
});
ipcMain.handle('get-token', () => {
  return getStoredToken();
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

// 💧 Pause/resume toggle
function togglePause() {
  const statsPath = path.join(__dirname, 'backend', 'focus_stats.json');
  let stats = {};
  try {
    stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
  } catch {}
  stats.paused = !stats.paused;
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`🔁 Reminders ${stats.paused ? 'paused' : 'resumed'}`);
}

// 📊 Get stats
function showStats() {
  const statsPath = path.join(__dirname, 'backend', 'focus_stats.json');
  try {
    const stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8'));
    console.log("✅ Stats:", stats);
  } catch (err) {
    console.error("❌ Failed to fetch stats:", err.message);
  }
}

// 🌐 Open dashboard window
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

// 📤 Focus summary from cloud
function getFocusSummary() {
  const token = getStoredToken();
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
      new Notification({
        title: "🧠 Focus Summary",
        body: data.summary
      }).show();
    })
    .catch(err => {
      console.error("❌ Failed to fetch focus summary:", err.message);
    });
}

// 💬 Chat with assistant
function openChatWindow() {
  const win = new BrowserWindow({
    width: 500,
    height: 400,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile("chat.html");
}

// 🔐 Auth window
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

// 🍭 Tray menu
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

// 🏁 Startup
app.whenReady().then(() => {
  launchFocusEngine();
  createTray();
  console.log("🕒 Starting auto sync...");
  setInterval(syncToCloud, 15 * 60 * 1000);
});
