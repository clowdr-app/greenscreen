import * as ws from "ws";
import { interpret } from "xstate";
import { resolveConfig } from "./config";
import { createTestController } from "./controller/test-controller";
import { logger } from "./util/logger";

export const display = process.env.DISPLAY ?? "1";
logger.info({ display }, "Display number");

async function main(): Promise<void> {
    const config = resolveConfig();

    if (config.enableXStateInspector) {
        const server = await import("@xstate/inspect/lib/server");
        const port = 8888;
        server.inspect({
            server: new ws.Server({
                port,
            }),
        });
        logger.info({ port }, "XState inspector created");
    }

    const testController = createTestController(display);

    interpret(testController, { devTools: config.enableXStateInspector })
        .onTransition((state) => logger.info(state.value))
        .start();
}

logger.info("Starting compositor");
main().catch((err) => {
    logger.error({ err });
    return 1;
});
