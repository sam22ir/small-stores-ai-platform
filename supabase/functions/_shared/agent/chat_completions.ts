import { conversationLang, detectLang, holdingReply, lastCustomerText } from "./language.ts";
import { buildSystemPrompt } from "./prompt.ts";
import {
  MAX_REPLY_BYTES,
  toLatinDarija,
  toMessageParams,
  truncateUtf8,
} from "./run.ts";
import { capLookupOutputs, errorText, executeTool, lookupOutput, toolsForStore } from "./tools.ts";
import type {
  AgentResult,
  Catalog,
  ChatMessage,
  FaqPort,
  OrderPort,
  StoreContext,
  ToolCallLog,
} from "./types.ts";

// Agent loop for any OpenAI-compatible /chat/completions endpoint (TokenRouter,
// OpenRouter, NVIDIA NIM, ...). Meant for cheap/free testing of the message flow.
// The Claude path in run.ts is the production path; behaviour on other models
// (tool use, languages, prompt-injection resistance) is NOT representative of it.

const MAX_TOOL_ROUNDS = 6; // search, create_order, one retry, then the reply
// Reasoning models spend completion tokens on thinking before they answer.
const MAX_TOKENS = 2048;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_ATTEMPTS = 2;

export interface ChatCompletionsOptions {
  baseUrl: string; // e.g. https://api.tokenrouter.com/v1
  apiKey: string;
  model: string;
  catalog: Catalog;
  store: StoreContext;
  history: ChatMessage[];
  // Newer OpenAI models want `max_completion_tokens`; most other providers take `max_tokens`.
  tokenParam?: "max_tokens" | "max_completion_tokens";
  // e.g. "none" | "low": GPT-6 Luna only allows function calling on Chat Completions at "none".
  reasoningEffort?: string;
  temperature?: number; // omitted unless set: reasoning models often reject it
  timeoutMs?: number; // per request
  maxAttempts?: number; // total tries on 429/5xx; 1 = no retry (use when a fallback exists)
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
  orders?: OrderPort;
  faq?: FaqPort;
  conversationId?: string;
  customerId?: string;
  lookups?: string[]; // facts from earlier lookups in this chat, oldest first
}

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface Completion {
  choices?: {
    message?: { content?: string | null; tool_calls?: ToolCall[] };
    finish_reason?: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

function openAITools(store: StoreContext) {
  return toolsForStore(store).map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// Some reasoning models inline their thinking as <think>...</think>.
export function stripThinking(text: string): string {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // An unclosed tag means the answer was cut off mid-thought: nothing usable.
  return /<think>/i.test(cleaned) ? "" : cleaned.trim();
}

export async function runAgentChatCompletions(
  opts: ChatCompletionsOptions,
): Promise<AgentResult> {
  const { catalog, store, model } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const history = toMessageParams(opts.history);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    throw new Error("history must end with a customer message");
  }
  const messages: Message[] = [
    { role: "system", content: buildSystemPrompt(store, conversationLang(opts.history), opts.lookups) },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content as string,
    })),
  ];

  const tools = openAITools(store);
  const toolCalls: ToolCallLog[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let handoffReason: string | null = null;
  let reply = "";

  async function complete(msgs: Message[] = messages, useTools = true): Promise<Completion> {
    const body = JSON.stringify({
      model,
      messages: msgs,
      ...(useTools ? { tools, tool_choice: "auto" } : {}),
      [opts.tokenParam ?? "max_tokens"]: MAX_TOKENS,
      ...(opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}),
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
    });
    for (let attempt = 1;; attempt++) {
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
      if (res.ok) return await res.json() as Completion;
      // Free tiers rate-limit hard; one patient retry is enough for testing.
      if ((res.status === 429 || res.status >= 500) &&
        attempt < (opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)) {
        await new Promise((r) => setTimeout(r, opts.retryDelayMs ?? 2000));
        continue;
      }
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`LLM request failed (${res.status}): ${detail}`);
    }
  }

  for (let round = 0;; round++) {
    if (round >= MAX_TOOL_ROUNDS) {
      handoffReason = handoffReason ?? "Agent used too many tool calls";
      break;
    }

    const completion = await complete();
    usage.input_tokens += completion.usage?.prompt_tokens ?? 0;
    usage.output_tokens += completion.usage?.completion_tokens ?? 0;

    const choice = completion.choices?.[0];
    if (!choice?.message) throw new Error("LLM response had no choices");
    const msg = choice.message;

    // Some models set finish_reason "stop" even when they return tool calls.
    const calls = msg.tool_calls ?? [];
    if (calls.length === 0) {
      if (choice.finish_reason === "length") {
        handoffReason = handoffReason ?? "Answer was too long";
        break;
      }
      reply = stripThinking(msg.content ?? "");
      break;
    }

    messages.push({
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: calls,
    });

    for (const call of calls) {
      let result: { content: string; is_error: boolean };
      let input: unknown = {};
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        result = { content: "Tool arguments were not valid JSON.", is_error: true };
        toolCalls.push({
          name: call.function.name,
          input,
          is_error: true,
          error: result.content,
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: result.content });
        continue;
      }
      try {
        const outcome = await executeTool(call.function.name, input, {
          store,
          catalog,
          orders: opts.orders,
          faq: opts.faq,
          conversationId: opts.conversationId,
          customerId: opts.customerId,
        });
        if (outcome.handoffReason) handoffReason = outcome.handoffReason;
        const output = outcome.isError ? undefined : lookupOutput(call.function.name, input, outcome.content);
        toolCalls.push({
          name: call.function.name,
          input,
          is_error: !!outcome.isError,
          ...(outcome.isError ? { error: outcome.content.slice(0, 300) } : {}),
          ...(output ? { output } : {}),
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: outcome.content });
      } catch (err) {
        console.error(`tool ${call.function.name} failed`, err);
        toolCalls.push({
          name: call.function.name,
          input,
          is_error: true,
          error: errorText(err),
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "The lookup failed. Offer to check with the owner.",
        });
      }
    }
  }

  if (reply && conversationLang(opts.history) === "dz") {
    reply = await toLatinDarija(reply, async (system, user) => {
      const completion = await complete([
        { role: "system", content: system },
        { role: "user", content: user },
      ], false);
      usage.input_tokens += completion.usage?.prompt_tokens ?? 0;
      usage.output_tokens += completion.usage?.completion_tokens ?? 0;
      return stripThinking(completion.choices?.[0]?.message?.content ?? "");
    });
  }

  if (!reply) {
    reply = holdingReply(conversationLang(opts.history));
    handoffReason = handoffReason ?? "No reply was produced";
  }

  return {
    reply: truncateUtf8(reply, MAX_REPLY_BYTES),
    handoffReason,
    toolCalls: capLookupOutputs(toolCalls),
    usage,
    model,
  };
}
