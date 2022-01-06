import type * as pino from "pino";
import puppeteer from "puppeteer-core";
import { createInterface } from "readline";
import type { ActorRef, InvokeCallback, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import type { ApplicationContext } from "../config/application-context";

export type ChromiumEvent =
    | { type: "EXIT" }
    | { type: "PROCESS.EXIT" }
    | { type: "PROCESS.ERROR"; data: unknown | Error }
    | { type: "PROCESS.STARTED" }
    | { type: "CHROMIUM.STARTED" }
    | { type: "CHROMIUM.EXITED" };
interface ChromiumContext {
    logger: pino.Logger;
    displayNumber: number;
    error?: unknown;
    processRef?: ActorRef<ChromiumEvent, ChromiumProcessCommand>;
}
type ChromiumProcessCommand = { type: "STOP" } | { type: string };
export type ChromiumMachine = StateMachine<ChromiumContext, any, ChromiumEvent>;

type ChromiumTypestate =
    | {
          value: "starting";
          context: ChromiumContext & {
              error: undefined;
              processRef: undefined;
          };
      }
    | {
          value: "running";
          context: ChromiumContext & {
              error: undefined;
              processRef: ActorRef<ChromiumEvent, ChromiumProcessCommand>;
          };
      }
    | {
          value: "error";
          context: ChromiumContext & {
              error: unknown;
              processRef: undefined;
          };
      }
    | {
          value: "exited";
          context: ChromiumContext & {
              error: undefined;
              processRef: undefined;
          };
      };

function startCallback(context: ChromiumContext): InvokeCallback<ChromiumProcessCommand, ChromiumEvent> {
    return (callback, onReceive) => {
        // let maybeBrowser: puppeteer.Browser | null = null;
        puppeteer
            .launch({
                executablePath: "/usr/bin/chromium",
                env: {
                    ...process.env,
                    DISPLAY: `:${context.displayNumber}.0`,
                },
                headless: false,
                args: [
                    "--autoplay-policy=no-user-gesture-required",
                    // "--disable-gpu",
                    // "--use-gl=egl",
                    // "--use-gl=swiftshader",
                    "--use-gl=desktop",
                    // "--use-gl=osmesa",
                    "--user-data-dir=/tmp",
                    "--window-position=0,0",
                    "--window-size=1280,720",
                    "--enable-logging=stderr",
                    // "--no-sandbox",
                    "--v=0",
                    // "--app=https://shattereddisk.github.io/rickroll/rickroll.mp4",
                    // "--app=https://www.youtube.com/watch?v=ucZl6vQ_8Uo", // audio-video sync - one minute
                    "--app=https://www.youtube.com/watch?v=4S5KBlieT0I", // audio-video sync - 30 minutes
                    // "--app=https://webglsamples.org/field/field.html", // webgl grass demo
                    // "--app=chrome://gpu",
                ],
                // args: ["--disable-dev-shm-usage"],
            })
            .then((browser) => {
                // maybeBrowser = browser;
                onReceive((event) => {
                    switch (event.type) {
                        case "STOP": {
                            context.logger.info("Terminating Chromium");
                            browser.removeAllListeners("disconnected");
                            browser
                                .close()
                                .then(() => callback("PROCESS.EXIT"))
                                .catch((err) => context.logger.error({ err }, "Failed to close Chromium"));
                            callback("PROCESS.EXIT");

                            break;
                        }
                        default: {
                            context.logger.warn({ event }, "Unknown event");
                            break;
                        }
                    }
                });

                const proc = browser.process();
                if (proc?.stdout) {
                    const rlStdout = createInterface(proc.stdout);
                    rlStdout.on("line", (msg) => context.logger.trace(msg));
                }
                if (proc?.stderr) {
                    const rlStderr = createInterface(proc.stderr);
                    rlStderr.on("line", (msg) => context.logger.debug(msg));
                }
                browser.on("disconnected", (event) => {
                    context.logger.error({ event }, "Chromium disconnected unexpectedly");
                    callback({ type: "PROCESS.ERROR", data: new Error("Chromium disconnected unexpectedly") });
                });
                callback("PROCESS.STARTED");
            });
        return () => {
            context.logger.info("Chromium callback cleanup");
            // if (maybeBrowser) {
            // maybeBrowser.removeAllListeners("disconnected");
            // maybeBrowser
            //     .close()
            //     .then(() => {
            //         callback("PROCESS.EXIT");
            //     })
            //     .catch((err) => context.logger.error({ err }, "Failed to close Chromium"));
            // }
        };
    };
}

export function createChromiumMachine(
    applicationContext: ApplicationContext
): StateMachine<ChromiumContext, any, ChromiumEvent> {
    const logger = applicationContext.logger.child({ module: "chromium" });
    return createMachine<ChromiumContext, ChromiumEvent, ChromiumTypestate>({
        id: "chromium",
        initial: "starting",
        context: {
            displayNumber: applicationContext.config.display,
            logger,
            processRef: undefined,
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
                        processRef: (context) => xstate.spawn(startCallback(context), { name: "chromiumProcess" }),
                    }),
                ],
                on: {
                    "PROCESS.STARTED": "running",
                    EXIT: "exiting",
                },
            },
            running: {
                entry: [xstate.sendParent("CHROMIUM.STARTED")],
                on: {
                    EXIT: "exiting",
                },
            },
            exiting: {
                entry: xstate.send({ type: "STOP" }, { to: "chromiumProcess" }),
            },
            error: {
                type: "final",
            },
            exited: {
                entry: [xstate.actions.stop("chromiumProcess"), xstate.sendParent("CHROMIUM.EXITED")],
                type: "final",
            },
        },
    });
}
