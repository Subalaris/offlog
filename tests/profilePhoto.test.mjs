import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", compiled)(name => dependencies[name] ?? {}, module.exports, module);
  return module.exports;
}
const photos = load("../src/lib/profilePhoto.ts");
const oldPath = "owner/profile/12345678-1234-1234-1234-123456789abc.png";
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
function form(bytes = png, type = "image/png") {
  const data = new FormData();
  data.set("photo", new File([bytes], "photo.png", { type }));
  return data;
}
function actions({ metadata = { avatar_path: oldPath }, updateError = null, uploadError = null, signedIn = true } = {}) {
  const uploads = [], removals = [], updates = [], paths = [];
  const storage = {
    upload: async (...args) => { uploads.push(args); return { error: uploadError }; },
    remove: async files => { removals.push(files); return { error: null }; },
  };
  const loaded = load("../src/app/profile/actions.ts", {
    "node:crypto": require("node:crypto"),
    "@/lib/profilePhoto": photos,
    "@/lib/auth": { requireUser: async () => { if (!signedIn) throw new Error("Sign in required"); return { id: "owner", user_metadata: metadata }; } },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { updateUser: async payload => { updates.push(payload); return { error: updateError }; } },
      storage: { from: bucket => { assert.equal(bucket, "trip-documents"); return storage; } },
    }) },
    "next/cache": { revalidatePath: path => paths.push(path) },
  });
  return { ...loaded, uploads, removals, updates, paths };
}

await test("photo paths are restricted to the current owner's profile folder", () => {
  assert.equal(photos.profilePhotoPath({ avatar_path: oldPath }, "owner"), oldPath);
  for (const path of [oldPath.replace("owner/", "someone-else/"), "https://tracker.example/photo.png", "owner/profile/../../document.png", "owner/trip/document.png", oldPath.replace(".png", ".svg")]) {
    assert.equal(photos.profilePhotoPath({ avatar_path: path }, "owner"), null);
  }
});

await test("replacement saves a new unique photo before deleting the old photo", async () => {
  const state = actions();
  const result = await state.uploadProfilePhoto(form());
  assert.equal(result.error, null);
  assert.notEqual(result.path, oldPath);
  assert.equal(photos.profilePhotoPath({ avatar_path: result.path }, "owner"), result.path);
  assert.deepEqual(state.updates, [{ data: { avatar_path: result.path } }]);
  assert.deepEqual(state.removals, [[oldPath]]);
  assert.equal(state.uploads[0][2].upsert, false);
});

await test("invalid, oversized, and unauthenticated uploads never write storage", async () => {
  const state = actions();
  for (const data of [form(new Uint8Array(0)), form(new Uint8Array(photos.MAX_PROFILE_PHOTO_BYTES + 1)), form(new TextEncoder().encode("<svg></svg>")), form(png, "image/jpeg")]) {
    assert.ok((await state.uploadProfilePhoto(data)).error);
  }
  assert.equal(state.uploads.length, 0);
  const signedOut = actions({ signedIn: false });
  await assert.rejects(signedOut.uploadProfilePhoto(form()), /Sign in required/);
  assert.equal(signedOut.uploads.length, 0);
});

await test("a failed metadata update rolls back the new upload and retains the old photo", async () => {
  const state = actions({ updateError: { message: "Account update failed" } });
  assert.ok((await state.uploadProfilePhoto(form())).error);
  assert.deepEqual(state.removals, [[state.uploads[0][0]]]);
  assert.ok(!state.removals.flat().includes(oldPath));
  assert.deepEqual(state.paths, []);
  const failedUpload = actions({ uploadError: { message: "Storage unavailable" } });
  assert.ok((await failedUpload.uploadProfilePhoto(form())).error);
  assert.equal(failedUpload.updates.length, 0);
});

await test("removal clears the profile photo and never deletes another owner's file", async () => {
  const state = actions();
  assert.equal((await state.removeProfilePhoto()).error, null);
  assert.deepEqual(state.updates, [{ data: { avatar_path: null } }]);
  assert.deepEqual(state.removals, [[oldPath]]);
  const foreign = actions({ metadata: { avatar_path: oldPath.replace("owner/", "someone-else/") } });
  await foreign.removeProfilePhoto();
  assert.deepEqual(foreign.removals, []);
  const failed = actions({ updateError: { message: "Failed" } });
  assert.ok((await failed.removeProfilePhoto()).error);
  assert.deepEqual(failed.removals, []);
});

await test("photo responses require authentication and serve only the owner's validated picture", async () => {
  let user = { id: "owner", user_metadata: { avatar_path: oldPath } };
  const downloads = [];
  const { GET } = load("../src/app/api/profile/photo/route.ts", {
    "@/lib/profilePhoto": photos,
    "@/lib/auth": { getCurrentUser: async () => user },
    "@/lib/supabase/server": { createClient: async () => ({ storage: { from: () => ({ download: async path => { downloads.push(path); return { data: new Blob([png]), error: null }; } }) } }) },
  });
  const response = await GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  user = { id: "someone-else", user_metadata: { avatar_path: oldPath } };
  assert.equal((await GET()).status, 404);
  user = null;
  assert.equal((await GET()).status, 401);
  assert.deepEqual(downloads, [oldPath]);
});
