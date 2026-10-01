import assert from "node:assert/strict";
import test from "node:test";
import { BlobReader, BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Use the app's TypeScript code with Node's CJS interop for exifr.
const filename = fileURLToPath(new URL("../src/lib/googlePhotos.ts", import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const require = createRequire(filename);
const parserModule = { exports: {} };
const testRequire = (name) => {
  const library = require(name);
  if (name !== "exifr") return library;
  // exifr uses FileReader for browser Files; Node receives the equivalent byte buffer.
  return {
    gps: async (file) => library.gps(await file.arrayBuffer()),
    parse: async (file, options) => library.parse(await file.arrayBuffer(), options),
  };
};
new Function("require", "exports", "module", compiled)(testRequire, parserModule.exports, parserModule);
const { parseGooglePhotosFiles } = parserModule.exports;

const metadata = (title, timestamp = "1721044800") => JSON.stringify({
  title,
  photoTakenTime: { timestamp },
  geoData: { latitude: 38.7223, longitude: -9.1393 },
});

async function zip(entries, name = "takeout.zip") {
  const writer = new ZipWriter(new BlobWriter(), { useWebWorkers: false });
  for (const [path, content] of entries) {
    await writer.add(path, typeof content === "string" ? new TextReader(content) : new BlobReader(content));
  }
  return new File([await writer.close()], name);
}

function gpsPhoto() {
  // Minimal TIFF containing a capture date and GPS IFD, like an original camera file.
  const buffer = Buffer.alloc(210);
  buffer.write("II");
  buffer.writeUInt16LE(42, 2);
  buffer.writeUInt32LE(8, 4);
  const entry = (offset, tag, type, count, value) => {
    buffer.writeUInt16LE(tag, offset);
    buffer.writeUInt16LE(type, offset + 2);
    buffer.writeUInt32LE(count, offset + 4);
    buffer.writeUInt32LE(value, offset + 8);
  };
  buffer.writeUInt16LE(2, 8);
  entry(10, 0x8769, 4, 1, 38);
  entry(22, 0x8825, 4, 1, 76);
  buffer.writeUInt16LE(1, 38);
  entry(40, 0x9003, 2, 20, 142);
  buffer.writeUInt16LE(4, 76);
  entry(78, 1, 2, 2, 78); // N
  entry(90, 2, 5, 3, 162);
  entry(102, 3, 2, 2, 87); // W
  entry(114, 4, 5, 3, 186);
  buffer.write("2024:07:15 12:00:00\0", 142);
  [38, 43, 20, 9, 8, 21].forEach((number, index) => {
    buffer.writeUInt32LE(number, 162 + index * 8);
    buffer.writeUInt32LE(1, 166 + index * 8);
  });
  return new File([buffer], "original.tiff");
}

await test("nested Takeout ZIPs match loose metadata and deduplicate multiple archive parts", async () => {
  const json = metadata("lisbon.jpg");
  const loose = await parseGooglePhotosFiles([new File([json], "lisbon.jpg.json")]);
  const first = await zip([
    ["Takeout/Google Photos/2024/lisbon.jpg.supplemental-metadata.json", json],
    ["Takeout/Google Photos/2024/lisbon.jpg", new Blob(["should not need EXIF"])] ,
    ["unrelated/readme.txt", "ignored"],
  ]);
  const second = await zip([["Takeout/Google Photos/Album/lisbon.jpg.json", json]], "part2.zip");
  const result = await parseGooglePhotosFiles([first, second]);
  assert.deepEqual(result.drafts, loose.drafts);
  assert.equal(result.stats.locatedPhotos, 1);
  assert.equal(result.stats.jsonFiles, 2);
  assert.equal(result.stats.imageFiles, 1);
});

await test("original GPS photos work loose and inside ZIPs without sidecars", async () => {
  const file = gpsPhoto();
  const loose = await parseGooglePhotosFiles([file]);
  assert.equal(loose.stats.locatedPhotos, 1);
  assert.ok(Math.abs(loose.drafts[0].latitude - 38.7222) < 0.001);
  const archive = await zip([["photos/original.tiff", file]]);
  assert.deepEqual((await parseGooglePhotosFiles([archive])).drafts, loose.drafts);
});

await test("bad JSON, photos without GPS, and unrelated files return no visits", async () => {
  const result = await parseGooglePhotosFiles([
    new File(["invalid"], "broken.json"),
    new File(["no EXIF"], "no-location.jpg"),
    new File(["ignored"], "notes.txt"),
  ]);
  assert.equal(result.drafts.length, 0);
});

await test("corrupt ZIPs report which archive failed", async () => {
  await assert.rejects(parseGooglePhotosFiles([new File(["invalid ZIP"], "broken.zip")]), /Could not open broken.zip/);
});

await test("oversized metadata is skipped before decompressing it", async () => {
  const archive = await zip([["large.json", " ".repeat(5 * 1024 * 1024 + 1)]]);
  const result = await parseGooglePhotosFiles([archive]);
  assert.equal(result.stats.skippedFiles, 1);
  assert.equal(result.drafts.length, 0);
});
