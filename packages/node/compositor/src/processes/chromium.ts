import type * as pino from "pino";
import puppeteer from "puppeteer-core";
import { createInterface } from "readline";
import type { StateMachine } from "xstate";
import * as xstate from "xstate";
import { assign, createMachine } from "xstate";
import { logger } from "../util/logger";

export type ChromiumEvent = { type: "EXIT" } | { type: "ERROR"; data: unknown | Error } | { type: "CHROMIUM.STARTED" };
interface ChromiumContext {
    logger: pino.Logger;
    displayNumber: string;
    error?: unknown;
    browser?: puppeteer.Browser;
}
export type ChromiumMachine = StateMachine<ChromiumContext, any, ChromiumEvent>;

type ChromiumTypestate =
    | {
          value: "starting";
          context: ChromiumContext & {
              error: undefined;
              browser: undefined;
          };
      }
    | {
          value: "running";
          context: ChromiumContext & {
              error: undefined;
              browser: puppeteer.Browser;
          };
      }
    | {
          value: "error";
          context: ChromiumContext & {
              error: unknown;
              browser: undefined;
          };
      }
    | {
          value: "exited";
          context: ChromiumContext & {
              error: undefined;
              browser: undefined;
          };
      };

async function startChromium(logger: pino.Logger, displayNumber: string): Promise<puppeteer.Browser> {
    const browser = await puppeteer.launch({
        executablePath: "/usr/bin/chromium",
        env: {
            ...process.env,
            DISPLAY: `:${displayNumber}.0`,
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
            "--v=1",
            // "--app=https://shattereddisk.github.io/rickroll/rickroll.mp4",
            // "--app=https://www.youtube.com/watch?v=ucZl6vQ_8Uo", // audio-video sync - one minute
            "--app=https://www.youtube.com/watch?v=4S5KBlieT0I", // audio-video sync - 30 minutes
            // "--app=https://webglsamples.org/field/field.html", // webgl grass demo
            // "--app=chrome://gpu",
        ],
        // args: ["--disable-dev-shm-usage"],
    });
    const proc = browser.process();
    if (proc?.stdout) {
        const rlStdout = createInterface(proc.stdout);
        rlStdout.on("line", (msg) => logger.info(msg));
    }
    if (proc?.stderr) {
        const rlStderr = createInterface(proc.stderr);
        rlStderr.on("line", (msg) => logger.warn(msg));
    }
    return browser;
}

export function createChromiumMachine(displayNumber: string): StateMachine<ChromiumContext, any, ChromiumEvent> {
    const childLogger = logger.child({ module: "chromium" });
    return createMachine<ChromiumContext, ChromiumEvent, ChromiumTypestate>({
        initial: "starting",
        context: {
            displayNumber,
            logger: childLogger,
            browser: undefined,
        },
        states: {
            starting: {
                invoke: {
                    id: "startChromium",
                    src: (context, _event) => startChromium(context.logger, context.displayNumber),
                    onDone: {
                        target: "running",
                        actions: assign({
                            browser: (_context, event) => event.data,
                        }),
                    },
                    onError: {
                        target: "error",
                        actions: assign({
                            error: (_context, event) => event.data,
                        }),
                    },
                },
            },
            running: {
                entry: [xstate.sendParent("CHROMIUM.STARTED")],
            },
            error: {
                type: "final",
            },
            exited: {
                type: "final",
            },
        },
    });
}

// export async function startChromium(displayNumber: string): Promise<void> {
//     //--autoplay-policy=no-user-gesture-required --enable-logging=stderr --v=1 --disable-gpu --user-data-dir=/tmp --window-position=0,0 --window-size=1280,720
//     const chromiumLogger = logger.child({ module: "chromium" });
//     chromiumLogger.info("Starting Chromium");
//     const browser = await puppeteer.launch({
//         executablePath: "/usr/bin/chromium",
//         env: {
//             ...process.env,
//             DISPLAY: `:${displayNumber}.0`,
//         },
//         headless: false,

//         args: [
//             "--autoplay-policy=no-user-gesture-required",
//             // "--disable-gpu",
//             // "--use-gl=egl",
//             // "--use-gl=swiftshader",
//             "--use-gl=desktop",
//             // "--use-gl=osmesa",
//             "--user-data-dir=/tmp",
//             "--window-position=0,0",
//             "--window-size=1280,720",
//             "--enable-logging=stderr",
//             // "--no-sandbox",
//             "--v=1",
//             // "--app=https://shattereddisk.github.io/rickroll/rickroll.mp4",
//             // "--app=https://www.youtube.com/watch?v=ucZl6vQ_8Uo", // audio-video sync - one minute
//             "--app=https://www.youtube.com/watch?v=4S5KBlieT0I", // audio-video sync - 30 minutes
//             // "--app=https://webglsamples.org/field/field.html", // webgl grass demo
//             // "--app=chrome://gpu",
//         ],
//         // args: ["--disable-dev-shm-usage"],
//     });
//     chromiumLogger.info("Started Chromium");
//     const page = (await browser.pages())[0];
//     // await page.pdf({
//     //     path: "/var/greenscreen/gpu.pdf",
//     //     format: "a4",
//     // });
//     // const page = await browser.newPage();
//     // page.goto("https://news.ycombinator.com/", { waitUntil: "networkidle0", timeout: 20 * 60 * 1000 });
//     // await page.goto("chrome://gpu", { waitUntil: "networkidle0", timeout: 20 * 60 * 1000 });
//     // await page.screenshot({
//     //     fullPage: true,
//     //     path: "/var/greenscreen/gpu.png",
//     // });
//     await page.waitForSelector("ytd-consent-bump-v2-lightbox");
//     await page.$eval("ytd-consent-bump-v2-lightbox", (element) => element.parentNode?.removeChild(element));
//     await page.$eval("video", (element) => {
//         if (element instanceof HTMLVideoElement) {
//             element.play();
//         }
//     });
// }
