import { startChromium } from "./processes/chromium";
import { startFFmpeg } from "./processes/ffmpeg";
import { startPulseAudio } from "./processes/pulseaudio";
import { startXvfb, waitXvfb } from "./processes/xvfb";
import { logger } from "./util/logger";
import { pathExists } from "./util/path-exists";
import { sleep } from "./util/sleep";

// const args = arg({
//     "--sleep": Boolean,
// });

export const display = process.env.DISPLAY ?? "1";
logger.info({ display }, "Display number");

async function main(): Promise<void> {
    if (await pathExists(`/tmp/.X${display}-lock`)) {
        throw new Error("X lockfile already exists. Please close the existing server.");
    }
    await startXvfb(display);
    await waitXvfb(display);
    // await startDBus();
    await startPulseAudio(display);
    await startChromium(display);
    await sleep(5000);
    // spawn("xeyes", ["-display", `:${display}`], {
    //     shell: false,
    // });
    await startFFmpeg(display);
}

logger.info("Starting compositor");
main().catch((err) => {
    logger.error({ err });
    return 1;
});

// }

// (async () => {
//     const browser = await puppeteer.launch({
//         executablePath: "/usr/bin/chromium",
//         args: ["--disable-dev-shm-usage"],
//     });
//     const page = await browser.newPage();
//     await page.goto("https://news.ycombinator.com", {
//         waitUntil: "networkidle2",
//     });
//     await page.pdf({ path: "/root/temp/hn.pdf", format: "a4" });

//     await browser.close();
// })();
