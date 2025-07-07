from threading import Event

paused = Event()
paused.clear()

stats = {
    "active_seconds": 0,
    "idle_count": 0,
    "reminder_count": 0,
    "app_usage": {}
}
