import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type * as pino from "pino";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import { logger } from "../util/logger";
import type { FFmpegOptions } from "./ffmpeg-config";
import { compileOptions, makeDefaultOptions } from "./ffmpeg-config";

export type FFmpegEvent =
    | { type: "EXIT" }
    | { type: "ERROR"; data: unknown | Error }
    | { type: "FFMPEG.STARTED" }
    | { type: "FFMPEG.STOPPED" };
interface FFmpegContext {
    logger: pino.Logger;
    displayNumber: string;
    error?: unknown;
    processRef?: ActorRef<FFmpegEvent, FFmpegProcessCommand>;
}
type FFmpegProcessCommand = { type: "STOP" } | { type: string };
export type FFmpegMachine = StateMachine<FFmpegContext, any, FFmpegEvent>;

type FFmpegTypestate =
    | {
          value: "validating";
          context: FFmpegContext & {
              error: undefined;
              processRef: undefined;
          };
      }
    | {
          value: "starting";
          context: FFmpegContext & {
              error: undefined;
              processRef: undefined;
          };
      }
    | {
          value: "running";
          context: FFmpegContext & {
              error: undefined;
              processRef: ActorRef<FFmpegEvent, FFmpegProcessCommand>;
          };
      }
    | {
          value: "error";
          context: FFmpegContext & {
              error: unknown;
              processRef: undefined;
          };
      }
    | {
          value: "exited";
          context: FFmpegContext & {
              error: undefined;
              processRef: undefined;
          };
      };

const startCallback: (
    options: FFmpegOptions,
    context: FFmpegContext
) => InvokeCallback<FFmpegProcessCommand, FFmpegEvent> = (options, context) => (callback, onReceive) => {
    const args = compileOptions(options);

    try {
        context.logger.info({ args }, "launching ffmpeg with arguments");
        const ffmpegProcess = spawn("ffmpeg", args, {
            shell: false,
            env: {
                ...process.env,
                DISPLAY: options.videoInput.options.displayNumber,
            },
        });

        onReceive((event) => {
            switch (event.type) {
                case "STOP": {
                    context.logger.info("Terminating FFmpeg process");
                    ffmpegProcess.kill();
                    break;
                }
                default: {
                    context.logger.warn({ event }, "Unknown event");
                    break;
                }
            }
        });

        const rlStdout = createInterface(ffmpegProcess.stdout);
        const rlStderr = createInterface(ffmpegProcess.stderr);
        rlStdout.on("line", (msg) => context.logger.info(msg));
        rlStderr.on("line", (msg) => context.logger.error(msg));
        ffmpegProcess.on("close", (code, signal) => {
            context.logger.info({ code, signal }, "FFmpeg close");
            callback("EXIT");
            // rlStdout.close();
            // rlStderr.close();
        });
        ffmpegProcess.on("disconnect", () => {
            context.logger.info("FFmpeg disconnect");
            callback("EXIT");
        });
        ffmpegProcess.on("error", (err) => {
            context.logger.error({ err }, "FFmpeg error");
            callback({ data: err, type: "ERROR" });
        });
        ffmpegProcess.on("exit", (code, signal) => {
            context.logger.info({ code, signal }, "FFmpeg exit");
            callback("EXIT");
        });
        ffmpegProcess.on("message", (msg, _handle) => {
            context.logger.info({ msg }, "FFmpeg message");
        });
        ffmpegProcess.on("spawn", () => {
            context.logger.info("FFmpeg spawn");
        });
    } catch (err) {
        context.logger.error({ err }, "FFmpeg error");
        callback({
            data: err,
            type: "ERROR",
        });
    }
};

export const createFFmpegMachine = (displayNumber: string): StateMachine<FFmpegContext, any, FFmpegEvent> => {
    const childLogger = logger.child({ module: "ffmpeg" });
    return createMachine<FFmpegContext, FFmpegEvent, FFmpegTypestate>(
        {
            id: "ffmpeg",
            initial: "starting",
            context: {
                displayNumber,
                logger: childLogger,
            },
            onDone: {
                actions: xstate.send({ type: "STOP" }, { to: "processRef" }),
            },
            states: {
                starting: {
                    entry: [
                        xstate.assign({
                            processRef: (context) =>
                                xstate.spawn(
                                    startCallback(
                                        makeDefaultOptions("/var/greenscreen/screen.webm", context.displayNumber),
                                        context
                                    )
                                ),
                        }),
                    ],
                    after: {
                        2000: { target: "running" },
                    },
                },
                running: {
                    entry: [xstate.sendParent("FFMPEG.STARTED")],
                    on: {
                        EXIT: "exited",
                    },
                },
                error: {
                    type: "final",
                },
                exited: {
                    entry: [xstate.sendParent("FFMPEG.STOPPED")],
                    type: "final",
                },
            },
        },
        {}
    );
};

// export async function startFFmpeg({
//     outputFile,
//     promptOnOverwrite = false,
//     outputDuration = "00:01:00",
//     displayNumber,
//     screenNumber = "0",
//     drawMouse = false,
//     frameRate = 30,
//     screenHeight = 720,
//     screenWidth = 0,
//     videoInputMaxQueuedPackets = 512,
//     videoCodec = "libvpx",
//     videoBitrate = "384k",
//     videoQuantizerScaleMin = 10,
//     videoQuantizerScaleMax = 42,
//     audioSourceDevice = "default",
//     audioChannelCount = 2,
//     audioInputMaxQueuedPackets = 512,
//     audioCodec = "libvorbis",
//     audioBitrate,
// }: mainOptions & videoOptions & x11grabOptions & audioOptions & outputCodecOptions): Promise<void> {
//     if (screenHeight && !screenWidth) {
//         screenWidth = (screenHeight * 16) / 9;
//     }

//     const videoInputArgs: string[] = [
//         ...["-f", "x11grab"],
//         ...["-draw_mouse", drawMouse ? "1" : "0"],
//         ...(frameRate ? ["-framerate", frameRate.toString()] : []),
//         ...(screenHeight ? ["-s", `${screenWidth}x${screenHeight}`] : []),
//         ...(videoInputMaxQueuedPackets ? ["-thread_queue_size", videoInputMaxQueuedPackets.toString()] : []),
//         ...["-i", `:${displayNumber}.${screenNumber}`],
//     ];

//     const audioInputArgs: string[] = [
//         ...["-f", "pulse"],
//         ...(audioChannelCount ? ["-ac", audioChannelCount.toString()] : []),
//         ...(audioInputMaxQueuedPackets ? ["-thread_queue_size", audioInputMaxQueuedPackets.toString()] : []),
//         ...["-i", audioSourceDevice],
//     ];

//     const videoOutputArgs: string[] = [
//         ...(videoCodec ? ["-c:v", videoCodec] : []),
//         ...(videoBitrate ? ["-b:v", videoBitrate] : []),
//         ...(videoQuantizerScaleMin ? ["-qmin", videoQuantizerScaleMin.toString()] : []),
//         ...(videoQuantizerScaleMax ? ["-qmax", videoQuantizerScaleMax.toString()] : []),
//     ];

//     const audioOutputArgs: string[] = [
//         ...(audioCodec ? ["-c:a", audioCodec] : []),
//         ...(audioBitrate ? ["-b:a", audioBitrate] : []),
//     ];

//     const outputArgs: string[] = [
//         ...videoOutputArgs,
//         ...audioOutputArgs,
//         ...(outputDuration ? ["-t", outputDuration] : []),
//         outputFile,
//     ];

//     const ffmpegArgs: string[] = [
//         ...(promptOnOverwrite ? [] : ["-y"]),
//         ...videoInputArgs,
//         ...audioInputArgs,
//         ...outputArgs,
//     ];

//     try {
//         const ffmpegLogger = logger.child({ module: "ffmpeg" });
//         ffmpegLogger.info({ ffmpegArgs }, "launching ffmpeg with arguments");
//         const ffmpegProcess = spawn("ffmpeg", ffmpegArgs, {
//             shell: false,
//             env: {
//                 ...process.env,
//                 DISPLAY: displayNumber,
//             },
//         });
//         const rlStdout = createInterface(ffmpegProcess.stdout);
//         const rlStderr = createInterface(ffmpegProcess.stderr);
//         rlStdout.on("line", (msg) => ffmpegLogger.info(msg));
//         rlStderr.on("line", (msg) => ffmpegLogger.error(msg));
//         ffmpegProcess.on("close", (code, signal) => {
//             ffmpegLogger.info({ code, signal }, "FFmpeg close");
//             // rlStdout.close();
//             // rlStderr.close();
//         });
//         ffmpegProcess.on("disconnect", () => {
//             ffmpegLogger.info("FFmpeg disconnect");
//         });
//         ffmpegProcess.on("error", (err) => {
//             ffmpegLogger.error({ err }, "FFmpeg error");
//         });
//         ffmpegProcess.on("exit", (code, signal) => {
//             ffmpegLogger.info({ code, signal }, "FFmpeg exit");
//         });
//         ffmpegProcess.on("message", (msg, _handle) => {
//             ffmpegLogger.info({ msg }, "FFmpeg message");
//         });
//         ffmpegProcess.on("spawn", () => {
//             ffmpegLogger.info("FFmpeg spawn");
//         });
//     } catch (err) {
//         const msg = "Failed to launch ffmpeg";
//         logger.error({ err }, msg);
//         throw new Error(msg);
//     }
// }
