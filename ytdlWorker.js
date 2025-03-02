// ytdlWorker.js
const { parentPort } = require("worker_threads");
const { spawn } = require("child_process");
const path = require("path");

const ytdlpPath = path.join(__dirname, "node_modules", "yt-dlp-exec", "bin", "yt-dlp.exe");

parentPort.on("message", async (videoUrl) => {
  console.log(`🎥 Worker started fetching: ${videoUrl}`);

  try {
    const process = spawn(ytdlpPath, [
      videoUrl,
      "--dump-single-json",
      "--format", "bestaudio",
      "--extract-audio",
      "--prefer-ffmpeg",
      "--audio-format", "mp3"
    ]);

    let jsonOutput = "";

    process.stdout.on("data", (data) => {
      jsonOutput += data.toString();
    });

    process.stderr.on("data", (data) => {
      console.error(`⚠️ yt-dlp error: ${data.toString()}`);
    });

    process.on("close", () => {
      try {
        const metadata = JSON.parse(jsonOutput.trim());
        if (!metadata || !metadata.url) {
          throw new Error("Invalid metadata received from yt-dlp");
        }

        parentPort.postMessage({
          success: true,
          title: metadata.title,
          url: metadata.url
        });
      } catch (error) {
        console.error("❌ Failed to parse yt-dlp output:", error);
        parentPort.postMessage({ success: false, error: "Failed to parse yt-dlp output" });
      }
    });
  } catch (error) {
    console.error("❌ Worker Error:", error);
    parentPort.postMessage({ success: false, error: error.message });
  }
});
