#!/usr/bin/env node
// Stress runner: drives scripted customer conversations through the REAL inbound pipeline
// (handleInbound) and writes one JSONL record per case (see scripts/stress/SPEC.md, "Result record").
//
//   node scripts/stress-agent.mjs --cases <dir|file|glob> --fixture <fixture.json> --out <results.jsonl>
//       [--concurrency 3] [--limit N] [--ids ID1,ID2] [--resume] [--stub] [--probe] [--verbose]
//
//   --cases        a directory (loads cases-*.json in it), one JSON file, or a glob such as cases/cases-*.json.
//                  Each file is a JSON array of cases: { id, category, turns: [...], expect, ... }.
//   --fixture      the store fixture (products, stock, delivery fees, store settings).
//   --out          JSONL output. One line per finished case; with --resume, a later line for an id wins.
//   --resume       skip ids that already have a clean record in --out (records with infra_error are retried).
//   --stub         answer with a deterministic local model: no network, no key. Self-test only.
//   --probe        one tiny model call ("say ok"); prints OK <status> or FAIL <status> and exits.
//
// Model settings are read from the environment exactly as in production (LLM_PROVIDER=openai-compatible,
// LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, LLM_TOKEN_PARAM, LLM_REASONING_EFFORT, LLM_VISION). No fallback
// provider. Nothing else is read from the environment, and env values and headers are never printed.
// Turns inside a case run in order; cases run in parallel up to --concurrency.

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { makeEnv, installFetchGuard, missingLlmSettings, probe, runCase } from "./stress/runner.mjs";

const CATEGORIES = ["product_stock", "ordering", "policies", "handoff", "language", "adversarial", "noise"];

function parseArgs(argv) {
  const out = { concurrency: 3, resume: false, stub: false, probe: false, verbose: false };
  const takes = new Set(["cases", "fixture", "out", "concurrency", "limit", "ids"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      throw new Error(`unexpected argument: ${a} (quote a glob so the runner expands it: --cases 'dir/cases-*.json')`);
    }
    const key = a.slice(2);
    if (["resume", "stub", "probe", "verbose"].includes(key)) {
      out[key] = true;
    } else if (takes.has(key)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`--${key} needs a value`);
      out[key] = v;
    } else {
      throw new Error(`unknown option --${key}`);
    }
  }
  out.concurrency = Number(out.concurrency);
  if (!Number.isInteger(out.concurrency) || out.concurrency < 1) throw new Error("--concurrency must be a positive integer");
  if (out.limit !== undefined) {
    out.limit = Number(out.limit);
    if (!Number.isInteger(out.limit) || out.limit < 1) throw new Error("--limit must be a positive integer");
  }
  return out;
}

// A directory means cases-*.json inside it; a path with "*" is matched against its file name.
function caseFiles(spec) {
  if (existsSync(spec) && statSync(spec).isDirectory()) {
    return readdirSync(spec).filter((f) => /^cases-.*\.json$/.test(f)).sort().map((f) => join(spec, f));
  }
  if (existsSync(spec)) return [spec];
  if (spec.includes("*")) {
    const dir = dirname(spec);
    const re = new RegExp(`^${basename(spec).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    return readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => join(dir, f));
  }
  throw new Error(`no case file or directory at ${spec}`);
}

function loadCases(spec) {
  const files = caseFiles(spec);
  if (!files.length) throw new Error(`no cases-*.json files in ${spec}`);
  const cases = [];
  const seen = new Set();
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (err) {
      throw new Error(`${file} is not valid JSON: ${err.message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array of cases`);
    parsed.forEach((c, i) => {
      const where = `${basename(file)}[${i}]`;
      if (typeof c?.id !== "string" || !c.id) throw new Error(`${where}: id missing`);
      if (seen.has(c.id)) throw new Error(`${where}: duplicate id ${c.id}`);
      seen.add(c.id);
      if (!CATEGORIES.includes(c.category)) throw new Error(`${where} (${c.id}): unknown category ${c.category}`);
      if (!Array.isArray(c.turns) || c.turns.length < 1 || c.turns.length > 6 ||
        c.turns.some((t) => typeof t !== "string" || !t.trim())) {
        throw new Error(`${where} (${c.id}): turns must be 1 to 6 non-empty strings`);
      }
      cases.push(c);
    });
  }
  return cases;
}

// Records already in the output file. A clean record (no infra_error) counts as done.
function readExisting(out) {
  const done = new Set();
  if (!existsSync(out)) return { done, needsNewline: false };
  const text = readFileSync(out, "utf8");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec?.id && !rec.infra_error) done.add(rec.id);
    } catch {
      // A truncated last line from an interrupted run: ignored, the case is run again.
    }
  }
  return { done, needsNewline: text.length > 0 && !text.endsWith("\n") };
}

async function pool(items, size, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.stub ? "stub" : "live";

  // Model settings come only from the whitelisted environment (see stress/runner.mjs).
  const { env } = makeEnv(mode);
  if (mode === "live") {
    const missing = missingLlmSettings(env);
    if (missing.length) {
      console.error(`Missing model settings: ${missing.join(", ")}. Set them in the environment (see README, Stress test).`);
      return 2;
    }
  }

  if (args.probe) {
    const llmBase = mode === "stub" ? "https://stub.invalid/v1" : env("LLM_BASE_URL");
    installFetchGuard({ mode, fixture: {}, llmBaseUrl: llmBase });
    const status = await probe(env);
    if (status === 200) {
      console.log("OK 200");
      return 0;
    }
    console.log(status === null ? "FAIL network" : `FAIL ${status}`);
    return 1;
  }

  if (!args.cases || !args.fixture || !args.out) {
    console.error("Usage: node scripts/stress-agent.mjs --cases <dir|file|glob> --fixture <fixture.json> --out <results.jsonl> [options]");
    return 2;
  }

  const fixture = JSON.parse(readFileSync(resolve(args.fixture), "utf8"));
  if (!Array.isArray(fixture.products) || !fixture.store) throw new Error("fixture needs store and products");

  let cases = loadCases(args.cases);
  if (args.ids) {
    const want = new Set(args.ids.split(",").map((s) => s.trim()).filter(Boolean));
    const known = new Set(cases.map((c) => c.id));
    const unknown = [...want].filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`unknown case ids: ${unknown.join(", ")}`);
    cases = cases.filter((c) => want.has(c.id));
  }

  const outPath = resolve(args.out);
  const { done, needsNewline } = args.resume ? readExisting(outPath) : { done: new Set(), needsNewline: false };
  if (!args.resume && existsSync(outPath)) {
    throw new Error(`${args.out} exists; pass --resume to continue it or choose another --out`);
  }
  let todo = cases.filter((c) => !done.has(c.id));
  const skipped = cases.length - todo.length;
  if (args.limit) todo = todo.slice(0, args.limit);

  const llmBase = mode === "stub" ? "https://stub.invalid/v1" : env("LLM_BASE_URL");
  installFetchGuard({ mode, fixture, llmBaseUrl: llmBase });
  mkdirSync(dirname(outPath), { recursive: true });
  if (needsNewline) appendFileSync(outPath, "\n");

  // The pipeline logs structured JSON on failures; keep the console quiet unless asked.
  if (!args.verbose) {
    console.warn = () => {};
    console.error = () => {};
    console.info = () => {};
  }
  const log = (line) => process.stderr.write(`${line}\n`);

  let finished = 0;
  let infra = 0;
  await pool(todo, args.concurrency, async (def) => {
    const rec = await runCase(def, { fixture, env });
    appendFileSync(outPath, `${JSON.stringify(rec)}\n`);
    finished++;
    if (rec.infra_error) infra++;
    log(`${rec.id} turns=${rec.turns.length}${rec.infra_error ? ` infra_error=${rec.infra_error}` : ""}`);
  });

  console.log(`done=${finished} infra_error=${infra} skipped=${skipped} out=${args.out}`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`stress-agent: ${err?.message ?? err}\n`);
    process.exitCode = 2;
  },
);
