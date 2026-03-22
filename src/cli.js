#!/usr/bin/env node

import { readFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { checkDependencies } from "./deps.js";
import { parseDjmd } from "./djmd-parser.js";
import { findDjmdStreamIndex, extractDjmdStream, getVideoFps, extractFrames } from "./ffmpeg.js";
import { geotagBatch } from "./exif.js";
import { timeToSeconds, formatTime, findClosestRecord, exportCsv } from "./utils.js";

const HELP = `
dji-geotagger - Extract GPS-geotagged frames from DJI Mini 5 Pro videos

Usage:
  dji-geotagger <video.MP4> <output-dir> [options]

Arguments:
  video.MP4              DJI MP4 video file with djmd metadata stream
  output-dir             Directory for geotagged JPEG frames

Options:
  --start MM:SS          Start time (default: 00:00)
  --end MM:SS            End time (default: video end)
  --fps N                Frame extraction rate (default: 2)
  --csv <file>           Also export full GPS track to CSV
  --csv-only <file>      Only export CSV, skip frame extraction

Examples:
  dji-geotagger DJI_video.MP4 ./frames_geo
  dji-geotagger DJI_video.MP4 ./frames_geo --start 01:10 --end 01:30 --fps 1
  dji-geotagger DJI_video.MP4 ./frames_geo --fps 2 --csv track.csv
  dji-geotagger DJI_video.MP4 . --csv-only track.csv
`.trim();

const BATCH_SIZE = 100;

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    process.exit(0);
  }

  const opts = { mp4: null, outputDir: ".", start: "00:00", end: null, fps: 2, csv: null, csvOnly: null };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--start":    opts.start = args[++i]; break;
      case "--end":      opts.end = args[++i]; break;
      case "--fps":      opts.fps = parseFloat(args[++i]); break;
      case "--csv":      opts.csv = args[++i]; break;
      case "--csv-only": opts.csvOnly = args[++i]; break;
      default:           positional.push(args[i]);
    }
  }

  opts.mp4 = positional[0];
  if (positional[1]) opts.outputDir = positional[1];

  if (!opts.mp4) {
    console.error("Error: MP4 file path is required. Run with --help for usage.");
    process.exit(1);
  }
  if (!existsSync(opts.mp4)) {
    console.error(`Error: File not found: ${opts.mp4}`);
    process.exit(1);
  }

  return opts;
}

function extractTelemetry(mp4) {
  console.log(`\nAnalyzing ${basename(mp4)} ...`);
  const streamIndex = findDjmdStreamIndex(mp4);
  console.log(`Found djmd metadata stream (index ${streamIndex})`);

  const tmpBin = join(tmpdir(), `djmd_${Date.now()}.bin`);
  console.log("Extracting telemetry stream ...");
  extractDjmdStream(mp4, streamIndex, tmpBin);

  const buf = readFileSync(tmpBin);
  unlinkSync(tmpBin);

  const records = parseDjmd(buf);
  if (records.length === 0) {
    console.error("ERROR: No GPS records found in telemetry stream.");
    process.exit(1);
  }

  return records;
}

function printGpsSummary(records, videoFps) {
  const durationS = records.length / videoFps;
  console.log(`Parsed ${records.length} GPS records (${durationS.toFixed(1)}s at ${videoFps.toFixed(1)} fps)`);

  const lats = records.map((r) => r.lat);
  const lons = records.map((r) => r.lon);
  const alts = records.filter((r) => r.altM !== null).map((r) => r.altM);
  console.log(
    `GPS: lat [${Math.min(...lats).toFixed(6)}, ${Math.max(...lats).toFixed(6)}]` +
    `  lon [${Math.min(...lons).toFixed(6)}, ${Math.max(...lons).toFixed(6)}]` +
    `  alt [${Math.min(...alts).toFixed(1)}, ${Math.max(...alts).toFixed(1)}]m`,
  );

  return durationS;
}

function geotagFrames(framePaths, records, startS, videoFps, fps) {
  console.log("Geotagging frames ...");
  const frameInterval = 1 / fps;

  for (let batchStart = 0; batchStart < framePaths.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, framePaths.length);
    const items = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const targetFrame = Math.round((startS + i * frameInterval) * videoFps);
      const gps = findClosestRecord(records, targetFrame);
      items.push({ path: framePaths[i], lat: gps.lat, lon: gps.lon, altM: gps.altM });
    }

    geotagBatch(items);

    const last = items.at(-1);
    console.log(
      `  [${batchEnd}/${framePaths.length}] ${basename(last.path)} → ` +
      `(${last.lat.toFixed(8)}, ${last.lon.toFixed(8)}, ${last.altM?.toFixed(1) ?? "?"}m)`,
    );
  }
}

function main() {
  checkDependencies();

  const opts = parseArgs();
  const mp4 = resolve(opts.mp4);

  const records = extractTelemetry(mp4);
  const videoFps = getVideoFps(mp4);
  const durationS = printGpsSummary(records, videoFps);

  if (opts.csv) exportCsv(records, opts.csv);
  if (opts.csvOnly) {
    exportCsv(records, opts.csvOnly);
    return;
  }

  const startS = timeToSeconds(opts.start);
  const endS = opts.end ? timeToSeconds(opts.end) : durationS;

  mkdirSync(opts.outputDir, { recursive: true });
  console.log(`\nExtracting frames: ${opts.start} → ${opts.end || formatTime(endS)} at ${opts.fps} fps ...`);

  const framePaths = extractFrames(mp4, opts.outputDir, startS, endS, opts.fps);
  console.log(`Extracted ${framePaths.length} frames`);

  if (framePaths.length === 0) {
    console.error("No frames extracted. Check time range.");
    process.exit(1);
  }

  geotagFrames(framePaths, records, startS, videoFps, opts.fps);

  console.log(`\nDone! ${framePaths.length} geotagged frames in ${opts.outputDir}/`);
  console.log("Ready for WebODM import.");
}

main();
