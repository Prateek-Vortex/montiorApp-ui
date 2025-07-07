import threading
import time
import json
import os
from datetime import datetime
from pathlib import Path
import subprocess

# Initialize as a list to store activity entries
activity_log = []

STATS_FILE = Path(__file__).parent / "focus_stats.json"

def save_stats():
    with open(STATS_FILE, "w") as f:
        json.dump(activity_log, f, indent=2)

def load_stats():
    global activity_log
    if STATS_FILE.exists():
        with open(STATS_FILE, "r") as f:
            loaded_data = json.load(f)
            # Handle both old format (dict) and new format (list)
            if isinstance(loaded_data, list):
                activity_log = loaded_data
            else:
                # Convert old format to new format if needed
                activity_log = []
                print("⚠️  Converting old format to new activity log format")

def get_active_app_name():
    try:
        output = subprocess.check_output(
            ['osascript', '-e', 'tell application "System Events" to get name of (processes where frontmost is true)']
        )
        return output.decode('utf-8').strip()
    except Exception as e:
        print("❌ Failed to get active app:", e)
        return "Unknown"

def log_activity(activity_type, detail=""):
    """Log an activity entry with timestamp"""
    entry = {
        "timestamp": datetime.now().isoformat(),
        "activity": activity_type,
        "detail": detail
    }
    activity_log.append(entry)
    save_stats()

def reminder_loop():
    last_app = None
    idle_start = None
    
    while True:
        current_app = get_active_app_name()
        
        # Check if app changed
        if current_app != last_app:
            if last_app is not None:
                log_activity("Active screen", current_app)
            last_app = current_app
        else:
            # Same app, just log active screen periodically
            log_activity("Active screen", current_app)
        
        print(f"💧 Logged activity: {current_app}")
        time.sleep(5)  # Log every 5 seconds like in your example data

def start_idle_monitoring():
    """Monitor for idle state (this is a simplified version)"""
    # This would require additional system monitoring
    # For now, just log active screen changes
    pass

if __name__ == "__main__":
    load_stats()
    print("✅ Focus engine started...")
    print(f"📊 Current log has {len(activity_log)} entries")
    
    thread = threading.Thread(target=reminder_loop, daemon=True)
    thread.start()
    
    try:
        thread.join()
    except KeyboardInterrupt:
        print("\n🛑 Focus engine stopped")
        log_activity("Session ended", "Manual stop")