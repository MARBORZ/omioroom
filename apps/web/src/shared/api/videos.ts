import { supabase } from "./supabase.js";

const BUCKET = "videos";
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

export interface StoredVideo {
  name: string;
  url: string;
  size: number;
  createdAt: string | null;
}

export function videoUrl(name: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(name).data.publicUrl;
}

/** Storage keys are ASCII-only, so the original title is kept as the readable tail of the key. */
function toObjectName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${Date.now().toString(36)}-${base || "video"}${ext}`;
}

export async function listVideos(): Promise<StoredVideo[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list("", { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  if (error) throw error;
  return (data ?? [])
    .filter((f) => f.id)
    .map((f) => ({
      name: f.name,
      url: videoUrl(f.name),
      size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
      createdAt: f.created_at ?? null,
    }));
}

export async function deleteVideo(name: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([name]);
  if (error) throw error;
}

/** Uploads straight to Storage with progress reporting (supabase-js has no progress callback). */
export async function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<StoredVideo> {
  if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) throw new Error("Допустимы только MP4 и WebM");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Файл слишком большой");

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Нужно войти в аккаунт");

  const name = toObjectName(file.name);
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${BUCKET}/${encodeURIComponent(name)}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("Cache-Control", "max-age=31536000");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Ошибка загрузки (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText).message ?? message;
      } catch {
        /* keep the status message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Сеть недоступна"));
    xhr.send(file);
  });

  onProgress(1);
  return { name, url: videoUrl(name), size: file.size, createdAt: new Date().toISOString() };
}
