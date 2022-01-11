import execa from "execa";
import { ChildProcess, spawn } from "node:child_process";
import { exit, stderr, stdin, stdout } from "node:process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

function monitorProc(process: ChildProcess, name: string): void {
    process.on("close", () => console.log(`${name} close`));
    process.on("disconnect", () => console.log(`${name} disconnect`));
    process.on("error", () => console.log(`${name} error`));
    process.on("exit", () => console.log(`${name} exit`));
    process.on("message", () => console.log(`${name} message`));
    process.on("spawn", () => console.log(`${name} spawn`));
}

async function main(): Promise<void> {
    const args = yargs(hideBin(process.argv))
        .scriptName("build-image")
        .options({
            target: {
                type: "array",
                choices: ["linux/arm64/v8", "linux/amd64"],
                description: "Build targets.",
            },
        })
        .strict()
        .parseSync();

    const gitResult = await execa("git rev-parse --short HEAD", { shell: true });
    const commitHash = gitResult.stdout;

    const date = new Date().toISOString();

    const pnpmContextProc = spawn(
        `pnpm --silent --workspace-root pnpm-context -- -p '**/tsconfig*.json' -p '!.scripts/' packages/node/compositor/Dockerfile`,
        {
            shell: true,
            stdio: [stdin, "pipe", stderr],
        }
    );

    monitorProc(pnpmContextProc, "pnpm-context");

    const dockerProc = spawn(
        `docker buildx build --platform ${args.target?.join(
            ","
        )} --load --build-arg VCS_REF=${commitHash} --build-arg BUILD_DATE="${date}" --build-arg PACKAGE_PATH=packages/node/compositor -t midspace/compositor -f Dockerfile -`,
        { shell: true, stdio: ["pipe", stdout, stderr] }
    );

    dockerProc.on("exit", (code) => {
        exit(code ?? 0);
    });

    const pipe = pnpmContextProc.stdout.pipe(dockerProc.stdin);
    pipe.on("error", (err) => {
        console.error("Pipe error", { err });
    });
}

main().catch((err) => {
    console.error("Failed to build image", err);
    throw err;
});
