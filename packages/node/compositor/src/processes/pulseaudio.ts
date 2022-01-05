import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type pino from "pino";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import { logger } from "../util/logger";

export type PulseAudioEvent =
    | { type: "EXIT" }
    | { type: "PROCESS.EXIT" }
    | { type: "PROCESS.ERROR"; data: unknown | Error }
    | { type: "PULSEAUDIO.STARTED" }
    | { type: "PULSEAUDIO.EXITED" };

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
                        if (pulseAudioProcess.kill()) {
                            callback("PROCESS.EXIT");
                        }
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
                callback("PROCESS.EXIT");
            });
            pulseAudioProcess.on("disconnect", () => {
                context.logger.info("PulseAudio disconnect");
                callback("PROCESS.EXIT");
            });
            pulseAudioProcess.on("error", (err) => {
                context.logger.error({ err }, "PulseAudio error");
                callback({ data: err, type: "PROCESS.ERROR" });
            });
            pulseAudioProcess.on("exit", (code, signal) => {
                context.logger.info({ code, signal }, "PulseAudio exit");
                if (code === 0) {
                    callback("PROCESS.EXIT");
                } else {
                    callback({ data: new Error(`PulseAudio exited with code ${code}`), type: "PROCESS.ERROR" });
                }
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
                type: "PROCESS.ERROR",
            });
        }
    };

export const createPulseAudioMachine = (
    displayNumber: string
): StateMachine<PulseAudioContext, any, PulseAudioEvent> => {
    const childLogger = logger.child({ module: "pulseaudio" });
    return createMachine<PulseAudioContext, PulseAudioEvent, PulseAudioTypestate>({
        id: "pulseaudio",
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
                        processRef: (context) => xstate.spawn(startCallback(context), { name: "pulseAudioProcess" }),
                    }),
                ],
                after: {
                    2000: { target: "running" },
                },
                on: {
                    EXIT: "exiting",
                },
            },
            running: {
                entry: [xstate.sendParent("PULSEAUDIO.STARTED")],
                on: {
                    EXIT: "exiting",
                },
            },
            exiting: {
                entry: xstate.send({ type: "STOP" }, { to: "pulseAudioProcess" }),
            },
            error: {
                type: "final",
            },
            exited: {
                entry: [xstate.actions.stop("pulseAudioProcess"), xstate.sendParent("PULSEAUDIO.EXITED")],
                type: "final",
            },
        },
    });
};
