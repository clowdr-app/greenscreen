import * as ws from "ws";
import type { ActorRefFrom } from "xstate";
import * as xstate from "xstate";
import { createMachine, interpret } from "xstate";
import { resolveConfig } from "./config";
import type { ChromiumEvent, ChromiumMachine } from "./processes/chromium";
import { createChromiumMachine } from "./processes/chromium";
import type { FFmpegEvent, FFmpegMachine } from "./processes/ffmpeg";
import { createFFmpegMachine } from "./processes/ffmpeg";
import type { PulseAudioEvent, PulseAudioMachine } from "./processes/pulseaudio";
import { createPulseAudioMachine } from "./processes/pulseaudio";
import type { XvfbEvent, XvfbMachine } from "./processes/xvfb";
import { createXvfbMachine } from "./processes/xvfb";
import { logger } from "./util/logger";
import { sleep } from "./util/sleep";

// const args = arg({
//     "--sleep": Boolean,
// });

export const display = process.env.DISPLAY ?? "1";
logger.info({ display }, "Display number");

interface CompositorContext {
    xvfbMachine: ActorRefFrom<XvfbMachine> | null;
    pulseAudioMachine: ActorRefFrom<PulseAudioMachine> | null;
    chromiumMachine: ActorRefFrom<ChromiumMachine> | null;
    ffmpegMachine: ActorRefFrom<FFmpegMachine> | null;
}

type CompositorEvent = { type: "CAPTURE" };

async function main(): Promise<void> {
    const config = resolveConfig();

    if (config.enableXStateInspector) {
        const server = await import("@xstate/inspect/lib/server");
        server.inspect({
            server: new ws.Server({
                port: 8888,
            }),
        });
        logger.info("XState inspector created");
    }
    const xvfbMachine = createXvfbMachine(display);
    const pulseAudioMachine = createPulseAudioMachine(display);
    const chromiumMachine = createChromiumMachine(display);
    const ffmpegMachine = createFFmpegMachine(display);

    const compositorMachine = createMachine<
        CompositorContext,
        CompositorEvent | XvfbEvent | PulseAudioEvent | ChromiumEvent | FFmpegEvent
    >({
        id: "compositor",
        description: "Compositor state machine",
        initial: "startingXvfb",
        context: {
            xvfbMachine: null,
            pulseAudioMachine: null,
            chromiumMachine: null,
            ffmpegMachine: null,
        },
        states: {
            startingXvfb: {
                entry: xstate.assign({
                    xvfbMachine: (_context) =>
                        xstate.spawn(xvfbMachine, {
                            name: "xvfb",
                        }),
                }),
                on: {
                    "XVFB.STARTED": {
                        target: "startingPulseAudio",
                    },
                },
            },
            startingPulseAudio: {
                entry: xstate.assign({
                    pulseAudioMachine: (_context) =>
                        xstate.spawn(pulseAudioMachine, {
                            name: "pulseAudio",
                        }),
                }),
                on: {
                    "PULSEAUDIO.STARTED": {
                        target: "startingChromium",
                    },
                },
            },
            startingChromium: {
                entry: xstate.assign({
                    chromiumMachine: (_context) =>
                        xstate.spawn(chromiumMachine, {
                            name: "chromium",
                        }),
                }),
                on: {
                    "CHROMIUM.STARTED": {
                        target: "ready",
                    },
                },
            },
            ready: {
                on: {
                    CAPTURE: {
                        target: "capturing",
                    },
                },
            },
            capturing: {
                entry: xstate.assign({
                    ffmpegMachine: (_context) =>
                        xstate.spawn(ffmpegMachine, {
                            name: "ffmpeg",
                        }),
                }),
                on: {
                    "FFMPEG.STOPPED": {
                        target: "ready",
                    },
                },
            },
        },
    });

    const compositor = interpret(compositorMachine, { devTools: config.enableXStateInspector })
        .onTransition((state) => logger.info(state.value))
        .start();

    compositor.onTransition((state, _event) => {
        if (state.value === "ready") {
            sleep;
        }
    });

    // parentService.send({ type: "LOCAL.WAKE" });
}

// async function main(): Promise<void> {
//     const config = resolveConfig();
//     logger.info({ NODE_OPTIONS: process.env.NODE_OPTIONS }, "Node options");

//     if (config.enableXStateInspector) {
//         const server = await import("@xstate/inspect/lib/server");
//         server.inspect({
//             server: new ws.Server({
//                 port: 8888,
//             }),
//         });
//         logger.info("XState inspector created");
//     }

//     const xvfbMachine = createXvfbMachine(display);
//     // logger.info({ machineId: xvfbMachine.id }, "Created Xvfb machine");
//     // interpret(xvfbMachine, { devTools: true })
//     //     .onTransition((state) => logger.info({ state: state.value }, "Xvfb machine transition"))
//     //     .onDone(() => logger.info("Xvfb machine done"))
//     //     .onEvent((event) => logger.info({ event }, "Xvfb event"))
//     //     .start();

//     // const initialisingStates: StateNodeConfig<CompositorContext, any, CompositorEvent | XvfbEvent> = {
//     //     initial: "startingXvfb",
//     //     states: {
//     //         startingXvfb: {
//     //             entry: assign({
//     //                 xvfbMachineRef: () => {
//     //                     logger.info("Spwaning XvfbMachine");
//     //                     return xstate.spawn(xvfbMachine);
//     //                 },
//     //             }),
//     //             on: {
//     //                 "XVFB.STARTED": {
//     //                     target: "startingPulseAudio",
//     //                 },
//     //             },
//     //             onDone: {
//     //                 target: "startingPulseAudio",
//     //                 actions: (_context, _event) => {
//     //                     logger.info("onDone Xvfb");
//     //                 },
//     //             },
//     //         },
//     //         startingPulseAudio: {},
//     //         startingChromium: {},
//     //     },
//     // };

//     const compositorMachine = createMachine<CompositorContext, CompositorEvent | XvfbEvent>({
//         id: "compositor",
//         initial: "initialising",
//         states: {
//             initialising: {
//                 entry: xstate.assign({
//                     xvfbMachineRef: () => {
//                         logger.info("Spawning XvfbMachine");
//                         return xstate.spawn(xvfbMachine);
//                     },
//                 }),
//                 // ...initialisingStates,
//             },
//             ready: {},
//             capturing: {},
//             captureFinished: {},
//         },
//     });

//     logger.info({ id: compositorMachine.id }, "Created Compositor machine");

//     interpret(compositorMachine, { devTools: config.enableXStateInspector })
//         .onTransition((state) =>
//             logger.info({ state: state.value, machineId: state?.machine?.id }, "Compositor machine transition")
//         )
//         .onDone(() => logger.info("Compositor machine done"))
//         .onEvent((event) => logger.info({ event }, "Compositor event"))
//         .onStop(() => logger.info("Compositor machine stopped"))
//         .start();

//     // await startXvfb(display);
//     // await waitXvfb(display);
//     // await startPulseAudio(display);
//     // await startChromium(display);
//     // await sleep(5000);
//     // await startFFmpeg({ displayNumber: display, outputFile: "/var/greenscreen/screen.webm" });
// }

logger.info("Starting compositor");
main().catch((err) => {
    logger.error({ err });
    return 1;
});

// }

// (async () => {
//     const browser = await puppeteer.launch({
//         executablePath: "/usr/bin/chromium",
//         args: ["--disable-dev-shm-usage"],
//     });
//     const page = await browser.newPage();
//     await page.goto("https://news.ycombinator.com", {
//         waitUntil: "networkidle2",
//     });
//     await page.pdf({ path: "/root/temp/hn.pdf", format: "a4" });

//     await browser.close();
// })();
