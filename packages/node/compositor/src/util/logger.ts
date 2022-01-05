import pino from "pino";

export const logger = pino({
    level: process.env.GSC_LOG_LEVEL ?? "info",
});
