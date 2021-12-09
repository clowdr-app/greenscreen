#!/bin/sh

# _kill_procs() {
# 	kill -TERM $chromium
# 	wait $chromium
# 	# kill -TERM $xvfb
# }

# # Setup a trap to catch SIGTERM and relay it to child processes
# trap _kill_procs SIGTERM

# XVFB_WHD=${XVFB_WHD:-1280x800x16}

# # Start Xvfb
# # note - this will fail if xvfb already exists, but that's fine,
# # we don't have set -ex
# # we can keep xvfb in background, kill when pod is killed

# Xvfb :99 -ac -screen 0 $XVFB_WHD -nolisten tcp -nolisten unix &
# xvfb=$!

# export DISPLAY=:99

# chromium --no-sandbox "$@" &
# chromium=$!

# wait $chromium

# # xvfb-run -s "-screen 0 1280x800x16 -nolisten tcp -nolisten unix" -e /root/temp/xvfb.log -a chromium-browser --window-size=1280,800 --app=http://news.ycombinator.com
# ffmpeg -r 30 -f x11grab -draw_mouse 0 -s 1280x800 -i :99 -c:v libvpx -quality realtime -cpu-used 0 -b:v 384k -qmin 10 -qmax 42 -maxrate 384k -bufsize 1000k -an /root/temp/screen.webm

# echo "Starting Pulseaudio"
# pulseaudio &
# PULSE_PID=$!
# sleep 1

echo "Starting Xvfb"
Xvfb :1 -screen 0 1280x720x24 &> /dev/null &
XVFB_PID=$!
sleep 1

echo "Capturing with FFmpeg"
# ffmpeg -y -f x11grab -draw_mouse 0 -t 00:00:15 -s 1280x720 -i :1.0+0,0 -f pulse -ac 2 -i default -c:v libvpx -b:v 384k -qmin 10 -qmax 42 -maxrate 384k -bufsize 4000k -c:a aac -b:a 128k /root/temp/screen.webm &
ffmpeg -y -f x11grab -draw_mouse 0 -t 00:00:15 -s 1280x720 -i :1.0+0,0 -c:v libvpx -b:v 384k -qmin 10 -qmax 42 -maxrate 384k -bufsize 4000k /root/temp/screen.webm &
FFMPEG_PID=$!

echo "Launching Chromium"
DISPLAY=:1 DISPLAY=:1.0 chromium --autoplay-policy=no-user-gesture-required --enable-logging=stderr --v=1 --disable-gpu --user-data-dir=/tmp --window-position=0,0 --window-size=1280,720 "--app=https://shattereddisk.github.io/rickroll/rickroll.mp4" & # 2>&1 | grep -i "INFO:CONSOLE\|peer\|error" &
CHROMIUM_PID=$!

sleep infinity

echo "Stopping"


kill $FFMPEG_PID
kill $CHROMIUM_PID
kill $XVFB_PID
kill $PULSE_PID

sleep 1


kill -9 $FFMPEG_PID
kill -9 $CHROMIUM_PID
kill -9 $XVFB_PID
kill -9 $PULSE_PID

echo "DONE"