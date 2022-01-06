import type * as pino from "pino";
import type { ActorRefFrom, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import type { ApplicationContext } from "../config/application-context";
import type { ChromiumEvent, ChromiumMachine } from "./chromium";
import { createChromiumMachine } from "./chromium";
import type { FFmpegEvent, FFmpegMachine } from "./ffmpeg";
import { createFFmpegMachine } from "./ffmpeg";
import type { PulseAudioEvent, PulseAudioMachine } from "./pulseaudio";
import { createPulseAudioMachine } from "./pulseaudio";
import type { XvfbEvent, XvfbMachine } from "./xvfb";
import { createXvfbMachine } from "./xvfb";

interface CompositorContext {
    logger: pino.Logger;
    xvfbMachine: ActorRefFrom<XvfbMachine> | null;
    pulseAudioMachine: ActorRefFrom<PulseAudioMachine> | null;
    chromiumMachine: ActorRefFrom<ChromiumMachine> | null;
    ffmpegMachine: ActorRefFrom<FFmpegMachine> | null;
}

export type CompositorEvent =
    | { type: "CAPTURE" }
    | { type: "EXIT" }
    | { type: "COMPOSITOR.EXITED" }
    | { type: "COMPOSITOR.READY" };

export type Event = CompositorEvent | XvfbEvent | PulseAudioEvent | ChromiumEvent | FFmpegEvent;
export type CompositorMachine = StateMachine<CompositorContext, any, Event>;

export function createCompositorMachine(
    applicationContext: ApplicationContext
): StateMachine<CompositorContext, any, Event> {
    const logger = applicationContext.logger.child({ module: "compositor" });
    const xvfbMachine = createXvfbMachine(applicationContext);
    const pulseAudioMachine = createPulseAudioMachine(applicationContext);
    const chromiumMachine = createChromiumMachine(applicationContext);
    const ffmpegMachine = createFFmpegMachine(applicationContext);

    return createMachine<CompositorContext, Event>({
        id: "compositor",
        description: "Compositor state machine",
        initial: "startingXvfb",
        context: {
            logger,
            xvfbMachine: null,
            pulseAudioMachine: null,
            chromiumMachine: null,
            ffmpegMachine: null,
        },
        on: {},
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
                    EXIT: {
                        target: "exiting",
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
                    EXIT: {
                        target: "exiting",
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
                    EXIT: {
                        target: "exiting",
                    },
                },
            },
            ready: {
                entry: [xstate.sendParent({ type: "COMPOSITOR.READY" })],
                on: {
                    CAPTURE: {
                        target: "capturing",
                    },
                    EXIT: {
                        target: "exiting",
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
                    "FFMPEG.EXITED": {
                        target: "ready",
                    },
                    EXIT: {
                        target: "exiting",
                    },
                },
            },
            exiting: {
                type: "compound",
                initial: "exitingFFmpeg",
                states: {
                    exitingFFmpeg: {
                        entry: xstate.send({ type: "EXIT" }, { to: "ffmpeg" }),
                        always: [
                            {
                                target: "exitingChromium",
                                cond: (context, _event) =>
                                    !context.ffmpegMachine || Boolean(context.ffmpegMachine.getSnapshot()?.done),
                            },
                        ],
                        on: {
                            "FFMPEG.EXITED": "exitingChromium",
                        },
                    },
                    exitingChromium: {
                        entry: xstate.send({ type: "EXIT" }, { to: "chromium" }),
                        on: {
                            "CHROMIUM.EXITED": "exitingPulseAudio",
                        },
                    },
                    exitingPulseAudio: {
                        entry: xstate.send({ type: "EXIT" }, { to: "pulseAudio" }),
                        on: {
                            "PULSEAUDIO.EXITED": "exitingXvfb",
                        },
                    },
                    exitingXvfb: {
                        entry: xstate.send({ type: "EXIT" }, { to: "xvfb" }),
                        on: {
                            "XVFB.EXITED": "#compositor.exited",
                        },
                    },
                },
                on: {
                    "COMPOSITOR.EXITED": {
                        target: "exited",
                    },
                },
            },
            exited: {
                entry: xstate.sendParent("COMPOSITOR.EXITED"),
                type: "final",
            },
        },
    });
}
