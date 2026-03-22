import { writeFileSync } from "node:fs";

/**
 * Convert a time string (MM:SS or HH:MM:SS) to seconds.
 * @param {string} str
 * @returns {number}
 */
export function timeToSeconds(str) {
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0];
}

/**
 * Format seconds as MM:SS string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Binary-search for the GPS record closest to a target frame index.
 * @param {import('./djmd-parser.js').GpsRecord[]} records - sorted by frameIndex
 * @param {number} targetFrameIndex
 * @returns {import('./djmd-parser.js').GpsRecord}
 */
export function findClosestRecord(records, targetFrameIndex) {
  let lo = 0;
  let hi = records.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (records[mid].frameIndex < targetFrameIndex) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0) {
    const d1 = Math.abs(records[lo].frameIndex - targetFrameIndex);
    const d2 = Math.abs(records[lo - 1].frameIndex - targetFrameIndex);
    if (d2 < d1) lo--;
  }
  return records[lo];
}

/**
 * Export GPS records to a CSV file.
 * @param {import('./djmd-parser.js').GpsRecord[]} records
 * @param {string} csvPath
 */
export function exportCsv(records, csvPath) {
  const lines = ["frame_index,timestamp_us,time_s,lat,lon,alt_m"];
  const t0 = records[0].timestampUs;
  for (const r of records) {
    const t = (r.timestampUs - t0) / 1_000_000;
    lines.push(
      `${r.frameIndex},${r.timestampUs},${t.toFixed(4)},${r.lat.toFixed(10)},${r.lon.toFixed(10)},${r.altM !== null ? r.altM.toFixed(3) : ""}`,
    );
  }
  writeFileSync(csvPath, lines.join("\n") + "\n");
  console.log(`GPS track exported: ${csvPath} (${records.length} points)`);
}
