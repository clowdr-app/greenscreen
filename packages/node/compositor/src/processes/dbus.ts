import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { logger } from "../util/logger";

export async function startDBus(): Promise<void> {
    try {
        const dbusLogger = logger.child({ module: "dbus" });
        const dbusProcess = spawn("dbus-daemon", ["--config-file=/usr/share/dbus-1/system.conf", "--print-address"], {
            shell: false,
        });
        const rlStdout = createInterface(dbusProcess.stdout);
        const rlStderr = createInterface(dbusProcess.stderr);
        rlStdout.on("line", (msg) => dbusLogger.info(msg));
        rlStderr.on("line", (msg) => (msg.startsWith("E:") ? dbusLogger.error(msg) : dbusLogger.warn(msg)));
        dbusProcess.on("close", (code, signal) => {
            logger.info({ code, signal }, "DBus close");
            // rlStdout.close();
            // rlStderr.close();
        });
        dbusProcess.on("disconnect", () => {
            dbusLogger.info("DBus disconnect");
        });
        dbusProcess.on("error", (err) => {
            dbusLogger.error({ err }, "DBus error");
        });
        dbusProcess.on("exit", (code, signal) => {
            dbusLogger.info({ code, signal }, "DBus exit");
        });
        dbusProcess.on("message", (msg, _handle) => {
            dbusLogger.info({ msg }, "DBus message");
        });
        dbusProcess.on("spawn", () => {
            dbusLogger.info("DBus spawn");
        });
    } catch (err) {
        logger.error({ err }, "Failed to launch DBus");
        throw new Error("Failed to launch DBus");
    }
}
