export interface Config {
    enableXStateInspector: boolean;
}

const defaultConfig: Config = {
    enableXStateInspector: false,
};

export function resolveConfig(baseConfig: Config = defaultConfig): Config {
    return {
        ...baseConfig,
        enableXStateInspector: process.env.GSC_XSTATE_INSPECT_ENABLED === "true",
    };
}
