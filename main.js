const { app, Menu, Tray, nativeImage, BrowserWindow, ipcMain, globalShortcut, Notification, screen, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn } = require('child_process');
const { syncToCloud } = require('./sync');
const ClipboardManager = require('./clipboard-manager');

let tray = null;
let clipboardManager = null;
let isPaused = false;
let backendProcess = null;
let sidebarWindow = null;



// 🧠 Custom protocol handler
function handleCustomProtocol(rawUrl) {
  const url = new URL(rawUrl);
  const action = url.hostname;

  if (action === "auth-success") {
    const code = url.searchParams.get("code");
    if (code) {
      axios.post("https://focusbee-cloud.onrender.com/auth/exchange-code", { code })
        .then(res => {
          fs.writeFileSync(path.join(__dirname, "token.json"), JSON.stringify({ token: res.data.access_token }));
          console.log("✅ Token stored!");
          const notification = new Notification({
            title: "FocusBae",
            body: "Login successful",
            silent: false
          });
          notification.show();
        })
        .catch(err => {
          console.error("❌ Token exchange failed:", err.message);
        });
    }
  }

  if (action === "config") {
    const theme = url.searchParams.get("theme");
    const sync = url.searchParams.get("sync");
    const settings = { theme, sync };
    fs.writeFileSync(path.join(__dirname, "user_config.json"), JSON.stringify(settings, null, 2));
    console.log("✅ Config saved:", settings);
  }
}

// 🔐 Handle protocol before app ready (Windows)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
else {
  app.on('second-instance', (event, argv) => {
    const deeplink = argv.find(arg => arg.startsWith("focusbae://"));
    if (deeplink) handleCustomProtocol(deeplink);
  });

  if (process.platform === 'win32') {
    const deeplink = process.argv.find(arg => arg.startsWith("focusbae://"));
    if (deeplink) app.deepLink = deeplink;
  }
}
process.on('uncaughtException', (err) => {
  console.error("❌ Uncaught Exception:", err);
});
// 🖥️ App lifecycle
app.whenReady().then(() => {
  if (!app.isDefaultProtocolClient("focusbae")) {
    const registered = app.setAsDefaultProtocolClient("focusbae");
    console.log(`🔗 Protocol registration: ${registered}`);
  }

  if (process.platform === 'win32' && app.deepLink) {
    handleCustomProtocol(app.deepLink);
  }

  launchFocusEngine();

  clipboardManager = new ClipboardManager();
  clipboardManager.initialize();

  clipboardManager.on = (event) => {
    if (event === 'historyChanged') {
      tray.setContextMenu(Menu.buildFromTemplate(getTrayMenuTemplate()));
    }
  };

  createTray();

  setInterval(syncToCloud, 15 * 60 * 1000);
  setInterval(triggerSmartReminder, 45 * 60 * 1000);
});

// macOS: protocol handler
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleCustomProtocol(url);
});

app.on("window-all-closed", (event) => event.preventDefault());

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  clipboardManager?.cleanup();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createTray();
});

// 🧠 Focus engine
function launchFocusEngine() {
  const enginePath = path.join(__dirname, 'backend', 'focus_engine.py');
  const python = process.platform === 'win32' ? 'python' : 'python3';
  backendProcess = spawn(python, [enginePath]);

  backendProcess.stdout?.on("data", data => console.log(`🐍 Python: ${data.toString()}`));
  backendProcess.stderr?.on("data", data => console.error(`🐍 Python error: ${data.toString()}`));

  app.on('before-quit', () => {
    backendProcess?.kill();
    console.log("👋 Killed Python focus engine.");
  });
}

// 📦 Tray
function createTray() {
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('FocusBae is running');
  tray.setContextMenu(Menu.buildFromTemplate(getTrayMenuTemplate()));
}

function getTrayMenuTemplate() {
  return [
    { label: 'Pause/Resume Reminders', click: togglePause },
    { label: 'Show Stats', click: showStats },
    { label: 'Open Dashboard', click: openDashboard },
    { label: 'Login', click: openAuthWindow },
    { label: 'Focus Summary', click: getFocusSummary },
    { label: '🧠 Talk to Focus Assistant', click: openSidebarChat },
    { label: '💡 Get Focus Tip Now', click: triggerSmartReminder },
    { type: 'separator' },
    ...clipboardManager.createMenuItems(),
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ];
}

// 📤 API Functions
function getStoredToken() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'token.json'), 'utf-8');
    return JSON.parse(raw).token;
  } catch {
    return null;
  }
}

ipcMain.handle('store-token', (_, token) => {
  fs.writeFileSync(path.join(__dirname, 'token.json'), JSON.stringify({ token }));
});
ipcMain.handle('get-token', () => getStoredToken());

// 🧠 Reminders & Views
function togglePause() {
  const statsPath = path.join(__dirname, 'backend', 'focus_stats.json');
  let stats = {};
  try { stats = JSON.parse(fs.readFileSync(statsPath, 'utf-8')); } catch {}
  stats.paused = !stats.paused;
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`🔁 Reminders ${stats.paused ? 'paused' : 'resumed'}`);
}

function showStats() {
  try {
    const stats = JSON.parse(fs.readFileSync(path.join(__dirname, 'backend', 'focus_stats.json'), 'utf-8'));
    console.log("✅ Stats:", stats);
  } catch (err) {
    console.error("❌ Failed to fetch stats:", err.message);
  }
}

function openDashboard() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile('dashboard.html');
}

function getFocusSummary() {
  const token = getStoredToken();
  if (!token) return console.log("❌ No token found.");

  fetch("https://focusbee-cloud.onrender.com/focus/me/focus-summary", {
    headers: { "Authorization": `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(data => {
      const notification = new Notification({
        title: "🧠 Focus Summary",
        body: data.summary,
        silent: false
      });
      notification.show();
    })
    .catch(err => console.error("❌ Failed to fetch focus summary:", err.message));
}

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

function openSidebarChat() {
  if (sidebarWindow) return sidebarWindow.focus();

  const primaryDisplay = screen.getPrimaryDisplay();
  const width = 380;
  const height = primaryDisplay.workAreaSize.height;
  const x = primaryDisplay.workArea.x + primaryDisplay.workArea.width - width;
  const y = primaryDisplay.workArea.y;

  const isFullscreen = primaryDisplay.bounds.height > primaryDisplay.workAreaSize.height;

  sidebarWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: !isFullscreen,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  sidebarWindow.setAlwaysOnTop(true, 'screen-saver');
  sidebarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  sidebarWindow.on('blur', () => {
    if (!sidebarWindow.isFullScreen()) sidebarWindow.close();
  });

  sidebarWindow.on('closed', () => sidebarWindow = null);

  sidebarWindow.loadFile("sidebar.html");
}

ipcMain.on('close-sidebar', () => {
  sidebarWindow?.close();
});

// function openAuthWindow() {
//   const win = new BrowserWindow({
//     width: 400,
//     height: 300,
//     webPreferences: {
//       preload: path.join(__dirname, 'preload.js')
//     }
//   });
//   win.loadFile('auth.html');
// }

function openAuthWindow() {
  const authURL = "http://localhost:3000/login?redirectToApp=true";
  shell.openExternal(authURL);
}

function triggerSmartReminder() {
  const token = getStoredToken();
  if (!token) return console.log("❌ No token found for smart reminder.");

  fetch("https://focusbee-cloud.onrender.com/focus/reminder-tip", {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(data => {
      if (data.tip) {
        const notification = new Notification({
          title: "🧠 Focus Tip",
          body: data.tip,
          silent: false
        });
        notification.show();
      }
    })
    .catch(err => console.error("❌ Failed to get reminder tip:", err.message));
}
