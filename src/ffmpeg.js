import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { bin } from "./deps.js";

/**
 * Detect the djmd metadata stream index in an MP4 file.
 * Looks for a stream with codec_tag_string "djmd" or handler "CAM meta".
 * @param {string} mp4Path
 * @returns {number} stream index (e.g. 1)
 */
export function findDjmdStreamIndex(mp4Path) {
  const result = execFileSync(bin.ffprobe, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_streams",
    mp4Path,
  ], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });

  const { streams } = JSON.parse(result);

  for (const s of streams) {
    const tag = (s.codec_tag_string || "").toLowerCase();
    const handler = (s.tags?.handler_name || "").toLowerCase();
    if (tag === "djmd" || handler.includes("cam meta")) {
      return s.index;
    }
  }

  throw new Error(
    "No djmd metadata stream found in this MP4. " +
    "This tool supports DJI Mini 5 Pro (and similar models with djmd telemetry)."
  );
}

/**
 * Extract the djmd binary stream from MP4 to a temp file.
 * @param {string} mp4Path
 * @param {number} streamIndex
 * @param {string} outputPath
 */
export function extractDjmdStream(mp4Path, streamIndex, outputPath) {
  execFileSync(bin.ffmpeg, [
    "-y", "-v", "warning",
    "-i", mp4Path,
    "-map", `0:${streamIndex}`,
    "-c", "copy",
    "-f", "data",
    outputPath,
  ], { stdio: ["pipe", "pipe", "inherit"], maxBuffer: 50 * 1024 * 1024 });
}

/**
 * Get video FPS using ffprobe.
 * @param {string} mp4Path
 * @returns {number}
 */
export function getVideoFps(mp4Path) {
  const result = execFileSync(bin.ffprobe, [
    "-v", "quiet",
    "-select_streams", "v:0",
    "-show_entries", "stream=r_frame_rate",
    "-print_format", "json",
    mp4Path,
  ], { encoding: "utf8" });

  const { streams } = JSON.parse(result);
  if (streams.length === 0) throw new Error("No video stream found");

  // r_frame_rate is like "60000/1001" or "60/1"
  const [num, den] = streams[0].r_frame_rate.split("/").map(Number);
  return num / den;
}

/**
 * Extract frames from MP4 as JPEGs.
 * @param {string} mp4Path
 * @param {string} outputDir
 * @param {number} startS - start time in seconds
 * @param {number} endS - end time in seconds
 * @param {number} fps - extraction framerate
 * @returns {string[]} sorted list of output file paths
 */
export function extractFrames(mp4Path, outputDir, startS, endS, fps) {
  const pattern = join(outputDir, "frame_%06d.jpg");

  execFileSync(bin.ffmpeg, [
    "-y", "-v", "warning",
    "-ss", startS.toFixed(3),
    "-to", endS.toFixed(3),
    "-i", mp4Path,
    "-vf", `fps=${fps}`,
    "-qmin", "1", "-q:v", "1",
    pattern,
  ], { stdio: ["pipe", "pipe", "inherit"], maxBuffer: 50 * 1024 * 1024 });

  return readdirSync(outputDir)
    .filter((f) => f.startsWith("frame_") && f.endsWith(".jpg"))
    .sort()
    .map((f) => join(outputDir, f));
}
