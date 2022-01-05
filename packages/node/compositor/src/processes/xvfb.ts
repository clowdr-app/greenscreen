import { waitUntil } from "async-wait-until";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type pino from "pino";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { assign, createMachine } from "xstate";
import { logger } from "../util/logger";
import { pathExists } from "../util/path-exists";

export type XvfbEvent =
    | { type: "EXIT" }
    | { type: "PROCESS.EXIT" }
    | { type: "PROCESS.ERROR"; data: unknown | Error }
    | { type: "XVFB.STARTED" }
    | { type: "XVFB.EXITED" };
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
                        if (xvfbProcess.kill()) {
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

            const rlStdout = createInterface(xvfbProcess.stdout);
            const rlStderr = createInterface(xvfbProcess.stderr);
            rlStdout.on("line", (msg) => context.logger.info(msg));
            rlStderr.on("line", (msg) => context.logger.error(msg));

            xvfbProcess.on("close", (code, signal) => {
                context.logger.info({ code, signal }, "Xvfb close");
                callback("PROCESS.EXIT");
            });
            xvfbProcess.on("disconnect", () => {
                context.logger.info("Xvfb disconnect");
                callback("PROCESS.EXIT");
            });
            xvfbProcess.on("error", (err) => {
                context.logger.error({ err }, "Xvfb error");
                callback({ data: err, type: "PROCESS.ERROR" });
            });
            xvfbProcess.on("exit", (code, signal) => {
                context.logger.info({ code, signal }, "Xvfb exit");
                if (code === 0) {
                    callback("PROCESS.EXIT");
                } else {
                    callback({ data: new Error(`Xvfb exited with code ${code}`), type: "PROCESS.ERROR" });
                }
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
                type: "PROCESS.ERROR",
            });
        }
    };

export const createXvfbMachine = (displayNumber: string): StateMachine<XvfbContext, any, XvfbEvent> => {
    const childLogger = logger.child({ module: "xvfb" });
    return createMachine<XvfbContext, XvfbEvent, XvfbTypestate>(
        {
            id: "xvfb",
            initial: "validating",
            context: {
                displayNumber,
                logger: childLogger,
            },
            on: {
                "PROCESS.EXIT": "exited",
                "PROCESS.ERROR": {
                    target: "error",
                    actions: assign({
                        error: (_context, event) => event.data,
                    }),
                },
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
                    on: {
                        EXIT: "exiting",
                    },
                },
                starting: {
                    entry: [
                        assign({
                            processRef: (context) => xstate.spawn(startCallback(context), { name: "xvfbProcess" }),
                        }),
                    ],
                    invoke: {
                        id: "waitLock",
                        src: (_context, _event) =>
                            waitUntil(() => pathExists(`/tmp/.X${displayNumber}-lock`), {
                                timeout: 15000,
                            }),
                        onDone: "running",
                        onError: {
                            target: "error",
                            actions: assign({
                                error: (_context, event) => event.data,
                            }),
                        },
                    },
                    on: {
                        EXIT: "exiting",
                    },
                },
                running: {
                    entry: [xstate.sendParent("XVFB.STARTED")],
                    on: {
                        EXIT: "exiting",
                    },
                },
                exiting: {
                    entry: xstate.send({ type: "STOP" }, { to: "xvfbProcess" }),
                },
                error: {
                    type: "final",
                },
                exited: {
                    entry: [xstate.actions.stop("xvfbProcess"), xstate.sendParent("XVFB.EXITED")],
                    type: "final",
                },
            },
        },
        {}
    );
};
