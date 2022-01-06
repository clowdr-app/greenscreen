import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type * as pino from "pino";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import { logger } from "../util/logger";
import type { FFmpegOptions } from "./ffmpeg-config";
import { compileOptions, makeTestFileOptions } from "./ffmpeg-config";

export type FFmpegEvent =
    | { type: "EXIT" }
    | { type: "PROCESS.EXIT" }
    | { type: "PROCESS.ERROR"; data: unknown | Error }
    | { type: "FFMPEG.STARTED" }
    | { type: "FFMPEG.EXITED" };
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
    const [args, outputFile] = compileOptions(options);

    try {
        context.logger.info({ args }, "Launching FFmpeg");
        const ffmpegProcess = spawn("ffmpeg", [...args, outputFile], {
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
            callback("PROCESS.EXIT");
            // rlStdout.close();
            // rlStderr.close();
        });
        ffmpegProcess.on("disconnect", () => {
            context.logger.info("FFmpeg disconnect");
            callback("PROCESS.EXIT");
        });
        ffmpegProcess.on("error", (err) => {
            context.logger.error({ err }, "FFmpeg error");
            callback({ data: err, type: "PROCESS.ERROR" });
        });
        ffmpegProcess.on("exit", (code, signal) => {
            context.logger.info({ code, signal }, "FFmpeg exit");
            callback("PROCESS.EXIT");
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
            type: "PROCESS.ERROR",
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
            on: {
                "PROCESS.EXIT": "exited",
                "PROCESS.ERROR": {
                    target: "error",
                    actions: xstate.assign({
                        error: (_context, event) => event.data,
                    }),
                },
            },
            states: {
                starting: {
                    entry: [
                        xstate.assign({
                            processRef: (context) =>
                                xstate.spawn(
                                    startCallback(
                                        makeTestFileOptions("/var/greenscreen/screen.mp4", context.displayNumber),
                                        context
                                    ),
                                    { name: "ffmpegProcess" }
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
                        EXIT: "exiting",
                    },
                },
                exiting: {
                    entry: xstate.send({ type: "STOP" }, { to: "ffmpegProcess" }),
                },
                error: {
                    type: "final",
                },
                exited: {
                    entry: [xstate.actions.stop("ffmpegProcess"), xstate.sendParent({ type: "FFMPEG.EXITED" })],
                    type: "final",
                },
            },
        },
        {}
    );
};
