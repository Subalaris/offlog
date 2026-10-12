"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { profilePhotoUrl } from "@/lib/profilePhoto";
import { removeProfilePhoto, uploadProfilePhoto } from "./actions";

async function preparePhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Choose a photo smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    if (!side) throw new Error("This photo could not be read.");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare your photo.");
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 512, 512);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.85));
    if (!blob) throw new Error("This photo could not be read.");
    return new File([blob], "profile-photo", { type: blob.type });
  } finally { URL.revokeObjectURL(url); }
}

export function ProfilePhoto({ path, initials }: { path: string | null; initials: string }) {
  const router = useRouter();
  const [savedPath, setSavedPath] = useState(path);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState({ text: "", error: false });
  useEffect(() => setSavedPath(path), [path]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPending(true);
    setStatus({ text: "", error: false });
    try {
      const prepared = await preparePhoto(file);
      setPhoto(prepared);
      setPreview(URL.createObjectURL(prepared));
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not read your photo.", error: true });
    } finally { setPending(false); }
  }

  async function save(remove = false) {
    setPending(true);
    setStatus({ text: "", error: false });
    try {
      const data = new FormData();
      if (photo) data.set("photo", photo);
      const result = remove ? await removeProfilePhoto() : await uploadProfilePhoto(data);
      if (result.error) throw new Error(result.error);
      setSavedPath("path" in result && typeof result.path === "string" ? result.path : null);
      setPhoto(null);
      setPreview(null);
      setStatus({ text: remove ? "Photo removed." : "Photo saved.", error: false });
      router.refresh();
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not update your photo. Please try again.", error: true });
    } finally { setPending(false); }
  }

  return (
    <section className="card">
      <h2 className="profile-heading">Profile picture</h2>
      <div className="profile-photo-row">
        <Avatar src={preview || profilePhotoUrl(savedPath)} initials={initials} className="profile-photo-preview" />
        <div>
          <label className="field">Choose a photo
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={choosePhoto} />
          </label>
          <p className="profile-help">JPEG, PNG, or WebP up to 10 MB. Preview the square crop before saving.</p>
          <div className="profile-photo-actions">
            {photo && <>
              <button type="button" className="btn btn-primary" disabled={pending} onClick={() => void save()}>{pending ? "Saving…" : "Save photo"}</button>
              <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => { setPhoto(null); setPreview(null); setStatus({ text: "", error: false }); }}>Cancel</button>
            </>}
            {savedPath && <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => void save(true)}>Remove photo</button>}
          </div>
        </div>
      </div>
      {status.text && <p role={status.error ? "alert" : "status"} className={`auth-message ${status.error ? "auth-error" : ""}`}>{status.text}</p>}
    </section>
  );
}
