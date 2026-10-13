import type { ProductPhoto } from "../types.ts";
import { asRecord } from "./shared.ts";
import type { ToolContext, ToolOutcome } from "./shared.ts";

// send_product_photo: queues one product photo to go out with the reply.
// Photos live in the public product-images bucket under "<store_id>/<file>" (see the migration
// that created it). Only links into this store's folder are ever sent.

export const MAX_PHOTOS_PER_RUN = 2;
const PHOTO_FILE = /\.(jpe?g|png)$/i; // what Instagram accepts (docs: png, jpeg)
const LIMIT_TEXT = "Photo limit reached: at most 2 photos per reply. Don't send more photos.";
const NO_PHOTO_TEXT =
  "no photo for this product. Say you don't have a photo of it yet and offer its description instead.";

// The URL prefix every product photo of this store starts with, or null without a Supabase URL.
export function photoPrefix(storageBase: string | undefined, storeId: string): string | null {
  const base = (storageBase ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^/\s]+$/.test(base)) return null;
  return `${base}/storage/v1/object/public/product-images/${storeId}/`;
}

// A link the agent may send: this store's folder, one plain jpeg or png file, no query or traversal.
export function isStorePhotoUrl(url: string, prefix: string | null): boolean {
  if (!prefix || url.length > 500 || !url.startsWith(prefix)) return false;
  const file = url.slice(prefix.length);
  return file.length > 0 && !/[/\\?#]/.test(file) && !file.includes("..") && PHOTO_FILE.test(file);
}

export async function sendProductPhoto(input: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const args = asRecord(input);
  if (typeof args.product_name !== "string" || !args.product_name.trim()) {
    return { content: "product_name must be a non-empty string", isError: true };
  }
  const { store, catalog } = ctx;
  const queued = ctx.sentPhotos ?? [];
  if (queued.length >= MAX_PHOTOS_PER_RUN) return { content: LIMIT_TEXT };

  const matches = await catalog.searchProducts(store.id, args.product_name.trim().slice(0, 200), 5);
  // Only the best match: a lower-ranked product's photo would be the wrong item.
  const top = matches[0];
  if (!top) {
    return { content: "No matching product. Don't guess; offer to check with the owner." };
  }
  const url = top.image_url ?? null;
  if (!url) return { content: NO_PHOTO_TEXT };
  if (!isStorePhotoUrl(url, photoPrefix(ctx.storageBase, store.id))) {
    console.warn(JSON.stringify({ event: "photo_url_rejected", store_id: store.id, product_id: top.id }));
    return { content: NO_PHOTO_TEXT };
  }

  if (queued.some((p) => p.url === url)) {
    return { content: "This photo is already queued for this reply. Don't send it again." };
  }
  if (ctx.photos && ctx.conversationId) {
    const sent = await ctx.photos.sentUrls(ctx.conversationId);
    if (sent.includes(url)) {
      return {
        content:
          "This photo was already sent to the customer in this chat. Don't send it again; say you already shared it.",
      };
    }
  }

  // No await from here on: the limit and duplicate checks and the push happen together.
  if (queued.length >= MAX_PHOTOS_PER_RUN) return { content: LIMIT_TEXT };
  if (queued.some((p) => p.url === url)) {
    return { content: "This photo is already queued for this reply. Don't send it again." };
  }
  const photo: ProductPhoto = { url, name: top.name };
  ctx.sentPhotos?.push(photo);
  return {
    content:
      `Photo of ${top.name} will be sent with your reply. Say you are sending it; don't write a link or the photo's address.`,
    photos: [photo],
  };
}
