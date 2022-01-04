import { launch } from "../util/launcher";
import { logger } from "../util/logger";

type mainOptions = {
    rtmpURL: string;
    interactive?: boolean;
    duration?: string;
};

type x11grabOptions = {
    screenHeight?: number;
    screenWidth?: number;
    displayNumber?: string;
    screenNumber?: string;
    frameRate?: number;
    drawMouse?: boolean;
    videoInputMaxQueuedPackets?: number;
};

type x264Options = {
    x264Preset?: string;
    x264Tune?: string;
    x264Profile?: string;
    pixelFormat?: string;
    videoBitrateKbps?: number;
    videoQuantizerScaleMin?: number;
    videoQuantizerScaleMax?: number;
    x264OtherParams?: string;
};
const x264ParamConstantBitrate = "nal-hrd=cbr";
const x264ParamNoKeyframeOnSceneCut = "scenecut=0";

type audioOptions = {
    audioSourceDevice?: string;
    audioChannelCount?: number;
    audioInputMaxQueuedPackets?: number;
    audioCodec?: string;
    audioBitrateKbps?: number;
    audioSamplingFreqHz?: number;
};

export async function startFFmpeg({
    rtmpURL,
    interactive = false,
    duration = "00:01:00",
    displayNumber,
    screenNumber = "0",
    drawMouse = false,
    frameRate = 30,
    screenHeight = 720,
    screenWidth = 0,
    videoInputMaxQueuedPackets = 512,
    x264Preset = "veryfast",
    x264Tune = "zerolatency",
    x264Profile = "main",
    pixelFormat = "yuv420p",
    videoBitrateKbps = 3000,
    videoQuantizerScaleMin = 0,
    videoQuantizerScaleMax = 0,
    x264OtherParams = [x264ParamConstantBitrate, x264ParamNoKeyframeOnSceneCut].join(":"),
    audioSourceDevice = "default",
    audioInputMaxQueuedPackets = 512,
    audioChannelCount = 2,
    audioBitrateKbps = 128,
    audioSamplingFreqHz = 48000,
}: mainOptions & x11grabOptions & x264Options & audioOptions): Promise<void> {
    if (screenHeight && !screenWidth) {
        screenWidth = Math.ceil((screenHeight * 16) / 9);
    }

    // Generated test video; remember to comment out unused parameters before building
    // const videoInputArgs: string[] = [
    //     ...["-f", "lavfi"],
    //     ...["-i", `testsrc=duration=60:size=${screenWidth}x${screenHeight}`],
    // ];
    const videoInputArgs: string[] = [
        ...["-f", "x11grab"],
        ...["-draw_mouse", drawMouse ? "1" : "0"],
        ...(frameRate ? ["-framerate", frameRate.toString()] : []),
        ...(screenHeight ? ["-s", `${screenWidth}x${screenHeight}`] : []),
        ...(videoInputMaxQueuedPackets ? ["-thread_queue_size", videoInputMaxQueuedPackets.toString()] : []),
        ...["-i", `:${displayNumber}.${screenNumber}`],
    ];

    const audioInputArgs: string[] = [
        ...["-f", "pulse"],
        ...(audioChannelCount ? ["-ac", audioChannelCount.toString()] : []),
        ...(audioInputMaxQueuedPackets ? ["-thread_queue_size", audioInputMaxQueuedPackets.toString()] : []),
        ...["-i", audioSourceDevice],
    ];

    const vbrStr = `${videoBitrateKbps}K`;
    const videoOutputArgs: string[] = [
        ...["-c:v", "libx264"],
        ...(pixelFormat ? ["-pix_fmt", pixelFormat] : []),
        ...(videoBitrateKbps ? ["-b:v", vbrStr, "-bufsize", vbrStr, "-maxrate", vbrStr, "-minrate", vbrStr] : []),
        ...(videoQuantizerScaleMin ? ["-qmin", videoQuantizerScaleMin.toString()] : []),
        ...(videoQuantizerScaleMax ? ["-qmax", videoQuantizerScaleMax.toString()] : []),
        ...(x264Profile ? ["-profile:v", x264Profile] : []),
        ...(x264Tune ? ["-tune", x264Tune] : []),
        ...(x264Preset ? ["-preset", x264Preset] : []),
        ...(x264OtherParams ? ["-x264-params", x264OtherParams] : []),
    ];

    const audioOutputArgs: string[] = [
        ...["-c:a", "aac"],
        ...(audioBitrateKbps ? ["-b:a", `${audioBitrateKbps}K`] : []),
        ...(audioChannelCount ? ["-ac", audioChannelCount.toString()] : []),
        ...(audioSamplingFreqHz ? ["-ar", audioSamplingFreqHz.toString()] : []),
    ];

    const outputArgs: string[] = [
        ...videoOutputArgs,
        ...audioOutputArgs,
        ...(duration ? ["-t", duration] : []),
        ...["-f", "flv", "-flvflags", "no_duration_filesize"],
    ];

    // rtmpURL is added later, so that it is not explicitly logged, as stream key may be included
    // TODO is it logged at any other time and does it matter?
    const ffmpegArgsNonSecret: string[] = [
        ...(interactive ? [] : ["-y"]),
        ...videoInputArgs,
        ...audioInputArgs,
        ...outputArgs,
    ];

    const ffmpegLogger = logger.child({ module: "ffmpeg" });
    ffmpegLogger.info({ ffmpegArgsNonSecret }, "launching ffmpeg with arguments");
    launch("ffmpeg", [...ffmpegArgsNonSecret, rtmpURL], { DISPLAY: displayNumber }, ffmpegLogger);
}
