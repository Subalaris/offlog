import { gps, parse } from "exifr";
import type { ImportedVisitDraft } from "./googleTimeline";

interface PhotoPoint {
  date: string;
  latitude: number;
  longitude: number;
  label: string;
}

export interface PhotoImportStats {
  jsonFiles: number;
  imageFiles: number;
  locatedPhotos: number;
  candidateVisits: number;
  skippedFiles: number;
}

export interface PhotoImportResult {
  drafts: ImportedVisitDraft[];
  stats: PhotoImportStats;
}

interface UnknownRecord { [key: string]: unknown }

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function validCoordinates(latitude: number | null, longitude: number | null) {
  return latitude != null && longitude != null
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timestampDate(value: unknown) {
  const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
  if (!/^\d{10,13}$/.test(raw)) return "";
  const milliseconds = Number(raw) * (raw.length === 10 ? 1000 : 1);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function hash(value: string) {
  let result = 14695981039346656037n;
  for (let index = 0; index < value.length; index += 1) {
    result ^= BigInt(value.charCodeAt(index));
    result = BigInt.asUintN(64, result * 1099511628211n);
  }
  return result.toString(36);
}

function distanceKm(a: PhotoPoint, b: PhotoPoint) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const haversine = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}

async function mapLimit<T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>) {
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && next < items.length) {
      const index = next;
      next += 1;
      try {
        await task(items[index], index);
      } catch (caught) {
        failed = true;
        throw caught;
      }
    }
  });
  // Let in-flight reads finish before their archive readers are closed.
  const results = await Promise.allSettled(workers);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
}

async function pointFromSidecar(file: File): Promise<PhotoPoint | null> {
  if (file.size > 5 * 1024 * 1024) return null;
  try {
    const value = record(JSON.parse(await file.text()));
    const geoData = record(value.geoData);
    const geoExif = record(value.geoDataExif);
    let latitude = numeric(geoData.latitude);
    let longitude = numeric(geoData.longitude);
    if (!validCoordinates(latitude, longitude)) {
      latitude = numeric(geoExif.latitude);
      longitude = numeric(geoExif.longitude);
    }
    if (!validCoordinates(latitude, longitude)) return null;
    const taken = record(value.photoTakenTime);
    const created = record(value.creationTime);
    const date = timestampDate(taken.timestamp) || timestampDate(created.timestamp);
    if (!date) return null;
    return {
      date,
      latitude: latitude!,
      longitude: longitude!,
      label: typeof value.title === "string" ? value.title : file.name,
    };
  } catch {
    return null;
  }
}

async function pointFromExif(file: File): Promise<PhotoPoint | null> {
  try {
    const coordinates = await gps(file);
    if (!coordinates || !validCoordinates(coordinates.latitude, coordinates.longitude)) return null;
    const tags = await parse(file, ["DateTimeOriginal", "CreateDate", "DateTimeDigitized"]);
    const rawDate = tags?.DateTimeOriginal || tags?.CreateDate || tags?.DateTimeDigitized;
    const date = rawDate instanceof Date ? localDate(rawDate) : new Date(rawDate || "");
    const dateString = typeof date === "string" ? date : Number.isNaN(date.getTime()) ? "" : localDate(date);
    if (!dateString) return null;
    return {
      date: dateString,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      label: file.name,
    };
  } catch {
    return null;
  }
}

function pointsToDrafts(points: PhotoPoint[]) {
  const spatialGroups: Array<{ anchor: PhotoPoint; points: PhotoPoint[] }> = [];
  for (const point of points.sort((a, b) => a.date.localeCompare(b.date))) {
    const existing = spatialGroups.find((group) => distanceKm(group.anchor, point) <= 15);
    if (existing) existing.points.push(point);
    else spatialGroups.push({ anchor: point, points: [point] });
  }

  return spatialGroups.flatMap((group, groupIndex) => {
    const byDate = new Map<string, PhotoPoint[]>();
    for (const point of group.points) byDate.set(point.date, [...(byDate.get(point.date) ?? []), point]);
    const dates = Array.from(byDate.keys()).sort();
    const runs: Array<{ start: string; end: string; count: number }> = [];
    for (const date of dates) {
      const current = runs.at(-1);
      const count = byDate.get(date)?.length ?? 0;
      if (current && daysBetween(current.end, date) <= 3) {
        current.end = date;
        current.count += count;
      } else {
        runs.push({ start: date, end: date, count });
      }
    }
    return runs.map((run) => {
      const source = `${group.anchor.latitude}|${group.anchor.longitude}|${run.start}|${run.end}`;
      return {
        id: `photo_${hash(source)}`,
        placeKey: `photo-area-${groupIndex}`,
        city: "",
        country: "",
        startDate: run.start,
        endDate: run.end,
        latitude: group.anchor.latitude,
        longitude: group.anchor.longitude,
        sourceLabel: `${run.count} geotagged ${run.count === 1 ? "photo" : "photos"} near ${group.anchor.latitude.toFixed(3)}, ${group.anchor.longitude.toFixed(3)}`,
        selected: false,
      } satisfies ImportedVisitDraft;
    });
  }).slice(0, 3000);
}

const IMAGE_EXTENSIONS = /\.(?:jpe?g|heic|heif|avif|png|tiff?|webp)$/i;

interface PhotoFileSource {
  name: string;
  size: number;
  read: () => Promise<File>;
}

// Read individual ZIP entries on demand, rather than expanding an entire photo library into memory.
export async function parseGooglePhotosFiles(
  files: File[],
  onProgress?: (message: string) => void,
): Promise<PhotoImportResult> {
  const sources: PhotoFileSource[] = [];
  const closeArchives: Array<() => Promise<void>> = [];
  try {
    for (const file of files) {
      if (!/\.zip$/i.test(file.name)) {
        sources.push({ name: file.name, size: file.size, read: async () => file });
        continue;
      }
      onProgress?.(`Opening ${file.name}…`);
      const { BlobReader, BlobWriter, ZipReader } = await import("@zip.js/zip.js");
      const archive = new ZipReader(new BlobReader(file), { useWebWorkers: false });
      closeArchives.push(() => archive.close());
      try {
        for await (const entry of archive.getEntriesGenerator()) {
          if (entry.directory) continue;
          const name = entry.filename.split("/").at(-1) || entry.filename;
          if (!/\.json$/i.test(name) && !IMAGE_EXTENSIONS.test(name)) continue;
          sources.push({
            name,
            size: entry.uncompressedSize,
            read: async () => {
              try {
                return new File([await entry.getData(new BlobWriter(), { checkSignature: true })], name);
              } catch {
                throw new Error(`Could not read ${name} in ${file.name}. Choose a valid, unencrypted Takeout ZIP.`);
              }
            },
          });
        }
      } catch {
        throw new Error(`Could not open ${file.name}. Choose a valid, unencrypted Takeout ZIP or original photos.`);
      }
    }
    return await parsePhotoSources(sources, onProgress);
  } finally {
    await Promise.allSettled(closeArchives.map((close) => close()));
  }
}

export async function parseGooglePhotosFolder(
  files: File[],
  onProgress?: (message: string) => void,
): Promise<PhotoImportResult> {
  return parseGooglePhotosFiles(files, onProgress);
}

async function parsePhotoSources(
  sources: PhotoFileSource[],
  onProgress?: (message: string) => void,
): Promise<PhotoImportResult> {
  const jsonFiles = sources.filter((file) => /\.json$/i.test(file.name));
  const imageFiles = sources.filter((file) => IMAGE_EXTENSIONS.test(file.name));
  const points: PhotoPoint[] = [];
  const locatedFileNames = new Set<string>();
  let skippedFiles = 0;

  onProgress?.(`Reading ${jsonFiles.length.toLocaleString()} metadata files…`);
  await mapLimit(jsonFiles, 4, async (source, index) => {
    if (source.size > 5 * 1024 * 1024) { skippedFiles += 1; return; }
    const point = await pointFromSidecar(await source.read());
    if (point) {
      points.push(point);
      locatedFileNames.add(point.label.toLowerCase());
    }
    if (index > 0 && index % 500 === 0) onProgress?.(`Read ${index.toLocaleString()} of ${jsonFiles.length.toLocaleString()} metadata files…`);
  });

  const exifFiles = imageFiles.filter((file) => !locatedFileNames.has(file.name.toLowerCase()));
  onProgress?.(`Checking EXIF in ${exifFiles.length.toLocaleString()} remaining images…`);
  await mapLimit(exifFiles, 2, async (source, index) => {
    if (source.size > 100 * 1024 * 1024) { skippedFiles += 1; return; }
    const point = await pointFromExif(await source.read());
    if (point) points.push(point);
    if (index > 0 && index % 200 === 0) onProgress?.(`Checked ${index.toLocaleString()} of ${exifFiles.length.toLocaleString()} images…`);
  });

  const unique = new Map<string, PhotoPoint>();
  for (const point of points) {
    const key = `${point.date}|${point.latitude.toFixed(5)}|${point.longitude.toFixed(5)}`;
    if (!unique.has(key)) unique.set(key, point);
  }
  const drafts = pointsToDrafts(Array.from(unique.values()));
  return {
    drafts,
    stats: {
      jsonFiles: jsonFiles.length,
      imageFiles: imageFiles.length,
      locatedPhotos: unique.size,
      candidateVisits: drafts.length,
      skippedFiles,
    },
  };
}
