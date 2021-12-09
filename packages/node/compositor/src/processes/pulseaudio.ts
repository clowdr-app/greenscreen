import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logger } from "../util/logger";

export async function startPulseAudio(displayNumber: string): Promise<void> {
    try {
        const pulseLogger = logger.child({ module: "pulseaudio" });
        const pulseProcess = spawn("pulseaudio", [], {
            shell: false,
            env: {
                ...process.env,
                DISPLAY: `:${displayNumber}.0`,
            },
        });
        const rlStdout = createInterface(pulseProcess.stdout);
        const rlStderr = createInterface(pulseProcess.stderr);
        rlStdout.on("line", (msg) => pulseLogger.info(msg));
        rlStderr.on("line", (msg) => (msg.startsWith("E:") ? pulseLogger.error(msg) : pulseLogger.warn(msg)));
        pulseProcess.on("close", (code, signal) => {
            logger.info({ code, signal }, "PulseAudio close");
            // rlStdout.close();
            // rlStderr.close();
        });
        pulseProcess.on("disconnect", () => {
            pulseLogger.info("PulseAudio disconnect");
        });
        pulseProcess.on("error", (err) => {
            pulseLogger.error({ err }, "PulseAudio error");
        });
        pulseProcess.on("exit", (code, signal) => {
            pulseLogger.info({ code, signal }, "PulseAudio exit");
        });
        pulseProcess.on("message", (msg, _handle) => {
            pulseLogger.info({ msg }, "PulseAudio message");
        });
        pulseProcess.on("spawn", () => {
            pulseLogger.info("PulseAudio spawn");
        });
    } catch (err) {
        logger.error({ err }, "Failed to launch PulseAudio");
        throw new Error("Failed to launch PulseAudio");
    }
}
