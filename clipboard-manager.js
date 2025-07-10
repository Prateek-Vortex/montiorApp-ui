const { clipboard, BrowserWindow, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const { execSync } = require('child_process');

class ClipboardManager {
  constructor() {
    this.clipboardHistory = [];
    this.MAX_CLIPBOARD_HISTORY = 30;
    this.lastClipboardContent = '';
    this.historyPath = path.join(__dirname,'backend', 'clipboard_history.json');
    this.monitoringInterval = null;
    this.registerIpcHandlers();
  }

  static lastFocusedApp = null;

  registerIpcHandlers() {
    ipcMain.handle('copy-clipboard-item', (_, content) => {
      clipboard.writeText(content);
      this.addToHistory(content); // LRU behavior
      return true;
    });

    ipcMain.handle('get-clipboard-history', () => {
      return this.clipboardHistory;
    });

    // New: copy and paste by index
    ipcMain.handle('copy-and-paste-clipboard-item', (_, index) => {
      return this.copyItem(index);
    });
  }

  // Initialize clipboard monitoring
  initialize() {
    this.loadHistoryFromFile();
    this.startMonitoring();
    this.registerGlobalShortcuts();
    console.log('📋 Clipboard manager initialized');
  }

  // Load existing history from file
  loadHistoryFromFile() {
    try {
      const data = fs.readFileSync(this.historyPath, 'utf-8');
      this.clipboardHistory = JSON.parse(data);
      console.log(`📋 Loaded ${this.clipboardHistory.length} clipboard items from history`);
    } catch (err) {
      console.log('📋 No existing clipboard history found, starting fresh');
      this.clipboardHistory = [];
    }
  }

  // Save history to file
  saveHistoryToFile() {
    try {
      fs.writeFileSync(this.historyPath, JSON.stringify(this.clipboardHistory, null, 2));
    } catch (err) {
      console.error('❌ Failed to save clipboard history:', err);
    }
  }

  // Start monitoring clipboard changes
  startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      const currentContent = clipboard.readText();
      if (currentContent && 
          currentContent !== this.lastClipboardContent && 
          currentContent.trim() !== '') {
        this.addToHistory(currentContent);
        this.lastClipboardContent = currentContent;
      }
    }, 500); // Check every 500ms
  }

  // Stop monitoring clipboard changes
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Add content to clipboard history with LRU logic
  addToHistory(content) {
    this.clipboardHistory = this.clipboardHistory.filter(item => item.content !== content);
    this.clipboardHistory.unshift({ content, timestamp: Date.now() });
    this.clipboardHistory = this.clipboardHistory.slice(0, this.MAX_CLIPBOARD_HISTORY);
    this.saveHistoryToFile();

    if (this.on && typeof this.on === 'function') {
      this.on('historyChanged'); // emit event
    }
  }

  // Get clipboard history
  getHistory() {
    return this.clipboardHistory;
  }

  // Clear clipboard history
  clearHistory() {
    this.clipboardHistory = [];
    this.saveHistoryToFile();
    console.log('📋 Clipboard history cleared');
  }

  // Copy item to clipboard and move to top (LRU)
  async copyItem(index) {
    if (index >= 0 && index < this.clipboardHistory.length) {
      const item = this.clipboardHistory[index];
      clipboard.writeText(item.content);

      // Move to top of history (LRU)
      this.clipboardHistory.splice(index, 1);
      this.clipboardHistory.unshift(item);
      this.saveHistoryToFile();

      // macOS: Refocus previous app and paste
      if (process.platform === 'darwin' && ClipboardManager.lastFocusedApp) {
        try {
          const script = `tell application \"System Events\"\nset frontmost of (first process whose bundle identifier is \"${ClipboardManager.lastFocusedApp}\") to true\ndelay 0.1\nkeystroke \"v\" using {command down}\nend tell`;
          execSync(`osascript -e '${script}'`);
          console.log('📥 Pasted in previous app (macOS)');
        } catch (err) {
          console.error('❌ Failed to refocus and paste:', err.message);
        }
      } else {
        // ✅ Simulate paste using nut.js (fallback for other platforms)
        setTimeout(async () => {
          try {
            if (process.platform === 'darwin') {
              await keyboard.pressKey(Key.LeftMeta, Key.V);
              await keyboard.releaseKey(Key.LeftMeta, Key.V);
            } else {
              await keyboard.pressKey(Key.LeftControl, Key.V);
              await keyboard.releaseKey(Key.LeftControl, Key.V);
            }
            console.log('📥 Simulated paste after copying');
          } catch (err) {
            console.error('❌ Failed to simulate paste:', err.message);
          }
        }, 150); // small delay to ensure clipboard write
      }
      return true;
    }
    return false;
  }

  // Create menu items for tray
  createMenuItems() {
    if (this.clipboardHistory.length === 0) {
      return [{ label: 'Clipboard History (empty)', enabled: false }];
    }
    
    const historyItems = this.clipboardHistory.slice(0, 10).map((item, index) => ({
      label: `${item.content.length > 30 ? item.content.substring(0, 30) + '...' : item.content}`,
      click: () => this.copyItem(index)
    }));
    
    return [
      { label: '📋 Clipboard History', enabled: false },
      { type: 'separator' },
      ...historyItems,
      { type: 'separator' },
      { label: 'Show All History', click: () => this.showHistoryWindow() },
      { label: 'Clear History', click: () => this.clearHistory() }
    ];
  }

  // Show clipboard history window
  showHistoryWindow() {
    // Find the display nearest to the cursor
    const cursorPoint = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursorPoint);
    const width = 600;
    const height = 400;
    // Center window around cursor, but keep within display bounds
    let x = Math.max(display.bounds.x, Math.min(cursorPoint.x - width / 2, display.bounds.x + display.workArea.width - width));
    let y = Math.max(display.bounds.y, Math.min(cursorPoint.y - height / 2, display.bounds.y + display.workArea.height - height));

    // Track last focused app (macOS only)
    if (process.platform === 'darwin') {
      try {
        const bundleId = execSync(`osascript -e 'tell application "System Events" to get bundle identifier of first application process whose frontmost is true'`).toString().trim();
        // Don't store if it's our own Electron app
        if (!bundleId.includes('electron')) {
          ClipboardManager.lastFocusedApp = bundleId;
        }
      } catch (err) {
        console.error('❌ Failed to get active app bundle id:', err.message);
      }
    }

    const win = new BrowserWindow({
      width,
      height,
      x,
      y,
      show: false, // 👈 Important: create hidden
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      frame: true,
      resizable: true,
      transparent: false,
      webPreferences: {
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      }
    });

    // 👇 Critical order: first set visibility across spaces
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setAlwaysOnTop(true, 'screen-saver');

    // Then show the window (on correct desktop)
    win.once('ready-to-show', () => {
      win.show();
    });

    win.loadFile('clipboard-history.html');

    // Optional: auto-close on blur
    win.on('blur', () => {
      win.close();
    });
  }

  // Generate HTML for history window
  generateHistoryHtml() {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Clipboard History</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
          }
          .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            margin: -20px -20px 20px -20px;
            border-radius: 0 0 10px 10px;
          }
          .history-container {
            max-height: 400px;
            overflow-y: auto;
          }
          .history-item { 
            background: white;
            border: 1px solid #e0e0e0;
            margin: 10px 0;
            padding: 15px;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .history-item:hover { 
            background-color: #f8f9ff;
            border-color: #667eea;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
          }
          .timestamp { 
            font-size: 0.8em;
            color: #666;
            margin-bottom: 8px;
            font-weight: 500;
          }
          .content { 
            word-wrap: break-word;
            white-space: pre-wrap;
            line-height: 1.4;
            color: #333;
          }
          .empty-state {
            text-align: center;
            padding: 40px;
            color: #666;
          }
          .copy-hint {
            font-size: 0.9em;
            color: #888;
            margin-top: 10px;
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h2 style="margin: 0;">📋 Clipboard History</h2>
          <div style="font-size: 0.9em; opacity: 0.8; margin-top: 5px;">
            Click any item to copy it to clipboard
          </div>
        </div>
        
        <div class="history-container">
          ${this.clipboardHistory.length === 0 ? 
            '<div class="empty-state">No clipboard history available</div>' :
            this.clipboardHistory.map((item, index) => `
              <div class="history-item" onclick="copyToClipboard(\`${item.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">
                <div class="timestamp">${new Date(item.timestamp).toLocaleString()}</div>
                <div class="content">${this.escapeHtml(item.content)}</div>
              </div>
            `).join('')
          }
        </div>
        
        <div class="copy-hint">
          💡 Tip: Use Ctrl+Shift+V (or Cmd+Shift+V on Mac) to quickly access this window
        </div>
        
        <script>
          function copyToClipboard(content) {
            navigator.clipboard.writeText(content).then(() => {
              console.log('Content copied to clipboard');
              window.close();
            }).catch(err => {
              console.error('Failed to copy content:', err);
            });
          }
          
          // Add keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              window.close();
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  // Escape HTML characters
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  // Register global shortcuts
  registerGlobalShortcuts() {
    try {
      // Register clipboard history shortcut (Ctrl+Shift+V or Cmd+Shift+V)
      globalShortcut.register('CommandOrControl+Shift+V', () => {
        this.showHistoryWindow();
      });
      
      console.log('🔑 Clipboard shortcuts registered: Ctrl/Cmd + Shift + V');
    } catch (err) {
      console.error('❌ Failed to register global shortcuts:', err);
    }
  }

  // Unregister global shortcuts
  unregisterGlobalShortcuts() {
    try {
      globalShortcut.unregister('CommandOrControl+Shift+V');
      console.log('🔑 Clipboard shortcuts unregistered');
    } catch (err) {
      console.error('❌ Failed to unregister global shortcuts:', err);
    }
  }

  // Cleanup method
  cleanup() {
    this.stopMonitoring();
    this.unregisterGlobalShortcuts();
    this.saveHistoryToFile();
    console.log('📋 Clipboard manager cleaned up');
  }
}

module.exports = ClipboardManager;



