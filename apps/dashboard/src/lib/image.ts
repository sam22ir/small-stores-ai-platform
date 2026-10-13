// Product photos: the owner's file is resized in the browser before upload, so the bucket only holds
// small JPEGs. fitWithin is the pure part (unit tested); resizeToJpeg needs the browser canvas API.

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 2 * 1024 * 1024; // matches the product-images bucket limit
export const PHOTO_MAX_SIDE = 1200;
export const PHOTO_QUALITY = 0.85;

// Scales (w, h) so the long side is at most max. Never upscales. Each side is at least 1 pixel.
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

// Decodes the photo (EXIF rotation applied), draws it on white (transparent PNGs would turn black as
// JPEG), and re-encodes it as JPEG. Rejects if the browser cannot decode the file.
export async function resizeToJpeg(file: Blob, max = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("encoding failed");
    return blob;
  } finally {
    bitmap.close();
  }
}

// The storage path ("<store_id>/<file>.jpg") behind a public product-images URL, or null for any other URL.
export function photoPathFromUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/product-images/";
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = url.slice(i + marker.length).split(/[?#]/)[0];
  return path && !path.includes("..") ? path : null;
}

// A product photo this project sent (the assistant's photo replies). Only URLs under this project's
// public product-images folder pass: Instagram's own media links in inbound messages expire and are
// never shown. storageBase is VITE_SUPABASE_URL.
export function isOwnPhotoUrl(url: unknown, storageBase: string | undefined): url is string {
  if (typeof url !== "string" || !storageBase) return false;
  const base = storageBase.trim().replace(/\/+$/, "");
  return url.startsWith(`${base}/storage/v1/object/public/product-images/`) && photoPathFromUrl(url) !== null;
}

export interface SentPhoto {
  url: string;
  caption: string;
}

// The photos on an outbound message's attachments ({type, url, caption}), own photos only.
export function outboundPhotos(attachments: unknown, storageBase: string | undefined): SentPhoto[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((a: { type?: unknown; url?: unknown; caption?: unknown }) => {
    if (a?.type !== "image" || !isOwnPhotoUrl(a.url, storageBase)) return [];
    return [{ url: a.url, caption: typeof a.caption === "string" ? a.caption : "" }];
  });
}

// The photos the assistant chat returns ({url, name}), own photos only.
export function replyPhotos(photos: unknown, storageBase: string | undefined): SentPhoto[] {
  if (!Array.isArray(photos)) return [];
  return photos.flatMap((p: { url?: unknown; name?: unknown }) => {
    if (!isOwnPhotoUrl(p?.url, storageBase)) return [];
    return [{ url: p.url, caption: typeof p.name === "string" ? p.name : "" }];
  });
}
