export const PROFILE_PHOTO_BUCKET = "trip-documents";
export const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

export function profilePhotoPath(metadata: Record<string, unknown> | undefined, userId: string): string | null {
  const value = metadata?.avatar_path;
  const prefix = `${userId}/profile/`;
  return typeof value === "string" && value.startsWith(prefix) &&
    /^[a-f0-9-]{36}\.(webp|png|jpg)$/.test(value.slice(prefix.length)) ? value : null;
}

export function profilePhotoUrl(path: string | null): string | null {
  return path ? `/api/profile/photo?v=${encodeURIComponent(path)}` : null;
}

export function photoFormat(bytes: Uint8Array): { mime: string; extension: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { mime: "image/png", extension: "png" };
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return { mime: "image/webp", extension: "webp" };
  return null;
}
