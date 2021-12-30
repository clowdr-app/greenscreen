import { waitUntil } from "async-wait-until";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type pino from "pino";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { assign, createMachine } from "xstate";
import { logger } from "../util/logger";
import { pathExists } from "../util/path-exists";

export type XvfbEvent = { type: "EXIT" } | { type: "ERROR"; data: unknown | Error } | { type: "XVFB.STARTED" };
interface XvfbContext {
    logger: pino.Logger;
    displayNumber: string;
    error?: unknown;
    processRef?: ActorRef<XvfbEvent, XvfbProcessCommand>;
}
type XvfbProcessCommand = { type: "STOP" } | { type: string };
export type XvfbMachine = StateMachine<XvfbContext, any, XvfbEvent>;

type XvfbTypestate =
    | {
          value: "validating";
          context: XvfbContext & {
              error: undefined;
              processRef: undefined;
          };
      }
    | {
          value: "starting";
          context: XvfbContext & {
              error: undefined;
              processRef: undefined;
          };
      }
    | {
          value: "running";
          context: XvfbContext & {
              error: undefined;
              processRef: ActorRef<XvfbEvent, XvfbProcessCommand>;
          };
      }
    | {
          value: "error";
          context: XvfbContext & {
              error: unknown;
              processRef: undefined;
          };
      }
    | {
          value: "exited";
          context: XvfbContext & {
              error: undefined;
              processRef: undefined;
          };
      };

const startCallback: (context: XvfbContext) => InvokeCallback<XvfbProcessCommand, XvfbEvent> =
    (context) => (callback, onReceive) => {
        try {
            context.logger.info("Spawning Xvfb");
            const xvfbProcess = spawn(
                "Xvfb",
                [`:${context.displayNumber}`, "-screen", "0", "1280x720x24", "-nolisten", "tcp", "-nolisten", "unix"],
                {
                    shell: false,
                }
            );

            onReceive((event) => {
                switch (event.type) {
                    case "STOP": {
                        context.logger.info("Terminating Xvfb process");
                        xvfbProcess.kill();
                        break;
                    }
                    default: {
                        context.logger.warn({ event }, "Unknown event");
                        break;
                    }
                }
            });

            const rlStdout = createInterface(xvfbProcess.stdout);
            const rlStderr = createInterface(xvfbProcess.stderr);
            rlStdout.on("line", (msg) => context.logger.info(msg));
            rlStderr.on("line", (msg) => context.logger.error(msg));

            xvfbProcess.on("close", (code, signal) => {
                context.logger.info({ code, signal }, "Xvfb close");
                callback("EXIT");
            });
            xvfbProcess.on("disconnect", () => {
                context.logger.info("Xvfb disconnect");
                callback("EXIT");
            });
            xvfbProcess.on("error", (err) => {
                context.logger.error({ err }, "Xvfb error");
                callback({ data: err, type: "ERROR" });
            });
            xvfbProcess.on("exit", (code, signal) => {
                context.logger.info({ code, signal }, "Xvfb exit");
                callback("EXIT");
            });
            xvfbProcess.on("message", (msg, _handle) => {
                context.logger.info({ msg }, "Xvfb message");
            });
            xvfbProcess.on("spawn", () => {
                context.logger.info("Xvfb spawn");
            });
        } catch (err) {
            context.logger.error({ err }, "Xvfb error");
            callback({
                data: err,
                type: "ERROR",
            });
        }
    };

export const createXvfbMachine = (displayNumber: string): StateMachine<XvfbContext, any, XvfbEvent> => {
    const childLogger = logger.child({ module: "xvfb" });
    return createMachine<XvfbContext, XvfbEvent, XvfbTypestate>(
        {
            initial: "validating",
            context: {
                displayNumber,
                logger: childLogger,
            },
            onDone: {
                actions: xstate.send({ type: "STOP" }, { to: "processRef" }),
            },
            states: {
                validating: {
                    entry: [(context) => context.logger.info("Xvfb validating")],
                    invoke: {
                        id: "testLock",
                        src: async (_context, _event) => {
                            if (await pathExists(`/tmp/.X${displayNumber}-lock`)) {
                                throw new Error("Display already locked");
                            }
                        },
                        onDone: "starting",
                        onError: {
                            target: "error",
                            actions: assign({
                                error: (_context, event) => event.data,
                            }),
                        },
                    },
                },
                starting: {
                    entry: [
                        assign({
                            processRef: (context) => xstate.spawn(startCallback(context)),
                        }),
                    ],
                    invoke: {
                        id: "waitLock",
                        src: (_context, _event) => waitUntil(() => pathExists(`/tmp/.X${displayNumber}-lock`)),
                        onDone: "running",
                        onError: {
                            target: "error",
                            actions: assign({
                                error: (_context, event) => event.data,
                            }),
                        },
                    },
                },
                running: {
                    entry: [xstate.sendParent("XVFB.STARTED")],
                    on: {
                        EXIT: "exited",
                    },
                    // after: {
                    //     10000: { target: "exited" },
                    // },
                },
                error: {
                    type: "final",
                },
                exited: {
                    type: "final",
                },
            },
        },
        {}
    );
};

// export async function startXvfb(displayNumber: string): Promise<void> {
//     try {
//         const xvfbLogger = logger.child({ module: "xvfb" });
//         const xvfbProcess = spawn("Xvfb", [`:${displayNumber}`, "-screen", "0", "1280x720x24", "-nolisten", "tcp"], {
//             shell: false,
//         });
//         const rlStdout = createInterface(xvfbProcess.stdout);
//         const rlStderr = createInterface(xvfbProcess.stderr);
//         rlStdout.on("line", (msg) => xvfbLogger.info(msg));
//         rlStderr.on("line", (msg) => xvfbLogger.error(msg));
//         xvfbProcess.on("close", (code, signal) => {
//             logger.info({ code, signal }, "Xvfb close");
//         });
//         xvfbProcess.on("disconnect", () => {
//             logger.info("Xvfb disconnect");
//         });
//         xvfbProcess.on("error", (err) => {
//             logger.error({ err }, "Xvfb error");
//         });
//         xvfbProcess.on("exit", (code, signal) => {
//             logger.info({ code, signal }, "Xvfb exit");
//         });
//         xvfbProcess.on("message", (msg, _handle) => {
//             logger.info({ msg }, "Xvfb message");
//         });
//         xvfbProcess.on("spawn", () => {
//             logger.info("Xvfb spawn");
//         });
//     } catch (err) {
//         logger.error({ err }, "Failed to launch Xvfb");
//         throw new Error("Failed to launch Xvfb");
//     }
// }

// export async function waitXvfb(displayNumber: string): Promise<void> {
//     try {
//         logger.info("Awaiting X lockfile");
//         await waitUntil(() => pathExists(`/tmp/.X${displayNumber}-lock`), {
//             intervalBetweenAttempts: 1000,
//             timeout: 10000,
//         });
//         logger.info("X lockfile exists");
//     } catch (err) {
//         logger.error("X lockfile not found");
//     }
// }
