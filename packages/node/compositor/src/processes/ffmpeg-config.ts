interface CoreOptions {
    promptOnOverwrite?: boolean;
}

interface X11grabOptions {
    format: "x11grab";
    displayNumber: number;
    screenNumber?: string;
    drawMouse?: boolean;
}

interface BaseVideoInputOptions {
    frameRate?: number;
    height?: number;
    width?: number;
    maxQueuedPackets?: number;
}

type VideoInputOptions = {
    options: X11grabOptions;
    baseOptions: BaseVideoInputOptions;
};

type X264Options = {
    videoCodec?: "libx264";
    preset:
        | "ultrafast"
        | "superfast"
        | "veryfast"
        | "faster"
        | "fast"
        | "medium"
        | "slow"
        | "slower"
        | "veryslow"
        | "placebo";
    tune: "film" | "animation" | "grain" | "stillimage" | "fastdecode" | "zerolatency" | "psnr" | "ssim";
    profile: "baseline" | "main" | "high" | "high10" | "high422" | "high444";
    otherParams: string;
};

type VpxOptions = {
    videoCodec?: "libvpx";
};

interface VideoOutputOptions {
    options?: X264Options | VpxOptions;
    bitrateKbps?: number;
    /** Run `ffmpeg -pix_fmts` to see available pixel formats. */
    pixelFormat: string;
    videoQuantizerScaleMin?: number;
    videoQuantizerScaleMax?: number;
}

interface PulseAudioOptions {
    format: "pulse";
    sourceDevice: string;
}

interface BaseAudioInputOptions {
    channelCount?: number;
    maxQueuedPackets?: number;
}

type AudioInputOptions = {
    options: PulseAudioOptions;
    baseOptions: BaseAudioInputOptions;
};

interface AudioOutputOptions {
    codec?: "libvorbis" | "aac";
    bitrateKbps?: number;
    samplingFreqHz?: number;
}

interface RtmpOutputOptions {
    format: "rtmp";
}

interface FileOutputOptions {
    format: "file";
}

interface OutputOptions {
    options: RtmpOutputOptions | FileOutputOptions;
    outputDuration?: string;
    outputFile: string;
}

export interface FFmpegOptions {
    core: CoreOptions;
    audioInput: AudioInputOptions;
    videoInput: VideoInputOptions;
    audioOutput: AudioOutputOptions;
    videoOutput: VideoOutputOptions;
    output: OutputOptions;
}

/**
 * Build a set of FFmpeg options that streams the screen to an RTMP server for a limited duration.
 */
export function makeTestRtmpOptions(rtmpUrl: string, displayNumber: number): FFmpegOptions {
    return {
        core: {
            promptOnOverwrite: false,
        },
        audioInput: {
            baseOptions: {
                channelCount: 2,
                maxQueuedPackets: 512,
            },
            options: {
                format: "pulse",
                sourceDevice: "default",
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
                maxQueuedPackets: 512,
            },
        },
        audioOutput: {
            bitrateKbps: 128,
            codec: "aac",
            samplingFreqHz: 48000,
        },
        videoOutput: {
            bitrateKbps: 3000,
            options: {
                videoCodec: "libx264",
                preset: "veryfast",
                profile: "main",
                tune: "zerolatency",
                otherParams: [
                    "nal-hrd=cbr", // Force constant bitrate
                    "scenecut=0", // No keyframe on scene cut
                ].join(":"),
            },
            pixelFormat: "yuv420p",
            videoQuantizerScaleMax: 0,
            videoQuantizerScaleMin: 0,
        },
        output: {
            options: {
                format: "rtmp",
            },
            outputFile: rtmpUrl,
            outputDuration: "00:00:20",
        },
    };
}

/**
 * Build a set of FFmpeg options that records the screen to a 20-second file on disk.
 */
export function makeTestFileOptions(outputFile: string, displayNumber: number): FFmpegOptions {
    return {
        core: {
            promptOnOverwrite: false,
        },
        audioInput: {
            baseOptions: {
                channelCount: 2,
                maxQueuedPackets: 512,
            },
            options: {
                format: "pulse",
                sourceDevice: "default",
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
                maxQueuedPackets: 512,
            },
        },
        audioOutput: {
            bitrateKbps: 128,
            codec: "aac",
            samplingFreqHz: 48000,
        },
        videoOutput: {
            bitrateKbps: 3000,
            options: {
                videoCodec: "libx264",
                preset: "veryfast",
                profile: "main",
                tune: "zerolatency",
                otherParams: [
                    "nal-hrd=cbr", // Force constant bitrate
                    "scenecut=0", // No keyframe on scene cut
                ].join(":"),
            },
            pixelFormat: "yuv420p",
            videoQuantizerScaleMax: 0,
            videoQuantizerScaleMin: 0,
        },
        output: {
            options: {
                format: "file",
            },
            outputFile,
            outputDuration: "00:00:20",
        },
    };
}

export function compileOptions(options: FFmpegOptions): [args: string[], outputFile: string] {
    const [outputOptions, outputFile] = compileOutputOptions(options.output);
    return [
        [
            ...compileVideoInputOptions(options.videoInput),
            ...compileAudioInputOptions(options.audioInput),
            ...compileVideoOutputOptions(options.videoOutput),
            ...compileAudioOutputOptions(options.audioOutput),
            ...(options.core.promptOnOverwrite ? [] : ["-y"]),
            ...outputOptions,
        ],
        outputFile,
    ];
}

function computeWidth(width: number | undefined, height: number): number {
    return width ?? Math.ceil((height * 16) / 9);
}

function compileBaseVideoInputOptions(options: BaseVideoInputOptions): string[] {
    return [
        ...(options.height ? ["-s", `${computeWidth(options.width, options.height)}x${options.height}`] : []),
        ...(options.frameRate ? ["-framerate", options.frameRate.toString()] : []),
        ...(options.maxQueuedPackets ? ["-thread_queue_size", options.maxQueuedPackets.toString()] : []),
    ];
}

function compileX11grabInputOptions(options: X11grabOptions): string[] {
    return [
        ...["-use_wallclock_as_timestamps", "1", "-fflags", "+genpts"], // See https://stackoverflow.com/a/48874015/633256
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
        ...(options.channelCount ? ["-ac", options.channelCount.toString()] : []),
        ...(options.maxQueuedPackets ? ["-thread_queue_size", options.maxQueuedPackets.toString()] : []),
    ];
}

function compilePulseAudioInputOptions(options: PulseAudioOptions): string[] {
    return [...["-i", options.sourceDevice]];
}

function compileAudioInputOptions(options: AudioInputOptions): string[] {
    return [
        ...["-f", options.options.format],
        ...compileBaseAudioInputOptions(options.baseOptions),
        ...compilePulseAudioInputOptions(options.options),
    ];
}

function compileX264OutputOptions(options: X264Options) {
    return [
        ...(options.profile ? ["-profile:v", options.profile] : []),
        ...(options.tune ? ["-tune", options.tune] : []),
        ...(options.preset ? ["-preset", options.preset] : []),
        ...(options.otherParams ? ["-x264opts", options.otherParams] : []),
    ];
}

function compileVpxOutputOptions(_options: VpxOptions) {
    return [];
}

function compileVideoOutputOptions(options: VideoOutputOptions): string[] {
    return [
        ...(options.options?.videoCodec ? ["-c:v", options.options.videoCodec] : []),
        ...(options.options?.videoCodec === "libx264" ? compileX264OutputOptions(options.options) : []),
        ...(options.options?.videoCodec === "libvpx" ? compileVpxOutputOptions(options.options) : []),
        ...(options.bitrateKbps
            ? [
                  "-b:v",
                  `${options.bitrateKbps}K`,
                  "-bufsize",
                  `${options.bitrateKbps}K`,
                  "-maxrate",
                  `${options.bitrateKbps}K`,
                  "-minrate",
                  `${options.bitrateKbps}K`,
              ]
            : []),
        ...(options.videoQuantizerScaleMin ? ["-qmin", options.videoQuantizerScaleMin.toString()] : []),
        ...(options.videoQuantizerScaleMax ? ["-qmax", options.videoQuantizerScaleMax.toString()] : []),
        ...(options.pixelFormat ? ["-pix_fmt", options.pixelFormat] : []),
    ];
}

function compileAudioOutputOptions(options: AudioOutputOptions): string[] {
    return [
        ...(options.codec ? ["-c:a", options.codec] : []),
        ...(options.bitrateKbps ? ["-b:a", `${options.bitrateKbps}K`] : []),
        ...(options.samplingFreqHz ? ["-ac", options.samplingFreqHz.toString()] : []),
    ];
}

function compileRtmpOutputOptions(_options: RtmpOutputOptions): string[] {
    // return [
    //     "-f",
    //     "fifo",
    //     "-fifo_format",
    //     "flv",
    //     "-map",
    //     "0:v",
    //     "-map",
    //     "0:a?",
    //     "-drop_pkts_on_overflow",
    //     "1",
    //     "-attempt_recovery",
    //     "1",
    //     "-recovery_wait_time",
    //     "1",
    // ];
    return ["-f", "flv", "-flvflags", "no_duration_filesize"];
}

function compileOutputOptions(options: OutputOptions): [outputOptions: string[], outputFile: string] {
    return [
        [
            ...(options.outputDuration && options.options.format !== "rtmp" ? ["-t", options.outputDuration] : []),
            ...(options.options.format === "rtmp" ? compileRtmpOutputOptions(options.options) : []),
        ],
        options.outputFile,
    ];
}
