import puppeteer from "puppeteer-core";
import { logger } from "../util/logger";

export async function startChromium(displayNumber: string): Promise<void> {
    //--autoplay-policy=no-user-gesture-required --enable-logging=stderr --v=1 --disable-gpu --user-data-dir=/tmp --window-position=0,0 --window-size=1280,720
    const chromiumLogger = logger.child({ module: "chromium" });
    chromiumLogger.info("Starting Chromium");
    await puppeteer.launch({
        executablePath: "/usr/bin/chromium",
        env: {
            ...process.env,
            DISPLAY: `:${displayNumber}.0`,
        },
        headless: false,

        args: [
            "--autoplay-policy=no-user-gesture-required",
            "--disable-gpu",
            "--user-data-dir=/tmp",
            "--window-position=0,0",
            "--window-size=1280,720",
            "--enable-logging=stderr",
            // "--no-sandbox",
            "--v=1",
            "--app=https://shattereddisk.github.io/rickroll/rickroll.mp4",
            // "--app=https://www.youtube.com/watch?v=ucZl6vQ_8Uo",
        ],
        // args: ["--disable-dev-shm-usage"],
    });
    chromiumLogger.info("Started Chromium");
    // const page = await browser.newPage();
    // await page.goto("https://news.ycombinator.com", {
    //     waitUntil: "networkidle2",
    // });
    // await page.pdf({ path: "/root/temp/hn.pdf", format: "a4" });
}
