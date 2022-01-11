# Streaming tips

### Generate an RTMP source using FFmpeg and view the output with the Owncast RTMP server

```
docker run -v `pwd`/data:/app/data -p 8080:8080 -p 1935:1935 -it gabekangas/owncast:latest
ffmpeg -re -f lavfi -i testsrc=duration=30:size=qcif:rate=10 -f lavfi -i sine=frequency=1000:duration=30 -c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 160k -ar 44100 -f flv "rtmp://localhost:1935/live/abc123"
```
