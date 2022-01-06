import type pino from "pino";
import { logger } from "../util/logger";
import type { Config } from "./config";

export interface ApplicationContext {
    config: Config;
    logger: pino.Logger;
}

export function makeApplicationContext(config: Config): ApplicationContext {
    logger.level = config.logLevel;
    return {
        config,
        logger,
    };
}
