// Parsing and authenticating Meta webhook deliveries (Instagram and Messenger share the shape).

export interface InboundEvent {
  platform: "instagram" | "facebook";
  externalId: string; // the connected account: Instagram professional account id or Facebook Page id
  senderId: string; // the customer's Instagram-scoped id / PSID
  mid: string; // Meta's message id, unique per message (used to ignore retries)
  text: string;
  timestampMs: number;
}

interface Attachment {
  type?: string;
}
interface MessagingEvent {
  sender?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_self?: boolean;
    is_deleted?: boolean;
    attachments?: Attachment[];
  };
}
interface WebhookBody {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: MessagingEvent[] }[];
}

// What the assistant sees when a customer sends something that isn't text. Voice notes and
// images aren't understood yet, so the assistant is told what arrived and can ask for text.
const ATTACHMENT_LABELS: Record<string, string> = {
  image: "[image]",
  audio: "[voice message]",
  video: "[video]",
  file: "[file]",
  share: "[shared post]",
  ig_post: "[shared post]",
  ig_reel: "[shared reel]",
  story_mention: "[story mention]",
  reel: "[shared reel]",
};

function describe(message: NonNullable<MessagingEvent["message"]>): string {
  const text = message.text?.trim();
  if (text) return text;
  const type = message.attachments?.[0]?.type;
  return (type && ATTACHMENT_LABELS[type]) || "[attachment]";
}

export function parseWebhook(body: unknown): InboundEvent[] {
  const b = body as WebhookBody;
  const platform = b?.object === "instagram" ? "instagram" : b?.object === "page" ? "facebook" : null;
  if (!platform) return [];

  const events: InboundEvent[] = [];
  for (const entry of b.entry ?? []) {
    if (!entry.id) continue;
    for (const ev of entry.messaging ?? []) {
      const m = ev.message;
      const senderId = ev.sender?.id;
      // Echoes are our own sends; is_self is the account writing to itself; deleted has no content.
      if (!m?.mid || !senderId || m.is_echo || m.is_self || m.is_deleted || senderId === entry.id) continue;
      events.push({
        platform,
        externalId: entry.id,
        senderId,
        mid: m.mid,
        text: describe(m),
        timestampMs: ev.timestamp ?? entry.time ?? Date.now(),
      });
    }
  }
  return events;
}

const enc = new TextEncoder();

// X-Hub-Signature-256 is an HMAC-SHA256 of the raw body with the app secret. The Instagram product
// and the Facebook app can have different secrets, so any configured one is accepted.
export async function validSignature(
  rawBody: string,
  header: string | null,
  secrets: (string | undefined)[],
): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const hex = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const sig = Uint8Array.from(hex.match(/../g)!.map((h) => parseInt(h, 16)));
  for (const secret of secrets) {
    if (!secret) continue;
    const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    // verify() compares in constant time.
    if (await crypto.subtle.verify("HMAC", key, sig as BufferSource, enc.encode(rawBody))) return true;
  }
  return false;
}
