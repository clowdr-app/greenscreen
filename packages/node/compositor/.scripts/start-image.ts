import arg from "arg";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import normalizePath from "normalize-path";
import open from "open";
import { sleep } from "../src/util/sleep";

function dockerifyPath(path: string): string {
    const posixPath = normalizePath(path);
    if (posixPath.length > 1 && posixPath[1] === ":") {
        return `//${posixPath[0].toLowerCase()}${posixPath.slice(2)}`.replaceAll(" ", "\\ ");
    }
    return posixPath.replaceAll(" ", "\\ ");
}

async function main(): Promise<void> {
    const args = arg({
        "--debug": Boolean, // Enable Node.js debugging and break immediately on startup
        "--inspect-xstate": Boolean, // Enable XState inspector on port 8888
    });
    const cwd = process.cwd();
    const tempDir = join(cwd, "build", "temp");

    console.log(dockerifyPath(tempDir));

    await mkdir(tempDir, {
        recursive: true,
    });

    spawn(
        `docker`,
        [
            "run",
            "--rm",
            "-it",
            "--mount",
            `type=bind,source=${dockerifyPath(tempDir)},target=/var/greenscreen`,
            ...(args["--debug"] ? ["-p", "9229:9229"] : []),
            ...(args["--inspect-xstate"] ? ["-p", "8888:8888"] : []),
            // ↑ Expose Node default debug port if debug enabled.
            "--cap-add",
            "SYS_ADMIN",
            // ↑ Allow the container to use SYS_ADMIN permission, required for the Chromium sandbox.
            // "--security-opt",
            // "seccomp=src/resources/chrome.json",
            // ↑ An tighter alternative to the SYS_ADMIN permission - disabled for now because
            // it's rather more complicated to supply to ECS
            ...(args["--debug"] ? ["-e", "NODE_OPTIONS=--inspect-brk=0.0.0.0"] : []),
            // ↑ Enable inspect-brk Node option if debug enabled. Specify IP 0.0.0.0 to allow non-localhost debugger to attach.
            ...(args["--inspect-xstate"] ? ["-e", "GSC_XSTATE_INSPECT_ENABLED=true"] : []),
            // ↑ Enable XState inspector option.
            "--name=midspace-compositor",
            "midspace/compositor",
        ],
        { stdio: ["inherit", "inherit", "inherit"] }
    );

    if (args["--inspect-xstate"]) {
        await sleep(5000);
        await open("https://statecharts.io/inspect?server=localhost:8888");
    }
}

main().catch((err) => {
    console.error("Failed to start image", err);
});
