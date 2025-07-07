const fs = require("fs");
const path = require("path");
const axios = require("axios");

function getStoredToken() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "token.json"), "utf-8");
    const { token } = JSON.parse(raw);
    return token;
  } catch (error) {
    console.error("❌ Error reading token:", error.message);
    return null;
  }
}

function readFocusStats() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "backend", "focus_stats.json"), "utf-8");
    const stats = JSON.parse(raw);
    console.log("📊 Focus stats loaded:", stats);
    return stats;
  } catch (error) {
    console.error("❌ Error reading focus stats:", error.message);
    return null;
  }
}

function formatSyncData(stats) {
  if (!stats) {
    console.log("❌ No stats to format");
    return null;
  }

  // Convert app usage from minutes to the format expected by your API
  const appUsage = {};
  
  // If app_usage is already in minutes, use it directly
  if (stats.app_usage) {
    Object.entries(stats.app_usage).forEach(([app, minutes]) => {
      appUsage[app] = minutes;
    });
  }

  const syncData = {
    date: new Date().toISOString().split("T")[0],
    start_time: stats.start_time || new Date().toISOString(),
    app_usage: appUsage,
    reminders_sent: stats.reminders_sent || 0,
    active_seconds: stats.active_seconds || 0,
    idle_count: stats.idle_count || 0,
    reminder_count: stats.reminder_count || 0,
    paused: stats.paused || false
  };

  console.log("📤 Formatted sync data:", syncData);
  return syncData;
}

function clearSyncedStats() {
  try {
    const statsPath = path.join(__dirname, "backend", "focus_stats.json");
    
    // Create a fresh stats object for the new session
    const freshStats = {
      start_time: new Date().toISOString(),
      app_usage: {},
      reminders_sent: 0,
      paused: false,
      active_seconds: 0,
      idle_count: 0,
      reminder_count: 0
    };
    
    // Write fresh stats to file
    fs.writeFileSync(statsPath, JSON.stringify(freshStats, null, 2));
    console.log("🗑️ Synced stats cleared and reset");
    
    return true;
  } catch (error) {
    console.error("❌ Error clearing synced stats:", error.message);
    return false;
  }
}

function backupStatsBeforeSync(stats) {
  try {
    const backupPath = path.join(__dirname, "backend", "stats_backup.json");
    const backupData = {
      timestamp: new Date().toISOString(),
      stats: stats
    };
    
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log("💾 Stats backed up before sync");
    return true;
  } catch (error) {
    console.error("❌ Error backing up stats:", error.message);
    return false;
  }
}

async function syncToCloud() {
  console.log("🔄 Starting sync to cloud...");
  
  const token = getStoredToken();
  if (!token) {
    console.log("❌ No token found, skipping sync");
    return false;
  }

  const stats = readFocusStats();
  if (!stats) {
    console.log("❌ No focus stats found, skipping sync");
    return false;
  }

  // Check if there's meaningful data to sync
  const hasData = stats.reminders_sent > 0 || 
                  Object.keys(stats.app_usage || {}).length > 0 ||
                  stats.active_seconds > 0;
  
  if (!hasData) {
    console.log("ℹ️ No meaningful data to sync, skipping");
    return false;
  }

  const syncData = formatSyncData(stats);
  if (!syncData) {
    console.log("❌ Failed to format sync data, skipping sync");
    return false;
  }

  // Backup stats before syncing
  backupStatsBeforeSync(stats);

  try {
    console.log("📡 Sending sync request to cloud...");
    
    const response = await axios.post("https://focusbee-cloud.onrender.com/sync/", syncData, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      timeout: 30000 // 30 second timeout
    });

    console.log("✅ Sync successful:", response.status);
    console.log("📊 Response data:", response.data);
    
    // Clear synced stats after successful sync
    const cleared = clearSyncedStats();
    if (cleared) {
      console.log("🧹 Local stats cleared after successful sync");
    }
    
    return true;
    
  } catch (error) {
    console.error("❌ Sync failed:");
    
    if (error.response) {
      // Server responded with error status
      console.error("   Status:", error.response.status);
      console.error("   Data:", error.response.data);
    } else if (error.request) {
      // Request was made but no response
      console.error("   No response received");
      console.error("   Request:", error.request);
    } else {
      // Something else happened
      console.error("   Error:", error.message);
    }
    
    console.log("💾 Stats preserved due to sync failure");
    return false;
  }
}

// Function to restore from backup if needed
function restoreFromBackup() {
  try {
    const backupPath = path.join(__dirname, "backend", "stats_backup.json");
    
    if (fs.existsSync(backupPath)) {
      const backupData = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
      const statsPath = path.join(__dirname, "backend", "focus_stats.json");
      
      fs.writeFileSync(statsPath, JSON.stringify(backupData.stats, null, 2));
      console.log("🔄 Stats restored from backup");
      return true;
    }
    
    console.log("❌ No backup found to restore");
    return false;
  } catch (error) {
    console.error("❌ Error restoring from backup:", error.message);
    return false;
  }
}

// Function to get sync status
function getSyncStatus() {
  const stats = readFocusStats();
  if (!stats) return { canSync: false, reason: "No stats file" };
  
  const hasData = stats.reminders_sent > 0 || 
                  Object.keys(stats.app_usage || {}).length > 0 ||
                  stats.active_seconds > 0;
  
  return {
    canSync: hasData,
    reason: hasData ? "Ready to sync" : "No data to sync",
    stats: {
      reminders: stats.reminders_sent || 0,
      apps: Object.keys(stats.app_usage || {}).length,
      activeSeconds: stats.active_seconds || 0,
      startTime: stats.start_time
    }
  };
}

// Auto-sync function that can be called periodically
async function autoSync() {
  console.log("🤖 Auto-sync triggered");
  
  const status = getSyncStatus();
  console.log("📊 Sync status:", status);
  
  if (!status.canSync) {
    console.log("⏭️ Skipping auto-sync:", status.reason);
    return false;
  }
  
  return await syncToCloud();
}

// Test function to check if sync works
async function testSync() {
  console.log("🧪 Testing sync functionality...");
  
  const token = getStoredToken();
  console.log("🔑 Token available:", !!token);
  
  const stats = readFocusStats();
  console.log("📊 Stats available:", !!stats);
  
  if (stats) {
    const syncData = formatSyncData(stats);
    console.log("📤 Sync data formatted:", !!syncData);
    
    if (syncData) {
      console.log("🎯 Sample sync data:", JSON.stringify(syncData, null, 2));
    }
  }
  
  // Show sync status
  const status = getSyncStatus();
  console.log("📊 Sync status:", status);
  
  // Try actual sync
  const result = await syncToCloud();
  console.log("🔄 Sync result:", result);
  
  return result;
}

module.exports = { 
  syncToCloud, 
  testSync, 
  autoSync, 
  getSyncStatus, 
  restoreFromBackup,
  clearSyncedStats
};