import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_DIMENSION,
  CHAT_IMAGE_MIME_TYPES,
} from "@omioroom/contracts";

export class ChatImageError extends Error {
  constructor(public readonly reason: "type" | "size") {
    super(reason);
  }
}

export interface PreparedImage {
  blob: Blob;
  extension: string;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function isAllowedChatImage(file: File): boolean {
  return (CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);
}

/**
 * Validates the file and shrinks big photos (phone cameras produce 5-12 MB images). Gifs are kept
 * as they are, because re-encoding would drop the animation.
 */
export async function prepareChatImage(file: File): Promise<PreparedImage> {
  if (!isAllowedChatImage(file)) throw new ChatImageError("type");
  const extension = EXTENSIONS[file.type] ?? "png";

  if (file.type === "image/gif") {
    if (file.size > CHAT_IMAGE_MAX_BYTES) throw new ChatImageError("size");
    return { blob: file, extension };
  }

  let result: Blob = file;
  try {
    // Respects EXIF orientation, so portrait phone photos stay upright
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, CHAT_IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale < 1 || file.size > 2 * 1024 * 1024) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
      const encoded = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outType, 0.85));
      if (encoded && encoded.size < file.size) {
        result = encoded;
      }
    }
    bitmap.close();
  } catch {
    // Decoding failed (e.g. avif on an old browser): upload the original if it fits
  }

  if (result.size > CHAT_IMAGE_MAX_BYTES) throw new ChatImageError("size");
  const finalType = result.type || file.type;
  return { blob: result, extension: EXTENSIONS[finalType] ?? extension };
}
