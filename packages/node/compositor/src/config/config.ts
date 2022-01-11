import { z } from "zod";

const configSchema = z.object({
    display: z.number(),
    enableXStateInspector: z.boolean(),
    mode: z.union([z.literal("test-file"), z.literal("test-rtmp")]),
    outputDestination: z.string(),
    logLevel: z.union([
        z.literal("trace"),
        z.literal("debug"),
        z.literal("info"),
        z.literal("warn"),
        z.literal("error"),
        z.literal("fatal"),
    ]),
});

export type Config = z.infer<typeof configSchema>;

type RawConfig = {
    [Property in keyof Config]: any;
};

const defaultConfig: Config = {
    display: 1,
    enableXStateInspector: false,
    mode: "test-file",
    outputDestination: "screen.mp4",
    logLevel: "info",
};

export function resolveConfig(baseConfig: Config = defaultConfig): Config {
    const userConfig: RawConfig = {
        display: process.env.DISPLAY,
        enableXStateInspector: process.env.GSC_XSTATE_INSPECT_ENABLED === "true",
        mode: process.env.GSC_MODE,
        outputDestination: process.env.GSC_OUTPUT_DESTINATION,
        logLevel: process.env.GSC_LOG_LEVEL,
    };

    Object.keys(userConfig).forEach((key) => {
        if (userConfig[key as keyof RawConfig] === undefined) {
            delete userConfig[key as keyof RawConfig];
        }
    });

    const parsedUserConfig = configSchema.partial().parse(userConfig);

    return {
        ...baseConfig,
        ...parsedUserConfig,
    };
}
