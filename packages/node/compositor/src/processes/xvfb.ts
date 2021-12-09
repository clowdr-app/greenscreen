import { waitUntil } from "async-wait-until";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logger } from "../util/logger";
import { pathExists } from "../util/path-exists";

// logger.info({ args }, "argv");
export async function startXvfb(displayNumber: string): Promise<void> {
    try {
        const xvfbLogger = logger.child({ module: "xvfb" });
        const xvfbProcess = spawn("Xvfb", [`:${displayNumber}`, "-screen", "0", "1280x720x24", "-nolisten", "tcp"], {
            shell: false,
        });
        const rlStdout = createInterface(xvfbProcess.stdout);
        const rlStderr = createInterface(xvfbProcess.stderr);
        rlStdout.on("line", (msg) => xvfbLogger.info(msg));
        rlStderr.on("line", (msg) => xvfbLogger.error(msg));
        xvfbProcess.on("close", (code, signal) => {
            logger.info({ code, signal }, "Xvfb close");
            // rlStdout.close();
            // rlStderr.close();
        });
        xvfbProcess.on("disconnect", () => {
            logger.info("Xvfb disconnect");
        });
        xvfbProcess.on("error", (err) => {
            logger.error({ err }, "Xvfb error");
        });
        xvfbProcess.on("exit", (code, signal) => {
            logger.info({ code, signal }, "Xvfb exit");
        });
        xvfbProcess.on("message", (msg, _handle) => {
            logger.info({ msg }, "Xvfb message");
        });
        xvfbProcess.on("spawn", () => {
            logger.info("Xvfb spawn");
        });
    } catch (err) {
        logger.error({ err }, "Failed to launch Xvfb");
        throw new Error("Failed to launch Xvfb");
    }
}

export async function waitXvfb(displayNumber: string): Promise<void> {
    try {
        logger.info("Awaiting X lockfile");
        await waitUntil(() => pathExists(`/tmp/.X${displayNumber}-lock`), {
            intervalBetweenAttempts: 1000,
            timeout: 10000,
        });
        logger.info("X lockfile exists");
    } catch (err) {
        logger.error("X lockfile not found");
    }
}
