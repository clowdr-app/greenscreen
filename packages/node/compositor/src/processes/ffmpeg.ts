import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logger } from "../util/logger";

export async function startFFmpeg(displayNumber: string): Promise<void> {
    // ffmpeg -y -f x11grab -draw_mouse 0 -t 00:00:15 -s 1280x720 -i :1.0+0,0 -f pulse -ac 2 -i default -c:v libvpx -b:v 384k -qmin 10 -qmax 42 -maxrate 384k -bufsize 4000k -c:a aac -b:a 128k /root/temp/screen.webm &
    try {
        const ffmpegLogger = logger.child({ module: "ffmpeg" });
        const ffmpegProcess = spawn(
            "ffmpeg",
            [
                "-y",
                "-f",
                "x11grab",
                "-draw_mouse",
                "0",
                "-framerate",
                "30",
                "-s",
                "1280x720",
                "-thread_queue_size",
                "512",
                "-i",
                `:${displayNumber}.0+0,0`,
                "-f",
                "pulse",
                "-ac",
                "2",
                "-thread_queue_size",
                "512",
                "-i",
                "default",
                "-c:v",
                "libvpx",
                // "-cpu-used",
                // "-5",
                "-deadline",
                "realtime",
                // "-b:v",
                // "384k",
                // "-qmin",
                // "10",
                // "-qmax",
                // "42",
                // "-maxrate",
                // "384k",
                // "-bufsize",
                // "4000k",
                "-c:a",
                "libopus",
                "-b:a",
                "48k",
                // "-vbr",
                // "on",
                // "-compression_level",
                // "10",
                "-frame_duration",
                "60",
                "-t",
                "00:00:15",
                "/var/greenscreen/screen.webm",
            ],
            {
                shell: false,
                env: {
                    ...process.env,
                    DISPLAY: displayNumber,
                },
            }
        );
        const rlStdout = createInterface(ffmpegProcess.stdout);
        const rlStderr = createInterface(ffmpegProcess.stderr);
        rlStdout.on("line", (msg) => ffmpegLogger.info(msg));
        rlStderr.on("line", (msg) => ffmpegLogger.error(msg));
        ffmpegProcess.on("close", (code, signal) => {
            ffmpegLogger.info({ code, signal }, "FFmpeg close");
            // rlStdout.close();
            // rlStderr.close();
        });
        ffmpegProcess.on("disconnect", () => {
            ffmpegLogger.info("FFmpeg disconnect");
        });
        ffmpegProcess.on("error", (err) => {
            ffmpegLogger.error({ err }, "FFmpeg error");
        });
        ffmpegProcess.on("exit", (code, signal) => {
            ffmpegLogger.info({ code, signal }, "FFmpeg exit");
        });
        ffmpegProcess.on("message", (msg, _handle) => {
            ffmpegLogger.info({ msg }, "FFmpeg message");
        });
        ffmpegProcess.on("spawn", () => {
            ffmpegLogger.info("FFmpeg spawn");
        });
    } catch (err) {
        logger.error({ err }, "Failed to launch PulseAudio");
        throw new Error("Failed to launch PulseAudio");
    }
}
