import type Anthropic from "@anthropic-ai/sdk";
import { detectLang, holdingReply, lastCustomerText } from "./language.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { errorText, executeTool, toolsForStore } from "./tools.ts";
import type {
  AgentResult,
  Catalog,
  ChatMessage,
  OrderPort,
  StoreContext,
  ToolCallLog,
} from "./types.ts";

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResultParam = Anthropic.Beta.Messages.BetaToolResultBlockParam;

export const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_TOOL_ROUNDS = 5;
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
  conversationId?: string;
  customerId?: string;
}

// Models that accept `output_config.effort` and the server-side refusal fallback.
function isFrontierModel(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

// The API combines consecutive same-role turns, but the first must be `user`.
export function toMessageParams(history: ChatMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of history) {
    if (!m.text.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content as string}\n${m.text}`;
    } else {
      out.push({ role: m.role, content: m.text });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
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
  const usage = { input_tokens: 0, output_tokens: 0 };
  let handoffReason: string | null = null;
  let reply = "";

  const frontier = isFrontierModel(model);
  const system = buildSystemPrompt(store);
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
      reply = response.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock =>
          b.type === "text"
        )
        .map((b) => b.text)
        .join("\n")
        .trim();
      break;
    }

    // Echo the assistant turn back unchanged (thinking blocks included).
    messages.push({ role: "assistant", content: response.content });

    const results: ToolResultParam[] = await Promise.all(
      toolUses.map(async (use): Promise<ToolResultParam> => {
        try {
          const outcome = await executeTool(use.name, use.input, {
            store,
            catalog,
            orders: opts.orders,
            conversationId: opts.conversationId,
            customerId: opts.customerId,
          });
          if (outcome.handoffReason) handoffReason = outcome.handoffReason;
          toolCalls.push({
            name: use.name,
            input: use.input,
            is_error: !!outcome.isError,
            ...(outcome.isError ? { error: outcome.content.slice(0, 300) } : {}),
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

  if (!reply) {
    // Nothing safe to say: either a handoff was requested or the loop gave up.
    reply = holdingReply(detectLang(lastCustomerText(opts.history)));
    handoffReason = handoffReason ?? "No reply was produced";
  }

  return {
    reply: truncateUtf8(reply, MAX_REPLY_BYTES),
    handoffReason,
    toolCalls,
    usage,
    model,
  };
}
