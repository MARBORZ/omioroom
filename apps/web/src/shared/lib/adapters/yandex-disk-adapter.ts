import type { MediaSourceInfo } from "@omioroom/contracts";
import { Html5PlayerAdapter } from "./html5-adapter.js";

const API = "https://cloud-api.yandex.net/v1/disk/public/resources/download";

/**
 * A public Yandex Disk file. The public API (open to browsers, no token) hands out a temporary direct
 * link, so every viewer fetches their own and plays it in a plain <video>.
 */
export class YandexDiskPlayerAdapter extends Html5PlayerAdapter {
  private resolvedFor: string | null = null;

  private async resolveDirectLink(shareUrl: string): Promise<string> {
    const url = new URL(shareUrl);
    // /d/<key>/<path> is a file inside a public folder: the key is the folder, the path the file
    const folder = url.pathname.match(/^(\/d\/[\w-]+)(\/.+)$/);
    const publicKey = folder ? `${url.origin}${folder[1]}` : shareUrl;
    const query = new URLSearchParams({ public_key: publicKey });
    if (folder) query.set("path", decodeURIComponent(folder[2]!));

    const res = await fetch(`${API}?${query.toString()}`);
    if (res.status === 404) throw new Error("The file was not found or its public link is closed.");
    if (res.status === 429 || res.status === 403) {
      throw new Error("Yandex Disk limited downloads for this link. Try again later.");
    }
    if (!res.ok) throw new Error("Yandex Disk did not return the file.");
    const body = (await res.json()) as { href?: string };
    if (!body.href) throw new Error("Yandex Disk did not return a direct link.");
    return body.href;
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    this.resolvedFor = media.canonicalUrl;
    const href = await this.resolveDirectLink(media.canonicalUrl);
    // The link expires: if it was replaced while we resolved, do not load a stale one
    if (this.resolvedFor !== media.canonicalUrl) return;
    await super.loadMedia({ ...media, canonicalUrl: href });
  }
}
