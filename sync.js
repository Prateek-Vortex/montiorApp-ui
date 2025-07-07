const fs = require("fs");
const path = require("path");
const axios = require("axios");

function getStoredToken() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "token.json"), "utf-8");
    const { token } = JSON.parse(raw);
    return token;
  } catch {
    return null;
  }
}

function readScreenLog() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "backend", "data", "focusbae_screenlog.json"), "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function generateDailySummary(log) {
  const usage = {};
  let reminders = 0;

  log.forEach(entry => {
    if (entry.activity === "Active screen") {
      usage[entry.detail] = (usage[entry.detail] || 0) + 60; // seconds
    }
    if (entry.activity === "Reminder shown") {
      reminders++;
    }
  });

  return {
    date: new Date().toISOString().split("T")[0],
    app_usage: Object.fromEntries(
      Object.entries(usage).map(([app, secs]) => [app, Math.round(secs / 60)])
    ),
    reminders_sent: reminders
  };
}

function syncToCloud() {
  const token = getStoredToken();
  if (!token) return console.log("❌ No token, skipping sync");

  const log = readScreenLog();
  const data = generateDailySummary(log);

  axios.post("https://focusbee-cloud.onrender.com/sync/", data, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
  .then(() => console.log("✅ Synced to cloud"))
  .catch(err => console.error("❌ Sync failed", err.message));
}

module.exports = { syncToCloud };

