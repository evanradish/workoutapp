#!/bin/bash
# Double-click this file on your Mac to run the app.
# It starts a small web server in this folder and opens the app in your browser.
# Your phone can use it too while it is on the same Wi-Fi: open the "Phone" address printed below.
cd "$(dirname "$0")"
PORT=8123
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "Workout app is running."
echo "  On this Mac: http://localhost:$PORT"
[ -n "$IP" ] && echo "  Phone (same Wi-Fi): http://$IP:$PORT"
echo ""
echo "Leave this window open while you use the app. Press Ctrl+C to stop."
(sleep 1; open "http://localhost:$PORT") &
python3 -m http.server $PORT
