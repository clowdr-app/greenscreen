import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import normalizePath from "normalize-path";
import open from "open";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { sleep } from "../src/util/sleep";

function dockerifyPath(path: string): string {
    const posixPath = normalizePath(path);
    if (posixPath.length > 1 && posixPath[1] === ":") {
        return `//${posixPath[0].toLowerCase()}${posixPath.slice(2)}`.replaceAll(" ", "\\ ");
    }
    return posixPath.replaceAll(" ", "\\ ");
}

async function main(): Promise<void> {
    const args = yargs(hideBin(process.argv))
        .scriptName("start-image")
        .options({
            debug: {
                boolean: true,
                default: false,
            },
            "inspect-xstate": {
                boolean: true,
                default: false,
            },
            "log-level": {
                string: true,
                choices: ["trace", "debug", "info", "warn", "error", "fatal"],
                default: "info",
            },
            "output-destination": {
                string: true,
                default: "screen.mp4",
                description:
                    "Name of the destination for the composited video. In test-file mode, this is a filename. In rtmp mode, this is an RTMP Push URL.",
            },
            mode: {
                choices: ["test-file", "test-rtmp"],
                description: "Mode in which to run the compositor.",
            },
        })
        .strict()
        .parseSync();

    const cwd = process.cwd();
    const tempDir = join(cwd, "build", "temp");

    console.log(dockerifyPath(tempDir));

    await mkdir(tempDir, {
        recursive: true,
    });

    // const dockerProc = spawn(
    //     `docker`,
    //     [
    //         "run",
    //         "--rm",
    //         "-it",
    //         "--mount",
    //         `type=bind,source=${dockerifyPath(tempDir)},target=/var/greenscreen`,
    //         ...(args.debug ? ["-p", "9229:9229"] : []),
    //         ...(args.inspectXstate ? ["-p", "8888:8888"] : []),
    //         ...["-p", "1936:1936"],
    //         // ↑ Expose Node default debug port if debug enabled.
    //         "--cap-add",
    //         "SYS_ADMIN",
    //         // ↑ Allow the container to use SYS_ADMIN permission, required for the Chromium sandbox.
    //         // "--security-opt",
    //         // "seccomp=src/resources/chrome.json",
    //         // ↑ An tighter alternative to the SYS_ADMIN permission - disabled for now because
    //         // it's rather more complicated to supply to ECS
    //         ...(args.debug ? ["-e", "NODE_OPTIONS=--inspect-brk=0.0.0.0"] : []),
    //         // ↑ Enable inspect-brk Node option if debug enabled. Specify IP 0.0.0.0 to allow non-localhost debugger to attach.
    //         ...(args.inspectXstate ? ["-e", "GSC_XSTATE_INSPECT_ENABLED=true"] : []),
    //         // ↑ Enable XState inspector option.
    //         ...(args.logLevel ? ["-e", `GSC_LOG_LEVEL=${args.logLevel}`] : []),
    //         // ↑ Set the Pino log level.
    //         ...(args.mode ? ["-e", `GSC_MODE=${args.mode}`] : []),
    //         ...(args.outputDestination ? ["-e", `GSC_OUTPUT_DESTINATION=${args.outputDestination}`] : []),
    //         "--name=midspace-compositor",
    //         "midspace/compositor",
    //     ],
    //     { stdio: ["inherit", "pipe", "inherit"] }
    // );

    spawn(
        `docker`,
        // [],
        [
            "compose",
            "-f",
            "docker-compose.yaml",
            "-p",
            "greenscreen",
            ...(args.mode === "test-rtmp" ? ["--profile", "owncast"] : []),
            "up",
            "--force-recreate",
        ],
        {
            stdio: ["inherit", "inherit", "inherit"],
            env: {
                ...process.env,
                NODE_OPTIONS: args.debug ? "--inspect-brk=0.0.0.0" : undefined,
                GSC_XSTATE_INSPECT_ENABLED: args.inspectXstate ? "true" : undefined,
                GSC_LOG_LEVEL: args.logLevel ? args.logLevel : undefined,
                GSC_MODE: args.mode ? args.mode : undefined,
                GSC_OUTPUT_DESTINATION: args.outputDestination ? args.outputDestination : undefined,
            },
            shell: false,
        }
    );

    // const pinoProc = spawn(`pino-pretty`, ["-t", "SYS:HH:MM:ss.l", "-S", "-i", "hostname,pid", "--crlf"], {
    //     shell: true,
    //     stdio: ["pipe", "inherit", "inherit"],
    // });

    // dockerProc.stdout.pipe(pinoProc.stdin);

    if (args.inspectXstate) {
        await sleep(5000);
        await open("https://statecharts.io/inspect?server=localhost:8888");
    }
}

main().catch((err) => {
    console.error("Failed to start image", err);
});
