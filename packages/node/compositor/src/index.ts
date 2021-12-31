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

    interpret(compositorMachine, { devTools: config.enableXStateInspector })
        .onTransition((state) => logger.info(state.value))
        .start();
}

logger.info("Starting compositor");
main().catch((err) => {
    logger.error({ err });
    return 1;
});
