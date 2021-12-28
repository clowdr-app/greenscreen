import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import normalizePath from "normalize-path";

function dockerifyPath(path: string): string {
    const posixPath = normalizePath(path);
    if (posixPath.length > 1 && posixPath[1] === ":") {
        return `//${posixPath[0].toLowerCase()}${posixPath.slice(2)}`.replaceAll(" ", "\\ ");
    }
    return posixPath.replaceAll(" ", "\\ ");
}

async function main(): Promise<void> {
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
            "--cap-add",
            "SYS_ADMIN",
            // An tighter alternative to the SYS_ADMIN permission - disabled for now because
            // it's rather more complicated to supply to ECS
            // "--security-opt",
            // "seccomp=src/resources/chrome.json",
            "--env",
            "STREAM_INGEST_URL=rtmps://000000000000.global-contribute.live-video.net:443/app/sk_eu-west-1_XXXXXXXXXXXX_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            "--name=midspace-compositor",
            "midspace/compositor",
        ],
        { stdio: ["inherit", "inherit", "inherit"] }
    );
}

main().catch((err) => {
    console.error("Failed to start image", err);
});
