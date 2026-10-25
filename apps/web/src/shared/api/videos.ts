import { supabase } from "./supabase.js";

const VIDEO_BUCKET = "videos";
const THUMB_BUCKET = "video-thumbnails";
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024 * 1024;
export const VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

/** A row of public.videos plus the public addresses of its file and preview. */
export interface Video {
  id: string;
  title: string;
  storagePath: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  thumbnailPath: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

interface VideoRow {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  duration_seconds: number | null;
  thumbnail_path: string | null;
  created_at: string;
}

function toVideo(row: VideoRow): Video {
  return {
    id: row.id,
    title: row.title,
    storagePath: row.storage_path,
    url: supabase.storage.from(VIDEO_BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    durationSeconds: row.duration_seconds,
    thumbnailPath: row.thumbnail_path,
    thumbnailUrl: row.thumbnail_path
      ? supabase.storage.from(THUMB_BUCKET).getPublicUrl(row.thumbnail_path).data.publicUrl
      : null,
    createdAt: row.created_at,
  };
}

export async function listVideos(): Promise<Video[]> {
  const { data, error } = await supabase.from("videos").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return ((data ?? []) as VideoRow[]).map(toVideo);
}

export async function deleteVideo(video: Video): Promise<void> {
  const { error } = await supabase.from("videos").delete().eq("id", video.id);
  if (error) throw error;
  // The catalogue row is the source of truth; leftover files are only wasted space
  await supabase.storage.from(VIDEO_BUCKET).remove([video.storagePath]).catch(() => {});
  if (video.thumbnailPath) await supabase.storage.from(THUMB_BUCKET).remove([video.thumbnailPath]).catch(() => {});
}

export async function renameVideo(id: string, title: string): Promise<void> {
  const { error } = await supabase.from("videos").update({ title }).eq("id", id);
  if (error) throw error;
}

/** Storage keys are ASCII-only; the readable title is kept in the table. */
function toObjectName(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${crypto.randomUUID().slice(0, 8)}-${base || "video"}${ext}`;
}

export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").trim().slice(0, 200) || "Видео";
}

export interface VideoProbe {
  durationSeconds: number | null;
  thumbnail: Blob | null;
}

/** Reads the duration and grabs a preview frame in the browser; either may be missing for odd codecs. */
export function probeVideo(file: File): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let durationSeconds: number | null = null;

    const done = (thumbnail: Blob | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      resolve({ durationSeconds, thumbnail });
    };
    const timeout = setTimeout(() => done(null), 15000);

    video.onerror = () => {
      clearTimeout(timeout);
      done(null);
    };
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) durationSeconds = Math.round(video.duration);
      // A frame a bit into the film is usually better than the black first one
      video.currentTime = Number.isFinite(video.duration) ? Math.min(video.duration * 0.1, 60) : 0;
    };
    video.onseeked = () => {
      clearTimeout(timeout);
      try {
        const scale = Math.min(1, 640 / (video.videoWidth || 640));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round((video.videoWidth || 640) * scale));
        canvas.height = Math.max(1, Math.round((video.videoHeight || 360) * scale));
        canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => done(blob), "image/jpeg", 0.8);
      } catch {
        done(null);
      }
    };
    video.src = url;
  });
}

async function uploadWithProgress(bucket: string, name: string, file: Blob, onProgress: (f: number) => void) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Нужно войти в аккаунт");
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${bucket}/${encodeURIComponent(name)}`);
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
        const body = JSON.parse(xhr.responseText);
        message = body.message ?? message;
        // Storage answers 400 with the real status in the body
        if (String(body.statusCode) === "413" || /maximum allowed size|too large/i.test(String(body.message))) {
          message = "Файл больше лимита хранилища проекта (на бесплатном тарифе Supabase это 50 МБ)";
        }
      } catch {
        /* keep the status message */
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Сеть недоступна"));
    xhr.send(file);
  });
}

/** Uploads the file, its preview, and records the video in the catalogue. */
export async function uploadVideo(file: File, title: string, onProgress: (fraction: number) => void): Promise<Video> {
  if (!(VIDEO_TYPES as readonly string[]).includes(file.type)) throw new Error("Допустимы только MP4 и WebM");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Файл слишком большой");

  const probe = await probeVideo(file);
  const storagePath = toObjectName(file.name);
  await uploadWithProgress(VIDEO_BUCKET, storagePath, file, onProgress);

  let thumbnailPath: string | null = null;
  if (probe.thumbnail) {
    thumbnailPath = storagePath.replace(/\.[^.]+$/, "") + ".jpg";
    try {
      await uploadWithProgress(THUMB_BUCKET, thumbnailPath, probe.thumbnail, () => {});
    } catch {
      thumbnailPath = null;
    }
  }

  const { data, error } = await supabase
    .from("videos")
    .insert({
      title: title.trim().slice(0, 200) || titleFromFileName(file.name),
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      duration_seconds: probe.durationSeconds,
      thumbnail_path: thumbnailPath,
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from(VIDEO_BUCKET).remove([storagePath]).catch(() => {});
    if (thumbnailPath) await supabase.storage.from(THUMB_BUCKET).remove([thumbnailPath]).catch(() => {});
    throw error;
  }
  onProgress(1);
  return toVideo(data as VideoRow);
}
