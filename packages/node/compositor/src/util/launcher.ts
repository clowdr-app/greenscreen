import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { Logger } from "pino";
import { logger } from "../util/logger";

export function launch(
    command: string,
    args: readonly string[] = [],
    extraEnv: NodeJS.ProcessEnv = {},
    commandLogger: Logger | undefined = undefined,
    spawnArgs = {}
) {
    const childLogger = commandLogger || logger.child({ module: command });
    let childProcess: ChildProcessWithoutNullStreams;
    try {
        childProcess = spawn(command, args, {
            shell: false,
            env: {
                ...process.env,
                ...extraEnv,
            },
            ...spawnArgs,
        });
        const rlStdout = createInterface(childProcess.stdout);
        const rlStderr = createInterface(childProcess.stderr);
        rlStdout.on("line", (msg) => childLogger.info(msg));
        rlStderr.on("line", (msg) => childLogger.error(msg));
        childProcess.on("disconnect", () => {
            childLogger.info("child process disconnect");
        });
        childProcess.on("error", (err) => {
            childLogger.error({ err }, "child process error");
        });
        childProcess.on("exit", (code, signal) => {
            childLogger.info({ code, signal }, "child process exit");
        });
        childProcess.on("message", (msg, _handle) => {
            childLogger.info({ msg }, "child process message");
        });
        childProcess.on("spawn", () => {
            childLogger.info("child process spawn");
        });
    } catch (err) {
        const msg = "Failed to launch ffmpeg";
        logger.error({ err }, msg);
        throw new Error(msg);
    }
    return childProcess;
}
