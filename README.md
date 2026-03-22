# dji-geotagger

Extracts GPS-geotagged frames from DJI Mini 5 Pro drone videos, ready for photogrammetry with WebODM/ODM.

**Keywords:** DJI Mini 5 Pro GPS extraction, drone video to geotagged images, djmd telemetry parser, DJI MP4 GPS metadata, drone photogrammetry, WebODM from video, orthophoto from drone video, DJI video frame geotag, exif gps injection drone

## The problem

The DJI Mini 5 Pro stores GPS telemetry in a proprietary protobuf stream (`djmd` / `CAM meta`) inside the MP4. There is no SRT sidecar file. Standard tools like `exiftool -ee` can't read it, and `ffmpeg`-extracted frames come out with zero EXIF metadata. Without GPS coordinates and camera info in the EXIF, photogrammetry software can't process the images.

If you searched for any of these, this tool is for you:

- "DJI Mini 5 Pro no GPS in extracted frames"
- "djmd stream how to parse"
- "DJI drone video to orthophoto"
- "WebODM can't find GPS in drone video frames"
- "exiftool can't read GPS from DJI MP4"
- "DJI CAM meta GPS extraction"

## Use cases

### Photogrammetry from drone video (WebODM, ODM, OpenDroneMap)

You recorded a video with your DJI Mini 5 Pro instead of taking individual photos. Now you want to build an orthophoto, 3D model, or point cloud. This tool extracts geotagged frames from the video so you can feed them into WebODM, ODM, or any photogrammetry pipeline.

### Orthophoto / orthomosaic from drone video

Turn a continuous drone flight video into a set of georeferenced images suitable for generating orthophotos. Works for land surveying, agriculture monitoring, construction site tracking, environmental mapping, etc.

### GPS track extraction from DJI video

Need the flight path as a CSV? Use `--csv-only` to dump the full GPS track (one coordinate per video frame) without extracting images. Useful for plotting the flight on a map, validating flight plans, or feeding coordinates into GIS software (QGIS, ArcGIS, Google Earth).

### Georeferencing video frames for GIS

Extract frames at any interval and get them tagged with WGS84 coordinates. Import into QGIS, ArcGIS, or Google Earth Pro for spatial analysis, change detection, or visual inspection of specific locations along the flight path.

### Timelapse with location data

Extract frames at low FPS (e.g. `--fps 0.5` for one frame every 2 seconds) to build a geotagged timelapse of a flight. Each frame carries its exact position.

### Reverse-engineering DJI djmd telemetry

If you're building your own tool to parse DJI's proprietary `djmd` protobuf format, the `djmd-parser.js` module documents the binary structure and can be used as a standalone library. Zero npm dependencies.

## What it does

1. Finds and extracts the `djmd` metadata stream from the MP4 (via ffprobe/ffmpeg)
2. Parses the binary protobuf to extract per-frame GPS (reverse-engineered, no `.proto` needed)
3. Extracts video frames as high-quality JPEGs at a configurable framerate
4. Writes GPS tags (lat, lon, altitude) and camera metadata (Make, Model, FocalLength) into each frame's EXIF

Output frames can be imported directly into WebODM, ODM, or any tool that reads EXIF GPS.

## Requirements

- **Node.js** >= 18
- **FFmpeg** + **FFprobe** (system install, or auto-detected from `ffmpeg-static`/`ffprobe-static` npm packages)
- **ExifTool** (`sudo apt install libimage-exiftool-perl` or `brew install exiftool`)

## Install

```bash
git clone <repo-url> && cd dji-geotagger
npm install
```

If FFmpeg is not on your system, `npm install` pulls static binaries through the optional dependencies.

## Usage

```bash
# Full video, 2 fps (default, good for photogrammetry)
node src/cli.js <video.MP4> <output-dir>

# Specific time range
node src/cli.js DJI_video.MP4 ./frames --start 01:10 --end 01:30 --fps 1

# GPS track only, no frames
node src/cli.js DJI_video.MP4 . --csv-only track.csv

# Frames + CSV
node src/cli.js DJI_video.MP4 ./frames --fps 2 --csv track.csv
```

### Options

| Option | Description | Default |
|---|---|---|
| `<video.MP4>` | DJI MP4 with djmd metadata stream | (required) |
| `<output-dir>` | Output directory for geotagged JPEGs | `.` |
| `--start MM:SS` | Start time | `00:00` |
| `--end MM:SS` | End time | end of video |
| `--fps N` | Frame extraction rate | `2` |
| `--csv <file>` | Also export GPS track as CSV | |
| `--csv-only <file>` | Only export CSV, skip frames | |
| `-h`, `--help` | Show help | |

### FPS guidelines for photogrammetry

| FPS | Frames/min | When to use |
|---|---|---|
| 1 | 60 | Slow orbits, high overlap needed |
| 2 | 120 | General purpose (recommended) |
| 5 | 300 | Fast flyovers, max detail |

## EXIF tags written

Each output JPEG gets:

| Tag | Value | Where it comes from |
|---|---|---|
| `GPSLatitude` / `GPSLongitude` | Per-frame coordinates | djmd telemetry |
| `GPSAltitude` | Meters ASL | djmd telemetry |
| `Make` | `DJI` | Camera profile |
| `Model` | `Mini 5 Pro` | Camera profile |
| `FocalLength` | `6.72 mm` | Camera profile |
| `FocalLengthIn35mmFormat` | `24 mm` | Camera profile |
| `ExifImageWidth` / `ExifImageHeight` | `3840 x 2160` | Camera profile |

Camera tags are needed by ODM/WebODM for lens calibration.

## Supported devices

- **DJI Mini 5 Pro** (tested)
- Other DJI models that use `djmd` / `CAM meta` telemetry should also work

## Project structure

```
dji-geotagger/
├── src/
│   ├── cli.js           # CLI entry point
│   ├── deps.js          # Dependency checker (system + npm fallback)
│   ├── djmd-parser.js   # djmd protobuf parser (zero npm deps)
│   ├── exif.js          # Batched EXIF injection (GPS + camera)
│   ├── ffmpeg.js        # Stream extraction + frame export
│   └── utils.js         # Time parsing, CSV export, binary search
├── data/                # Local data (gitignored)
├── tmp/                 # Temp files (gitignored)
├── package.json
├── LICENSE
└── README.md
```

## About the djmd format

The `djmd` stream is protobuf without a published `.proto` schema. The parser was built by reverse-engineering the binary:

- One record per video frame (e.g. 26,521 records for a 7m22s video at 60fps)
- Each record has: frame index, timestamp in microseconds, GPS lat/lon as float64, altitude as varint in millimeters ASL
- Frame timestamps match the video framerate exactly (~16.68ms apart at 60fps)

## Related topics

If you landed here searching for something specific:

- **DJI SRT file missing**: The Mini 5 Pro doesn't generate SRT files for video. GPS is only in the `djmd` stream inside the MP4 itself.
- **exiftool -ee shows no GPS**: The `-ee` flag doesn't understand the `djmd` codec. You need a dedicated parser like this one.
- **WebODM "no GPS found"**: Frames from `ffmpeg` have no EXIF at all. This tool adds GPS + camera metadata so WebODM can process them.
- **DJI telemetry format / djmd / dvtm_Mini5Pro.proto**: The format references `dvtm_Mini5Pro.proto` internally but DJI hasn't published it. See the "About the djmd format" section above for the decoded structure.
- **drone video to point cloud / 3D model**: Extract geotagged frames with this tool, then process in WebODM or OpenDroneMap.

## License

MIT
