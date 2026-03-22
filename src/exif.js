import { execFileSync } from "node:child_process";
import { bin } from "./deps.js";

/**
 * Known camera profiles for DJI drones.
 * Used to inject EXIF camera metadata required by photogrammetry tools
 * (WebODM/ODM) for lens calibration and distortion correction.
 */
export const CAMERA_PROFILES = {
  "mini-5-pro": {
    make: "DJI",
    model: "Mini 5 Pro",
    focalLength: 6.72,
    focalLength35mm: 24,
    imageWidth: 3840,
    imageHeight: 2160,
  },
};

function buildCameraTags(profile) {
  if (!profile) return [];
  return [
    `-Make=${profile.make}`,
    `-Model=${profile.model}`,
    `-FocalLength=${profile.focalLength}`,
    `-FocalLengthIn35mmFormat=${profile.focalLength35mm}`,
    `-ExifImageWidth=${profile.imageWidth}`,
    `-ExifImageHeight=${profile.imageHeight}`,
  ];
}

/**
 * Batch-geotag multiple files with per-file GPS coordinates and camera metadata.
 * Uses exiftool's -@ (argfile) + -execute batching for throughput.
 * @param {Array<{path: string, lat: number, lon: number, altM: number|null}>} items
 * @param {string} [cameraProfile="mini-5-pro"] - Key from CAMERA_PROFILES, or "none" to skip
 */
export function geotagBatch(items, cameraProfile = "mini-5-pro") {
  const cameraTags = cameraProfile === "none"
    ? []
    : buildCameraTags(CAMERA_PROFILES[cameraProfile]);

  const argLines = [];
  for (const item of items) {
    argLines.push("-overwrite_original");
    argLines.push(...cameraTags);
    argLines.push(`-GPSLatitude=${Math.abs(item.lat).toFixed(10)}`);
    argLines.push(`-GPSLatitudeRef=${item.lat >= 0 ? "N" : "S"}`);
    argLines.push(`-GPSLongitude=${Math.abs(item.lon).toFixed(10)}`);
    argLines.push(`-GPSLongitudeRef=${item.lon >= 0 ? "E" : "W"}`);
    if (item.altM !== null && item.altM !== undefined) {
      argLines.push(`-GPSAltitude=${Math.abs(item.altM).toFixed(2)}`);
      argLines.push(`-GPSAltitudeRef=${item.altM >= 0 ? 0 : 1}`);
    }
    argLines.push(item.path);
    argLines.push("-execute");
  }

  // Remove trailing -execute (exiftool doesn't need it on the last one)
  if (argLines.at(-1) === "-execute") argLines.pop();

  execFileSync(bin.exiftool, ["-@", "-"], {
    input: argLines.join("\n"),
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 50 * 1024 * 1024,
  });
}
