import execa from "execa";
import { ChildProcess, spawn } from "node:child_process";
import { stderr, stdin, stdout } from "node:process";

function monitorProc(process: ChildProcess, name: string): void {
    process.on("close", () => console.log(`${name} close`));
    process.on("disconnect", () => console.log(`${name} disconnect`));
    process.on("error", () => console.log(`${name} error`));
    process.on("exit", () => console.log(`${name} exit`));
    process.on("message", () => console.log(`${name} message`));
    process.on("spawn", () => console.log(`${name} spawn`));
}

async function main(): Promise<void> {
    const gitResult = await execa("git rev-parse --short HEAD", { shell: true });
    const commitHash = gitResult.stdout;

    const date = new Date().toISOString();

    const pnpmContextProc = spawn(
        `pnpm --silent --workspace-root pnpm-context -- -p '**/tsconfig*.json' -p '.scripts/' packages/node/compositor/Dockerfile`,
        {
            // cwd: cwd(),
            // // detached: true,
            shell: true,
            // stdio: "inherit",
            stdio: [stdin, "pipe", stderr],
        }
    );

    monitorProc(pnpmContextProc, "pnpm-context");

    const dockerProc = spawn(
        `docker image build --build-arg VCS_REF=${commitHash} --build-arg BUILD_DATE="${date}" --build-arg PACKAGE_PATH=packages/node/compositor -t midspace/compositor -f Dockerfile -`,
        { shell: true, stdio: ["pipe", stdout, stderr] }
    );

    // fs.writeFile("out.tar", )
    // const outputFile = fs.createWriteStream("out.tar");
    // pnpmContextProc.stdout.pipe(outputFile);

    const pipe = pnpmContextProc.stdout.pipe(dockerProc.stdin);
    pipe.on("error", (err) => {
        console.error("Pipe error", { err });
    });
}

main().catch((err) => {
    console.error("Failed to build image", err);
});
