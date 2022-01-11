import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs";
import { ChannelLatencyMode, ChannelType, CreateChannelCommand, IvsClient } from "@aws-sdk/client-ivs";
import findWorkspaceDir from "@pnpm/find-workspace-dir";
import { config, DotenvConfigOutput } from "dotenv";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { join } from "node:path";
import pc from "picocolors";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";

async function loadEnv(): Promise<DotenvConfigOutput> {
    const cwd = process.cwd();
    const workspaceDir = await findWorkspaceDir(cwd);
    assert(workspaceDir);
    const envFile = join(workspaceDir, ".env.current");
    return config({
        path: envFile,
    });
}

const stackOutputsFile = z.object({
    CompositorStack: z.object({
        ContainerRepositoryUrl: z.string(),
        TaskDefinitionArn: z.string(),
        ClusterArn: z.string(),
    }),
});

type StackOutputs = z.infer<typeof stackOutputsFile>;

async function getStackOutputs(): Promise<StackOutputs> {
    assert(process.env.COMPOSE_PROJECT_NAME);
    const projectName = process.env.COMPOSE_PROJECT_NAME;
    const maybeOutputs = await import(`@greenscreen/aws/outputs.${projectName}.json`);
    const outputs = stackOutputsFile.parse(maybeOutputs);
    return outputs;
}

async function buildImage(): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(`pnpm`, ["build:image", "--", "--target", "linux/amd64"], {
            stdio: ["inherit", "inherit", "inherit"],
            env: process.env,
            shell: false,
        });

        let resolved = false;

        proc.on("error", (err) => {
            if (resolved) {
                return;
            }
            resolved = true;
            reject(err);
        });

        proc.on("exit", (code, signal) => {
            if (resolved) {
                return;
            }
            resolved = true;
            if (code !== 0) {
                reject(new Error(`Exited with code ${code} (${signal})`));
            }
            resolve();
        });
    });
}

async function tagImage(repositoryUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(`docker`, ["tag", "midspace/compositor:latest", `${repositoryUrl}:latest`], {
            stdio: ["inherit", "inherit", "inherit"],
            env: process.env,
            shell: false,
        });

        let resolved = false;

        proc.on("error", (err) => {
            if (resolved) {
                return;
            }
            resolved = true;
            reject(err);
        });

        proc.on("exit", (code, signal) => {
            if (resolved) {
                return;
            }
            resolved = true;
            if (code !== 0) {
                reject(new Error(`Exited with code ${code} (${signal})`));
            }
            resolve();
        });
    });
}

async function pushImage(repositoryUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(`docker`, ["push", `${repositoryUrl}:latest`], {
            stdio: ["inherit", "inherit", "inherit"],
            env: process.env,
            shell: false,
        });

        let resolved = false;

        proc.on("error", (err) => {
            if (resolved) {
                return;
            }
            resolved = true;
            reject(err);
        });

        proc.on("exit", (code, signal) => {
            if (resolved) {
                return;
            }
            resolved = true;
            if (code !== 0) {
                reject(new Error(`Exited with code ${code} (${signal})`));
            }
            resolve();
        });
    });
}

interface ChannelDetails {
    ingestEndpoint: string;
    streamKey: string;
}

async function createChannel(): Promise<ChannelDetails> {
    const client = new IvsClient({
        region: process.env.AWS_CLUSTER_REGION,
    });

    const response = await client.send(
        new CreateChannelCommand({
            name: uuidv4(),
            latencyMode: ChannelLatencyMode.LowLatency,
            type: ChannelType.StandardChannelType,
        })
    );

    assert(response.channel?.ingestEndpoint);
    assert(response.streamKey?.value);

    return {
        ingestEndpoint: response.channel?.ingestEndpoint,
        streamKey: response.streamKey?.value,
    };
}

async function startTask(clusterArn: string, taskDefinitionArn: string, channelDetails: ChannelDetails): Promise<void> {
    const client = new ECSClient({
        region: process.env.AWS_CLUSTER_REGION,
    });

    const outputDestination = `rtmps://${channelDetails.ingestEndpoint}:443/app/${channelDetails.streamKey}`;
    console.log("GSC_OUTPUT_DESTINATION", outputDestination);

    const response = await client.send(
        new RunTaskCommand({
            taskDefinition: taskDefinitionArn,
            cluster: clusterArn,
            overrides: {
                containerOverrides: [
                    {
                        name: "compositor",
                        environment: [
                            { name: "GSC_MODE", value: "test-rtmp" },
                            {
                                name: "GSC_OUTPUT_DESTINATION",
                                value: outputDestination,
                            },
                        ],
                    },
                ],
            },
        })
    );

    if (response.failures?.length) {
        console.error("Failed to start task", response.failures);
        throw new Error("Failed to start task");
    } else {
        console.log("Started tasks", response.tasks);
    }
}

async function main(): Promise<void> {
    console.log(pc.green("> Loading configuration"));
    await loadEnv();
    const stackOutputs = await getStackOutputs();

    console.log(pc.green("> Building Docker image"));
    await buildImage();

    console.log(pc.green("> Tagging Docker image"));
    await tagImage(stackOutputs.CompositorStack.ContainerRepositoryUrl);
    console.log(pc.green("> Pushing Docker image"));
    await pushImage(stackOutputs.CompositorStack.ContainerRepositoryUrl);

    console.log(pc.green("> Creating IVS channel"));
    const channelDetails = await createChannel();

    console.log(pc.green("> Starting ECS task"));
    await startTask(
        stackOutputs.CompositorStack.ClusterArn,
        stackOutputs.CompositorStack.TaskDefinitionArn,
        channelDetails
    );
}

main().catch((err) => {
    console.error("Failed to run cloud test", err);
});
