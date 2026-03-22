import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// Resolved paths to external tool binaries.
// Populated after checkDependencies() runs.
export const bin = {
  ffmpeg: "ffmpeg",
  ffprobe: "ffprobe",
  exiftool: "exiftool",
};

function tryResolveNpmBinary(name, resolver) {
  try {
    if (name === "ffmpeg") return resolver("ffmpeg-static");
    if (name === "ffprobe") return resolver("ffprobe-static").path;
  } catch {
    return null;
  }
}

function resolveCommand(name, args) {
  // 1. Try system PATH
  try {
    execFileSync(name, args, { stdio: "pipe" });
    return name;
  } catch {
    // fall through
  }

  // 2. Try npm-bundled static binaries
  const require = createRequire(import.meta.url);
  const npmPath = tryResolveNpmBinary(name, require);
  if (npmPath) {
    try {
      execFileSync(npmPath, args, { stdio: "pipe" });
      return npmPath;
    } catch {
      // fall through
    }
  }

  return null;
}

const REQUIRED = [
  {
    key: "ffmpeg",
    args: ["-version"],
    name: "FFmpeg",
    install: "npm install ffmpeg-static  /  sudo apt install ffmpeg  /  brew install ffmpeg",
  },
  {
    key: "ffprobe",
    args: ["-version"],
    name: "FFprobe",
    install: "npm install ffprobe-static  /  sudo apt install ffmpeg  /  brew install ffmpeg",
  },
  {
    key: "exiftool",
    args: ["-ver"],
    name: "ExifTool",
    install: "sudo apt install libimage-exiftool-perl  /  brew install exiftool",
  },
];

export function checkDependencies() {
  const missing = [];

  for (const dep of REQUIRED) {
    const resolved = resolveCommand(dep.key, dep.args);
    if (resolved) {
      bin[dep.key] = resolved;
    } else {
      missing.push(dep);
    }
  }

  if (missing.length > 0) {
    console.error("Missing required dependencies:\n");
    for (const dep of missing) {
      console.error(`  ✗ ${dep.name} (${dep.key})`);
      console.error(`    Install: ${dep.install}\n`);
    }
    process.exit(1);
  }

  console.log("Dependencies OK (ffmpeg, ffprobe, exiftool)");
}
