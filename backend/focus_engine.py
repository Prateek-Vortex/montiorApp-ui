# backend/focus_engine.py
import threading
import time
import json
import os
from datetime import datetime
from pathlib import Path
import subprocess

stats = {
    "start_time": datetime.now().isoformat(),
    "app_usage": {},
    "reminders_sent": 0,
    "paused": False,
    "active_seconds": 0,
    "idle_count": 0,
    "reminder_count": 0
}

STATS_FILE = Path(__file__).parent / "focus_stats.json"

def save_stats():
    with open(STATS_FILE, "w") as f:
        json.dump(stats, f, indent=2)

def load_stats():
    global stats
    if STATS_FILE.exists():
        with open(STATS_FILE, "r") as f:
            loaded_stats = json.load(f)
            stats.update(loaded_stats)

def get_active_app_name():
    try:
        output = subprocess.check_output(
            ['osascript', '-e', 'tell application "System Events" to get name of (processes where frontmost is true)']
        )
        return output.decode('utf-8').strip()
    except Exception as e:
        print("❌ Failed to get active app:", e)
        return "Unknown"

def get_idle_time():
    """Get system idle time in seconds"""
    try:
        output = subprocess.check_output([
            'ioreg', '-c', 'IOHIDSystem'
        ])
        for line in output.decode('utf-8').split('\n'):
            if 'HIDIdleTime' in line:
                idle_ns = int(line.split('=')[1].strip())
                return idle_ns / 1000000000  # Convert nanoseconds to seconds
        return 0
    except Exception as e:
        print("❌ Failed to get idle time:", e)
        return 0

def is_system_idle(threshold_seconds=60):
    """Check if system has been idle for more than threshold seconds"""
    idle_time = get_idle_time()
    return idle_time > threshold_seconds

def reminder_loop():
    last_app = None
    was_idle = False
    idle_start_time = None
    
    while True:
        if not stats["paused"]:
            current_idle = is_system_idle(60)  # 60 seconds idle threshold
            
            if current_idle and not was_idle:
                # Just became idle
                idle_start_time = time.time()
                stats["idle_count"] += 1
                print("😴 System became idle")
                was_idle = True
                
            elif not current_idle and was_idle:
                # Just became active
                if idle_start_time:
                    idle_duration = time.time() - idle_start_time
                    print(f"⚡ System became active after {idle_duration:.1f}s idle")
                was_idle = False
                idle_start_time = None
                
            elif not current_idle:
                # System is active
                app = get_active_app_name()
                
                # Track app usage in minutes
                if app not in stats["app_usage"]:
                    stats["app_usage"][app] = 0
                stats["app_usage"][app] += 1  # Each loop = 1 minute of usage
                
                # Track active seconds
                stats["active_seconds"] += 60
                
                # Send reminder (every minute when active)
                stats["reminders_sent"] += 1
                stats["reminder_count"] += 1
                
                # Log app switch if changed
                if app != last_app:
                    print(f"📱 App switched to: {app}")
                    last_app = app
                else:
                    print(f"💧 Active in: {app}")
                
                save_stats()
        
        time.sleep(60)  # Check every minute

def reset_daily_stats():
    """Reset stats for a new day"""
    global stats
    stats = {
        "start_time": datetime.now().isoformat(),
        "app_usage": {},
        "reminders_sent": 0,
        "paused": False,
        "active_seconds": 0,
        "idle_count": 0,
        "reminder_count": 0
    }
    save_stats()
    print("🔄 Daily stats reset")

def get_current_stats():
    """Get current stats for external access"""
    return stats.copy()

if __name__ == "__main__":
    load_stats()
    print("✅ Focus engine started...")
    print(f"📊 Current session: {stats['reminders_sent']} reminders sent")
    
    thread = threading.Thread(target=reminder_loop, daemon=True)
    thread.start()
    
    try:
        thread.join()
    except KeyboardInterrupt:
        print("\n🛑 Focus engine stopped")
        save_stats()