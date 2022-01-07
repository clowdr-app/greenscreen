import type { ActorRefFrom, StateMachine } from "xstate";
import * as xstate from "xstate";
import { createMachine } from "xstate";
import type { ApplicationContext } from "../config/application-context";
import type { CompositorMachine, Event } from "../processes/compositor";
import { createCompositorMachine } from "../processes/compositor";

export type TestControllerEvent = never;

interface TestControllerContext {
    compositorRef?: ActorRefFrom<CompositorMachine>;
}

// type TestControllerTypestate =
//     | {
//           value: "initialising";
//           context: TestControllerContext & {
//               compositorRef: undefined;
//           };
//       }
//     | {
//           value: "capturing";
//           context: TestControllerContext & {
//               compositorRef: ActorRefFrom<CompositorMachine>;
//           };
//       };

export function createTestController(
    applicationContext: ApplicationContext
): StateMachine<TestControllerContext, any, TestControllerEvent | Event> {
    const compositorMachine = createCompositorMachine(applicationContext);

    return createMachine<TestControllerContext, TestControllerEvent | Event>({
        id: "test-controller",
        description: "Runs the compositor in an automated self-test mode",
        initial: "initialising",
        context: {
            compositorRef: undefined,
        },
        on: {
            "COMPOSITOR.EXITED": {
                target: "finished",
            },
        },
        states: {
            initialising: {
                entry: xstate.assign({
                    compositorRef: (_context) => xstate.spawn(compositorMachine, { name: "compositor" }),
                }),
                on: {
                    "COMPOSITOR.READY": {
                        target: "capturing",
                    },
                },
            },
            capturing: {
                entry: xstate.send(
                    { type: "CAPTURE" },
                    {
                        to: "compositor",
                    }
                ),
                on: {
                    "COMPOSITOR.READY": {
                        target: "finishing",
                    },
                },
            },
            finishing: {
                entry: [xstate.send({ type: "EXIT" }, { to: "compositor" })],
            },
            finished: {
                type: "final",
            },
        },
    });
}
