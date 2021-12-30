import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type pino from "pino";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import { logger } from "../util/logger";

export type PulseAudioEvent =
    | { type: "EXIT" }
    | { type: "ERROR"; data: unknown | Error }
    | { type: "PULSEAUDIO.STARTED" };

interface PulseAudioContext {
    logger: pino.Logger;
    displayNumber: string;
    error?: unknown;
    processRef?: ActorRef<PulseAudioEvent, PulseAudioProcessCommand>;
}
type PulseAudioProcessCommand = { type: "STOP" } | { type: string };
export type PulseAudioMachine = StateMachine<PulseAudioContext, any, PulseAudioEvent>;

type PulseAudioTypestate =
    | {
          value: "starting";
          context: PulseAudioContext & {
              error: undefined;
              processRef: undefined;
          };
      }
    | {
          value: "running";
          context: PulseAudioContext & {
              error: undefined;
              processRef: ActorRef<PulseAudioEvent, PulseAudioProcessCommand>;
          };
      }
    | {
          value: "error";
          context: PulseAudioContext & {
              error: unknown;
              processRef: undefined;
          };
      }
    | {
          value: "exited";
          context: PulseAudioContext & {
              error: undefined;
              processRef: undefined;
          };
      };

const startCallback: (context: PulseAudioContext) => InvokeCallback<PulseAudioProcessCommand, PulseAudioEvent> =
    (context) => (callback, onReceive) => {
        try {
            context.logger.info("Spawning PulseAudio");
            const pulseAudioProcess = spawn("pulseaudio", [], {
                shell: false,
                env: {
                    ...process.env,
                    DISPLAY: `:${context.displayNumber}.0`,
                },
            });

            onReceive((event) => {
                switch (event.type) {
                    case "STOP": {
                        context.logger.info("Terminating PulseAudio process");
                        pulseAudioProcess.kill();
                        break;
                    }
                    default: {
                        context.logger.warn({ event }, "Unknown event");
                        break;
                    }
                }
            });

            const rlStdout = createInterface(pulseAudioProcess.stdout);
            const rlStderr = createInterface(pulseAudioProcess.stderr);
            rlStdout.on("line", (msg) => context.logger.info(msg));
            rlStderr.on("line", (msg) => context.logger.error(msg));

            pulseAudioProcess.on("close", (code, signal) => {
                context.logger.info({ code, signal }, "PulseAudio close");
                callback("EXIT");
            });
            pulseAudioProcess.on("disconnect", () => {
                context.logger.info("PulseAudio disconnect");
                callback("EXIT");
            });
            pulseAudioProcess.on("error", (err) => {
                context.logger.error({ err }, "PulseAudio error");
                callback({ data: err, type: "ERROR" });
            });
            pulseAudioProcess.on("exit", (code, signal) => {
                context.logger.info({ code, signal }, "PulseAudio exit");
                callback("EXIT");
            });
            pulseAudioProcess.on("message", (msg, _handle) => {
                context.logger.info({ msg }, "PulseAudio message");
            });
            pulseAudioProcess.on("spawn", () => {
                context.logger.info("PulseAudio spawn");
            });
        } catch (err) {
            context.logger.error({ err }, "PulseAudio error");
            callback({
                data: err,
                type: "ERROR",
            });
        }
    };

export const createPulseAudioMachine = (
    displayNumber: string
): StateMachine<PulseAudioContext, any, PulseAudioEvent> => {
    const childLogger = logger.child({ module: "pulseaudio" });
    return createMachine<PulseAudioContext, PulseAudioEvent, PulseAudioTypestate>({
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
                        processRef: (context) => xstate.spawn(startCallback(context)),
                    }),
                ],
                after: {
                    2000: { target: "running" },
                },
            },
            running: {
                entry: [xstate.sendParent("PULSEAUDIO.STARTED")],
                on: {
                    EXIT: "exited",
                },
            },
            error: {
                type: "final",
            },
            exited: {
                type: "final",
            },
        },
    });
};

// export async function startPulseAudio(displayNumber: string): Promise<void> {
//     try {
//         const pulseLogger = logger.child({ module: "pulseaudio" });
//         const pulseProcess = spawn("pulseaudio", [], {
//             shell: false,
//             env: {
//                 ...process.env,
//                 DISPLAY: `:${displayNumber}.0`,
//             },
//         });
//         const rlStdout = createInterface(pulseProcess.stdout);
//         const rlStderr = createInterface(pulseProcess.stderr);
//         rlStdout.on("line", (msg) => pulseLogger.info(msg));
//         rlStderr.on("line", (msg) => (msg.startsWith("E:") ? pulseLogger.error(msg) : pulseLogger.warn(msg)));
//         pulseProcess.on("close", (code, signal) => {
//             logger.info({ code, signal }, "PulseAudio close");
//             // rlStdout.close();
//             // rlStderr.close();
//         });
//         pulseProcess.on("disconnect", () => {
//             pulseLogger.info("PulseAudio disconnect");
//         });
//         pulseProcess.on("error", (err) => {
//             pulseLogger.error({ err }, "PulseAudio error");
//         });
//         pulseProcess.on("exit", (code, signal) => {
//             pulseLogger.info({ code, signal }, "PulseAudio exit");
//         });
//         pulseProcess.on("message", (msg, _handle) => {
//             pulseLogger.info({ msg }, "PulseAudio message");
//         });
//         pulseProcess.on("spawn", () => {
//             pulseLogger.info("PulseAudio spawn");
//         });
//     } catch (err) {
//         logger.error({ err }, "Failed to launch PulseAudio");
//         throw new Error("Failed to launch PulseAudio");
//     }
// }
