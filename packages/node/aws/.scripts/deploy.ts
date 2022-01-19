import findWorkspaceDir from "@pnpm/find-workspace-dir";
import { config, DotenvConfigOutput } from "dotenv";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { exit } from "node:process";

async function loadEnv(): Promise<DotenvConfigOutput> {
    const cwd = process.cwd();
    const workspaceDir = await findWorkspaceDir(cwd);
    assert(workspaceDir);
    const envFile = join(workspaceDir, ".env.current");
    return config({
        path: envFile,
    });
}

async function main(): Promise<void> {
    const env = await loadEnv();
    assert(env.parsed?.["COMPOSE_PROJECT_NAME"]);
    const name = env.parsed["COMPOSE_PROJECT_NAME"];

    const proc = spawn(
        "pnpm",
        ["exec", "cdk", "deploy", "CompositorStack", "--outputs-file", `generated/outputs.${name}.json`],
        {
            stdio: ["inherit", "inherit", "inherit"],
            env: process.env,
            shell: true,
        }
    );

    proc.on("error", (err) => console.error(err));
    proc.on("exit", (code, signal) => {
        if (code !== 0) {
            console.error("Exited with error", code, signal);
        }
    });
}

main().catch((err) => {
    console.error("Failed to start image", err);
    exit(1);
});
