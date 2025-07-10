const { app, Menu, Tray, nativeImage, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { spawn, execSync } = require('child_process');
const { syncToCloud } = require('./sync');
const { Notification } = require('electron');
const ClipboardManager = require('./clipboard-manager');

let tray = null;
let isPaused = false;
let clipboardManager = null;

app.on('window-all-closed', (event) => {
  // Prevent quitting the app when all windows are closed (except on explicit quit)
  event.preventDefault();
});

// function getActiveAppBundleId() {
//   try {
//     const bundleId = execSync(`osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'`).toString().trim();
//     return bundleId;
//   } catch (err) {
//     console.error('❌ Failed to get active app bundle id:', err.message);
//     return null;
//   }
// }

// let lastFocusedApp = null;

// ipcMain.handle('paste-in-previous-app', () => {
//   if (lastFocusedApp && process.platform === 'darwin') {
//     // Reactivate previous app and paste
//     const script = `
//       tell application "System Events"
//         set frontmost of (first process whose bundle identifier is "${lastFocusedApp}") to true
//         delay 0.1
//         keystroke "v" using {command down}
//       end tell
//     `;
//     execSync(`osascript -e '${script}'`);
//     console.log('📥 Pasted in previous app');
//   }
// });

function launchFocusEngine() {
  const enginePath = path.join(__dirname, 'backend', 'focus_engine.py');

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
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js') // ✅ Add this line!
    }
  });

  win.loadFile('dashboard.html');
  
  // Optional: Open dev tools for debugging
  // win.webContents.openDevTools();
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
    console.log("🧠 Focus Summary:", data.summary);
    
    // ✅ Use Electron's Notification constructor
    const notification = new Notification({
      title: "🧠 Focus Summary",
      body: data.summary,
      silent: false
    });
    
    notification.show();
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

let sidebarWindow = null;

function isAnyDisplayFullscreen() {
  const { screen } = require('electron');
  // This checks if any display has a fullscreen window (macOS only)
  return screen.getAllDisplays().some(display => display.bounds.height === screen.getPrimaryDisplay().workAreaSize.height);
}

function openSidebarChat() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const width = 380;
  const height = primaryDisplay.workAreaSize.height;
  const x = primaryDisplay.workArea.x + primaryDisplay.workArea.width - width;
  const y = primaryDisplay.workArea.y;

  if (sidebarWindow) {
    sidebarWindow.focus();
    return;
  }

  // Detect fullscreen: if workArea.height < bounds.height, then not fullscreen
//   const isFullscreen = screen.getAllDisplays().some(display =>
//   display.bounds.height > display.workAreaSize.height
// );

  const isFullscreen = isAnyDisplayFullscreen();
  sidebarWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: !isFullscreen, // Transparent if not fullscreen
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

  // Only close on blur if not in fullscreen
  sidebarWindow.on('blur', () => {
    if (!sidebarWindow.isFullScreen()) {
      sidebarWindow.close();
    }
  });

  sidebarWindow.on('closed', () => {
    sidebarWindow = null;
  });

  sidebarWindow.loadFile("sidebar.html");
}
// Listen for close-sidebar from renderer
ipcMain.on('close-sidebar', () => {
  if (sidebarWindow) {
    sidebarWindow.close();
  }
});

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

function triggerSmartReminder() {
  const token = getStoredToken();
  console.log("🔔 Triggering smart reminder...");
  console.log("🔑 Using token:", token);
  
  if (!token) {
    console.log("❌ No token found for smart reminder.");
    return;
  }

  fetch("https://focusbee-cloud.onrender.com/focus/reminder-tip", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`
    }
  })
  .then(res => res.json())
  .then(data => {
    if (data.tip) {
      console.log("📢 Reminder tip received:", data.tip);
      
      // ✅ Use Electron's Notification constructor
      const notification = new Notification({
        title: "🧠 Focus Tip",
        body: data.tip,
        silent: false, // Allow sound
        urgency: 'normal' // Linux only
      });
      
      // Optional: Add click handler
      notification.on('click', () => {
        console.log('Notification clicked');
      });
      
      notification.show();
    } else {
      console.log("ℹ️ No tip returned.");
    }
  })
  .catch(err => {
    console.error("❌ Failed to get reminder tip:", err.message);
  });
}

// 🍭 Tray menu
function createTray() {
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

  tray = new Tray(icon);
  
  // Get clipboard menu items from clipboard manager
  const clipboardMenuItems = clipboardManager ? clipboardManager.createMenuItems() : [];
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Pause/Resume Reminders', click: togglePause },
    { label: 'Show Stats', click: showStats },
    { label: 'Open Dashboard', click: openDashboard },
    { label: 'Login', click: openAuthWindow },
    { label: 'Focus Summary', click: getFocusSummary },
    { label: '🧠 Talk to Focus Assistant', click: openSidebarChat },
    { label: '💡 Get Focus Tip Now', click: triggerSmartReminder },
    { type: 'separator' },
    ...clipboardMenuItems,
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]);
  
  tray.setToolTip('FocusBae is running');
  tray.setContextMenu(contextMenu);
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

// 🏁 Startup
app.whenReady().then(() => {
  launchFocusEngine();
  
  // Initialize clipboard manager
  clipboardManager = new ClipboardManager();
  clipboardManager.initialize();
  
  // Listen for clipboard changes to update tray menu
 clipboardManager.on = (event) => {
  if (event === 'historyChanged') {
   tray.setContextMenu(Menu.buildFromTemplate(getTrayMenuTemplate()));
  }
};
  
  createTray();
  console.log("🕒 Starting auto sync...");
  setInterval(syncToCloud, 15 * 60 * 1000);
  setInterval(triggerSmartReminder, 45 * 60 * 1000);
});

// Clean up on exit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (clipboardManager) {
    clipboardManager.cleanup();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createTray();
  }
});