import * as ws from "ws";
import { interpret } from "xstate";
import { makeApplicationContext } from "./config/application-context";
import { resolveConfig } from "./config/config";
import { createTestController } from "./controller/test-controller";
import { logger } from "./util/logger";

async function main(): Promise<void> {
    const config = resolveConfig();
    const applicationContext = makeApplicationContext(config);

    if (config.enableXStateInspector) {
        const server = await import("@xstate/inspect/lib/server");
        const port = 8888;
        server.inspect({
            server: new ws.Server({
                port,
            }),
        });
        applicationContext.logger.info({ port }, "XState inspector created");
    }

    const testController = createTestController(applicationContext);

    interpret(testController, { devTools: config.enableXStateInspector })
        .onTransition((state) => applicationContext.logger.info(state.value))
        .start();
}

logger.info("Starting compositor");
main().catch((err) => {
    logger.error({ err });
    return 1;
});
