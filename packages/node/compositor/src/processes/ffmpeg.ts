import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logger } from "../util/logger";

type mainOptions = {
    outputFile: string;
    promptOnOverwrite?: boolean;
    outputDuration?: string;
};

type videoOptions = {
    screenHeight?: number;
    screenWidth?: number;
    drawMouse?: boolean;
    videoInputMaxQueuedPackets?: number;
    videoCodec?: string;
    videoBitrate?: string;
};

type x11grabOptions = {
    displayNumber: string;
    screenNumber?: string;
    frameRate?: number;
};

type audioOptions = {
    audioSourceDevice?: string;
    audioChannelCount?: number;
    audioInputMaxQueuedPackets?: number;
    audioCodec?: string;
    audioBitrate?: string;
};

type outputCodecOptions = {
    videoQuantizerScaleMin?: number;
    videoQuantizerScaleMax?: number;
};

export async function startFFmpeg({
    outputFile,
    promptOnOverwrite = false,
    outputDuration = "00:01:00",
    displayNumber,
    screenNumber = "0",
    drawMouse = false,
    frameRate = 30,
    screenHeight = 720,
    screenWidth = 0,
    videoInputMaxQueuedPackets = 512,
    videoCodec = "libvpx",
    videoBitrate = "384k",
    videoQuantizerScaleMin = 10,
    videoQuantizerScaleMax = 42,
    audioSourceDevice = "default",
    audioChannelCount = 2,
    audioInputMaxQueuedPackets = 512,
    audioCodec = "libvorbis",
    audioBitrate,
}: mainOptions & videoOptions & x11grabOptions & audioOptions & outputCodecOptions): Promise<void> {
    if (screenHeight && !screenWidth) {
        screenWidth = (screenHeight * 16) / 9;
    }

    const videoInputArgs: string[] = [
        ...["-f", "x11grab"],
        ...["-draw_mouse", drawMouse ? "1" : "0"],
        ...(frameRate ? ["-framerate", frameRate.toString()] : []),
        ...(screenHeight ? ["-s", `${screenWidth}x${screenHeight}`] : []),
        ...(videoInputMaxQueuedPackets ? ["-thread_queue_size", videoInputMaxQueuedPackets.toString()] : []),
        ...["-i", `:${displayNumber}.${screenNumber}`],
    ];

    const audioInputArgs: string[] = [
        ...["-f", "pulse"],
        ...(audioChannelCount ? ["-ac", audioChannelCount.toString()] : []),
        ...(audioInputMaxQueuedPackets ? ["-thread_queue_size", audioInputMaxQueuedPackets.toString()] : []),
        ...["-i", audioSourceDevice],
    ];

    const videoOutputArgs: string[] = [
        ...(videoCodec ? ["-c:v", videoCodec] : []),
        ...(videoBitrate ? ["-b:v", videoBitrate] : []),
        ...(videoQuantizerScaleMin ? ["-qmin", videoQuantizerScaleMin.toString()] : []),
        ...(videoQuantizerScaleMax ? ["-qmax", videoQuantizerScaleMax.toString()] : []),
    ];

    const audioOutputArgs: string[] = [
        ...(audioCodec ? ["-c:a", audioCodec] : []),
        ...(audioBitrate ? ["-b:a", audioBitrate] : []),
    ];

    // outputFile is not included, so that it is not logged, as stream key may be included
    const outputArgs: string[] = [
        ...videoOutputArgs,
        ...audioOutputArgs,
        ...(outputDuration ? ["-t", outputDuration] : []),
    ];

    const ffmpegArgsNonSecret: string[] = [
        ...(promptOnOverwrite ? [] : ["-y"]),
        ...videoInputArgs,
        ...audioInputArgs,
        ...outputArgs,
    ];

    try {
        const ffmpegLogger = logger.child({ module: "ffmpeg" });
        ffmpegLogger.info({ ffmpegArgsNonSecret }, "launching ffmpeg with arguments");
        const ffmpegProcess = spawn("ffmpeg", [...ffmpegArgsNonSecret, outputFile], {
            shell: false,
            env: {
                ...process.env,
                DISPLAY: displayNumber,
            },
        });
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
        const msg = "Failed to launch ffmpeg";
        logger.error({ err }, msg);
        throw new Error(msg);
    }
}
