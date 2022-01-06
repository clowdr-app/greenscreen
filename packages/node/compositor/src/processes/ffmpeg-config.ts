interface CoreOptions {
    outputFile: string;
    promptOnOverwrite?: boolean;
    outputDuration?: string;
}

interface X11grabOptions {
    format: "x11grab";
    displayNumber: string;
    screenNumber?: string;
    drawMouse?: boolean;
}

interface BaseVideoInputOptions {
    frameRate?: number;
    height?: number;
    width?: number;
    videoInputMaxQueuedPackets?: number;
}

type VideoInputOptions = {
    options: X11grabOptions;
    baseOptions: BaseVideoInputOptions;
};

interface VideoOutputOptions {
    videoCodec?: string;
    videoBitrate?: string;
    videoQuantizerScaleMin?: number;
    videoQuantizerScaleMax?: number;
}

interface PulseAudioOptions {
    format: "pulse";
    audioSourceDevice: string;
}

interface BaseAudioInputOptions {
    audioChannelCount?: number;
    audioInputMaxQueuedPackets?: number;
}

type AudioInputOptions = {
    options: PulseAudioOptions;
    baseOptions: BaseAudioInputOptions;
};

interface AudioOutputOptions {
    audioCodec?: string;
    audioBitrate?: string;
}

export interface FFmpegOptions {
    core: CoreOptions;
    audioInput: AudioInputOptions;
    videoInput: VideoInputOptions;
    audioOutput: AudioOutputOptions;
    videoOutput: VideoOutputOptions;
}

export function makeDefaultOptions(outputFile: string, displayNumber: string): FFmpegOptions {
    return {
        core: {
            outputFile,
            outputDuration: "00:00:20",
            promptOnOverwrite: false,
        },
        audioInput: {
            baseOptions: {
                audioChannelCount: 2,
                audioInputMaxQueuedPackets: 512,
            },
            options: {
                format: "pulse",
                audioSourceDevice: "default",
            },
        },
        videoInput: {
            options: {
                format: "x11grab",
                displayNumber,
                drawMouse: false,
                screenNumber: "0",
            },
            baseOptions: {
                frameRate: 30,
                height: 720,
                width: 1280,
                videoInputMaxQueuedPackets: 512,
            },
        },
        audioOutput: {
            audioBitrate: "64k",
            audioCodec: "libvorbis",
        },
        videoOutput: {
            videoBitrate: "384k",
            videoCodec: "libvpx",
            videoQuantizerScaleMax: 42,
            videoQuantizerScaleMin: 10,
        },
    };
}

export function compileOptions(options: FFmpegOptions): [args: string[], outputFile: string] {
    return [
        [
            ...compileVideoInputOptions(options.videoInput),
            ...compileAudioInputOptions(options.audioInput),
            ...compileVideoOutputOptions(options.videoOutput),
            ...compileAudioOutputOptions(options.audioOutput),
            ...(options.core.promptOnOverwrite ? [] : ["-y"]),
            ...(options.core.outputDuration ? ["-t", options.core.outputDuration] : []),
        ],
        options.core.outputFile,
    ];
}

function computeWidth(width: number | undefined, height: number): number {
    return width ?? (height * 16) / 9;
}

function compileBaseVideoInputOptions(options: BaseVideoInputOptions): string[] {
    return [
        ...(options.height ? ["-s", `${computeWidth(options.width, options.height)}x${options.height}`] : []),
        ...(options.frameRate ? ["-framerate", options.frameRate.toString()] : []),
        ...(options.videoInputMaxQueuedPackets
            ? ["-thread_queue_size", options.videoInputMaxQueuedPackets.toString()]
            : []),
    ];
}

function compileX11grabInputOptions(options: X11grabOptions): string[] {
    return [
        ...["-draw_mouse", options.drawMouse ? "1" : "0"],
        ...["-i", `:${options.displayNumber}.${options.screenNumber}`],
    ];
}

function compileVideoInputOptions(options: VideoInputOptions): string[] {
    return [
        ...["-f", options.options.format],
        ...compileBaseVideoInputOptions(options.baseOptions),
        ...compileX11grabInputOptions(options.options),
    ];
}

function compileBaseAudioInputOptions(options: BaseAudioInputOptions): string[] {
    return [
        ...(options.audioChannelCount ? ["-ac", options.audioChannelCount.toString()] : []),
        ...(options.audioInputMaxQueuedPackets
            ? ["-thread_queue_size", options.audioInputMaxQueuedPackets.toString()]
            : []),
    ];
}

function compilePulseAudioInputOptions(options: PulseAudioOptions): string[] {
    return [...["-i", options.audioSourceDevice]];
}

function compileAudioInputOptions(options: AudioInputOptions): string[] {
    return [
        ...["-f", options.options.format],
        ...compileBaseAudioInputOptions(options.baseOptions),
        ...compilePulseAudioInputOptions(options.options),
    ];
}

function compileVideoOutputOptions(options: VideoOutputOptions): string[] {
    return [
        ...(options.videoCodec ? ["-c:v", options.videoCodec] : []),
        ...(options.videoBitrate ? ["-b:v", options.videoBitrate] : []),
        ...(options.videoQuantizerScaleMin ? ["-qmin", options.videoQuantizerScaleMin.toString()] : []),
        ...(options.videoQuantizerScaleMax ? ["-qmax", options.videoQuantizerScaleMax.toString()] : []),
    ];
}

function compileAudioOutputOptions(options: AudioOutputOptions): string[] {
    return [
        ...(options.audioCodec ? ["-c:a", options.audioCodec] : []),
        ...(options.audioBitrate ? ["-b:a", options.audioBitrate] : []),
    ];
}
