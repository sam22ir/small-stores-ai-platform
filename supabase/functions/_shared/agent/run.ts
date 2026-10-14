import type Anthropic from "@anthropic-ai/sdk";
import { conversationLang, conversationSignal, hasArabicScript, holdingReply } from "./language.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { capLookupOutputs, errorText, executeTool, lookupOutput, toolsForStore } from "./tools.ts";
import { assistantBeforeCurrentTurn, currentCustomerText, type RunState } from "./tools/order-guard.ts";
import type {
  AgentResult,
  Catalog,
  ChatMessage,
  DeliveryFeesPort,
  FaqPort,
  OrderPort,
  PhotoPort,
  ProductPhoto,
  StoreContext,
  ToolCallLog,
} from "./types.ts";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResultParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 6; // search, create_order, one retry, then the reply
const MAX_TOKENS = 1024;
// Instagram caps a text message at 1000 bytes (UTF-8), so non-Latin scripts fit less.
export const MAX_REPLY_BYTES = 950;

// English default; the loops below answer in the customer's language (see language.ts).
export const HANDOFF_HOLDING_REPLY = holdingReply("en");

export interface RunAgentOptions {
  client: Anthropic;
  catalog: Catalog;
  store: StoreContext;
  history: ChatMessage[]; // oldest first; the last entry is the customer's new message
  model?: string;
  orders?: OrderPort;
  fees?: DeliveryFeesPort;
  faq?: FaqPort;
  conversationId?: string;
  customerId?: string;
  lookups?: string[]; // facts from earlier lookups in this chat, oldest first (see lookupSection)
  storageBase?: string; // SUPABASE_URL, for the product photo links (tools/photo.ts)
  photos?: PhotoPort; // photos already sent in this chat
}

// Models that accept `output_config.effort` and the server-side refusal fallback.
function isFrontierModel(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

export type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

// One turn after merging: consecutive same-role messages become one turn.
export interface Turn {
  role: "user" | "assistant";
  text: string;
  images: { dataUrl: string }[];
}

// The API combines consecutive same-role turns, but the first must be `user`.
export function mergeTurns(history: ChatMessage[]): Turn[] {
  const out: Turn[] = [];
  for (const m of history) {
    if (!m.text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.text = `${last.text}\n${m.text}`;
      last.images.push(...(m.images ?? []));
    } else {
      out.push({ role: m.role, text: m.text, images: [...(m.images ?? [])] });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

// The model sometimes writes the same text twice in one reply (a whole reply twice, or a sentence
// twice, with or without a space between). Removes only exact repeats; kept text is copied as written.
const REPEAT_MIN_CHARS = 12; // shorter pieces ("Oui.") may repeat legitimately
const SENTENCE_PIECE = /[^.!?؟…]*[.!?؟…]+|[^.!?؟…]+$/g;

// "X X" or "XX" where both halves are the same text: returns X.
function wholeReplyTwice(text: string): string | null {
  const t = text.trim();
  const mid = Math.floor(t.length / 2);
  for (let cut = mid - 3; cut <= mid + 3; cut++) {
    if (cut <= 0 || cut >= t.length) continue;
    const left = t.slice(0, cut).trim();
    if (left.length >= REPEAT_MIN_CHARS && left === t.slice(cut).trim()) return left;
  }
  return null;
}

export function dedupeRepeatedText(text: string): string {
  const source = wholeReplyTwice(text) ?? text;
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of source.split("\n")) {
    const pieces = line.match(SENTENCE_PIECE);
    if (!pieces) {
      kept.push(line);
      continue;
    }
    const out: string[] = [];
    let dropped = false;
    for (const piece of pieces) {
      const key = piece.replace(/\s+/g, " ").trim();
      if (key.length >= REPEAT_MIN_CHARS) {
        if (seen.has(key)) {
          dropped = true;
          continue;
        }
        seen.add(key);
      }
      out.push(piece);
    }
    if (!dropped) {
      kept.push(line);
      continue;
    }
    const rebuilt = out.join("").trim();
    if (rebuilt) kept.push(rebuilt);
  }
  const result = kept.join("\n");
  return result === text ? text : result.trim();
}

// Splits a data URL from meta/media.ts into the media type and base64 data Anthropic expects.
export function imageSource(dataUrl: string): { media_type: ImageType; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  return m ? { media_type: m[1] as ImageType, data: m[2] } : null;
}

export function toMessageParams(history: ChatMessage[]): MessageParam[] {
  return mergeTurns(history).map((t): MessageParam => {
    const images = t.images.flatMap((i): Anthropic.Beta.Messages.BetaImageBlockParam[] => {
      const source = imageSource(i.dataUrl);
      return source ? [{ type: "image", source: { type: "base64", ...source } }] : [];
    });
    if (images.length === 0) return { role: t.role, content: t.text };
    return { role: t.role, content: [{ type: "text", text: t.text }, ...images] };
  });
}

const LATIN_DARIJA_SYSTEM =
  "Rewrite the customer message below in Algerian Darija written in Latin letters (arabizi). Use only Latin letters, digits and punctuation: no Arabic script and no French sentences. Keep every fact, number, price, name and phone number exactly. Reply with the rewritten message only.";

// A Darija reply must not contain Arabic script. If the model wrote some anyway, ask once for a
// rewrite and keep it only when it is clean; otherwise keep the original reply.
export async function toLatinDarija(
  reply: string,
  ask: (system: string, user: string) => Promise<string>,
): Promise<string> {
  if (!hasArabicScript(reply)) return reply;
  try {
    const rewritten = (await ask(LATIN_DARIJA_SYSTEM, reply)).trim();
    if (rewritten && !hasArabicScript(rewritten)) return rewritten;
  } catch (err) {
    console.error("latin darija rewrite failed", err instanceof Error ? err.message : err);
  }
  return reply;
}

export function truncateUtf8(text: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  let out = "";
  let bytes = encoder.encode("…").length;
  for (const ch of text) {
    const n = encoder.encode(ch).length;
    if (bytes + n > maxBytes) break;
    out += ch;
    bytes += n;
  }
  return `${out.trimEnd()}…`;
}

export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const { client, catalog, store } = opts;
  const model = opts.model ?? DEFAULT_MODEL;
  const messages = toMessageParams(opts.history);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    throw new Error("history must end with a customer message");
  }

  const toolCalls: ToolCallLog[] = [];
  const sentPhotos: ProductPhoto[] = []; // queued by send_product_photo, sent after the reply
  const runState: RunState = { quoteRequested: false };
  const lastAssistantText = assistantBeforeCurrentTurn(opts.history);
  const customerText = currentCustomerText(opts.history);
  const usage = { input_tokens: 0, output_tokens: 0 };
  let handoffReason: string | null = null;
  let handoffSummary: string | null = null;
  let reply = "";

  const frontier = isFrontierModel(model);
  const system = buildSystemPrompt(store, conversationSignal(opts.history), opts.lookups);
  const tools = toolsForStore(store);

  for (let round = 0; ; round++) {
    if (round >= MAX_TOOL_ROUNDS) {
      handoffReason = handoffReason ?? "Agent used too many tool calls";
      break;
    }

    const response = await client.beta.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages,
      ...(frontier
        ? {
          output_config: { effort: "low" as const },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }
        : {}),
    });
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;

    // A policy refusal or a cut-off answer must never reach the customer.
    if (response.stop_reason === "refusal") {
      handoffReason = handoffReason ?? "Model declined to answer";
      break;
    }
    if (response.stop_reason === "max_tokens") {
      handoffReason = handoffReason ?? "Answer was too long";
      break;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.Messages.BetaToolUseBlock =>
        b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      reply = dedupeRepeatedText(
        response.content
          .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock =>
            b.type === "text"
          )
          .map((b) => b.text)
          .join("\n"),
      ).trim();
      break;
    }

    // Echo the assistant turn back unchanged (thinking blocks included).
    messages.push({ role: "assistant", content: response.content });
    // Before any tool runs: a quote and a create_order in the same round must see the quote as requested.
    if (toolUses.some((u) => u.name === "quote_delivery")) runState.quoteRequested = true;

    const results: ToolResultParam[] = await Promise.all(
      toolUses.map(async (use): Promise<ToolResultParam> => {
        try {
          const outcome = await executeTool(use.name, use.input, {
            store,
            catalog,
            orders: opts.orders,
            fees: opts.fees,
            faq: opts.faq,
            conversationId: opts.conversationId,
            customerId: opts.customerId,
            storageBase: opts.storageBase,
            photos: opts.photos,
            sentPhotos,
            lastAssistantText,
            customerText,
            lookups: opts.lookups ?? [],
            run: runState,
          });
          if (outcome.handoffReason) {
            handoffReason = outcome.handoffReason;
            handoffSummary = outcome.handoffSummary ?? null;
          }
          const output = outcome.isError ? undefined : lookupOutput(use.name, use.input, outcome.content);
          toolCalls.push({
            name: use.name,
            input: use.input,
            is_error: !!outcome.isError,
            ...(outcome.isError ? { error: outcome.content.slice(0, 300) } : {}),
            ...(output ? { output } : {}),
          });
          return {
            type: "tool_result",
            tool_use_id: use.id,
            content: outcome.content,
            ...(outcome.isError ? { is_error: true } : {}),
          };
        } catch (err) {
          toolCalls.push({
            name: use.name,
            input: use.input,
            is_error: true,
            error: errorText(err),
          });
          console.error(`tool ${use.name} failed`, err);
          return {
            type: "tool_result",
            tool_use_id: use.id,
            content: "The lookup failed. Offer to check with the owner.",
            is_error: true,
          };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }

  if (reply && conversationLang(opts.history) === "dz") {
    reply = await toLatinDarija(reply, async (system, user) => {
      const r = await client.beta.messages.create({
        model,
        max_tokens: 512,
        system,
        messages: [{ role: "user", content: user }],
      });
      usage.input_tokens += r.usage.input_tokens;
      usage.output_tokens += r.usage.output_tokens;
      return r.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    });
  }

  if (!reply) {
    // Nothing safe to say: either a handoff was requested or the loop gave up.
    reply = holdingReply(conversationLang(opts.history));
    handoffReason = handoffReason ?? "No reply was produced";
  }

  return {
    reply: truncateUtf8(reply, MAX_REPLY_BYTES),
    handoffReason,
    handoffSummary,
    toolCalls: capLookupOutputs(toolCalls),
    usage,
    model,
    ...(sentPhotos.length ? { photos: sentPhotos } : {}),
  };
}
