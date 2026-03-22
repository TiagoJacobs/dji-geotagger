/**
 * DJI Mini 5 Pro DJMD telemetry parser.
 *
 * Parses the proprietary protobuf "djmd" metadata stream embedded in
 * DJI Mini 5 Pro MP4 files. The stream contains one record per video
 * frame with GPS coordinates, altitude, and orientation data.
 *
 * Binary layout (protobuf without .proto):
 *   Top-level field 1: header (device, proto version)
 *   Top-level field 2: video info (resolution, fps)
 *   Top-level field 3 (×N): per-frame telemetry
 *     F1: { F1: frame_index, F2: timestamp_us }
 *     F3: { F4: { F1: { F2: lat(double), F3: lon(double) }, F2: alt_mm(varint) } }
 */

/**
 * @typedef {Object} GpsRecord
 * @property {number} frameIndex
 * @property {number} timestampUs
 * @property {number} lat       - Latitude in decimal degrees (WGS84)
 * @property {number} lon       - Longitude in decimal degrees (WGS84)
 * @property {number|null} altM - Altitude in meters above sea level
 */

/**
 * Parse a djmd binary buffer and return per-frame GPS records.
 * @param {Buffer} buf
 * @returns {GpsRecord[]}
 */
export function parseDjmd(buf) {
  const records = [];
  let pos = 0;

  while (pos < buf.length - 4) {
    const [tag, p1] = readVarint(buf, pos);
    const fieldNum = tag >> 3;
    const wireType = tag & 0x7;

    if (wireType !== 2) break; // all top-level fields are length-delimited

    const [length, p2] = readVarint(buf, p1);
    const payloadStart = p2;
    pos = p2 + length;

    if (fieldNum !== 3) continue; // only telemetry records

    const rec = parseTelemetryRecord(buf, payloadStart, payloadStart + length);
    if (rec) records.push(rec);
  }

  return records;
}

// -- internal protobuf helpers --

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  while (pos < buf.length) {
    const b = buf[pos];
    result |= (b & 0x7f) << shift;
    pos++;
    if (!(b & 0x80)) break;
    shift += 7;
    if (shift >= 35) {
      // large varint -switch to BigInt for remaining bytes
      let big = BigInt(result);
      while (pos < buf.length) {
        const b2 = buf[pos];
        big |= BigInt(b2 & 0x7f) << BigInt(shift);
        pos++;
        if (!(b2 & 0x80)) break;
        shift += 7;
      }
      return [Number(big), pos];
    }
  }
  return [result, pos];
}

function readFixed64AsDouble(buf, pos) {
  return buf.readDoubleLE(pos);
}

function parseTelemetryRecord(buf, start, end) {
  let p = start;
  let frameIndex = 0;
  let timestampUs = 0;
  let lat = null;
  let lon = null;
  let altMm = null;

  while (p < end) {
    const [tag, np] = readVarint(buf, p);
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2) {
      const [ln, np2] = readVarint(buf, np);
      if (fn === 1) {
        ({ frameIndex, timestampUs } = parseFrameHeader(buf, np2, np2 + ln));
      } else if (fn === 3) {
        const gps = parseGpsBlock(buf, np2, np2 + ln);
        if (gps) ({ lat, lon, altMm } = gps);
      }
      p = np2 + ln;
    } else if (wt === 0) {
      const [, np2] = readVarint(buf, np);
      p = np2;
    } else if (wt === 5) {
      p = np + 4;
    } else if (wt === 1) {
      p = np + 8;
    } else {
      break;
    }
  }

  if (lat !== null && lon !== null) {
    return {
      frameIndex,
      timestampUs,
      lat,
      lon,
      altM: altMm !== null ? altMm / 1000 : null,
    };
  }
  return null;
}

function parseFrameHeader(buf, start, end) {
  let p = start;
  let frameIndex = 0;
  let timestampUs = 0;

  while (p < end) {
    const [tag, np] = readVarint(buf, p);
    const fn = tag >> 3;
    const wt = tag & 0x7;
    if (wt === 0) {
      const [val, np2] = readVarint(buf, np);
      if (fn === 1) frameIndex = val;
      else if (fn === 2) timestampUs = val;
      p = np2;
    } else {
      break;
    }
  }

  return { frameIndex, timestampUs };
}

function parseGpsBlock(buf, start, end) {
  let p = start;

  while (p < end) {
    const [tag, np] = readVarint(buf, p);
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2) {
      const [ln, np2] = readVarint(buf, np);
      if (fn === 4) {
        return parseGpsSubmessage(buf, np2, np2 + ln);
      }
      p = np2 + ln;
    } else if (wt === 0) {
      const [, np2] = readVarint(buf, np);
      p = np2;
    } else if (wt === 5) {
      p = np + 4;
    } else if (wt === 1) {
      p = np + 8;
    } else {
      break;
    }
  }

  return null;
}

function parseGpsSubmessage(buf, start, end) {
  let p = start;
  let lat = null;
  let lon = null;
  let altMm = null;

  while (p < end) {
    const [tag, np] = readVarint(buf, p);
    const fn = tag >> 3;
    const wt = tag & 0x7;

    if (wt === 2) {
      const [ln, np2] = readVarint(buf, np);
      if (fn === 1 && ln === 18) {
        // Inner: F2=lat(double), F3=lon(double)
        let ip = np2;
        const iEnd = np2 + ln;
        while (ip < iEnd) {
          const [itag, inp] = readVarint(buf, ip);
          const ifn = itag >> 3;
          const iwt = itag & 0x7;
          if (iwt === 1) {
            const d = readFixed64AsDouble(buf, inp);
            if (ifn === 2) lat = d;
            else if (ifn === 3) lon = d;
            ip = inp + 8;
          } else {
            break;
          }
        }
      }
      p = np2 + ln;
    } else if (wt === 0) {
      const [val, np2] = readVarint(buf, np);
      if (fn === 2) altMm = val;
      p = np2;
    } else if (wt === 5) {
      p = np + 4;
    } else if (wt === 1) {
      p = np + 8;
    } else {
      break;
    }
  }

  if (lat !== null && lon !== null) {
    return { lat, lon, altMm: altMm ?? 0 };
  }
  return null;
}
