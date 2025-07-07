from datetime import datetime

def log_action(event, detail=""):
    timestamp = datetime.now().isoformat(timespec="seconds")
    print(f"[{timestamp}] {event}: {detail}")
