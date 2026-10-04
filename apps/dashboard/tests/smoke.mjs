// Browser smoke test: drives the built app against tests/mock.mjs (a stand-in for Supabase).
//   npm run test:ui          (needs a Chromium: set CHROMIUM_PATH, or run `npx playwright-core install chromium`)
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { start, state } from "./mock.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = ROOT + ".test-shots/";
import fs from "node:fs"; fs.mkdirSync(OUT, { recursive: true });

const mock = await start();
const preview = spawn("npx", ["vite", "preview", "--outDir", ".test-dist", "--port", "4173", "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 3500));

// Set CHROMIUM_PATH to use an existing Chrome/Chromium; otherwise Playwright's own browser is used.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? "PASS " : "FAIL ") + name); };

async function logged(pred, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (state.log.some(pred)) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  return { page, ctx, errors };
}

try {
  // 1. login + inbox
  let { page, ctx, errors } = await newPage({ locale: "en-US" });
  await page.goto("http://127.0.0.1:4173/");
  await page.waitForURL(/\/login/);
  ok("redirects anonymous user to /login", true);
  await page.screenshot({ path: OUT + "01-login.png" });
  await page.fill("#email", "owner@example.com");
  await page.fill("#password", "password123");
  await page.click("button.btn-primary");
  await page.waitForURL(/\/inbox/);
  await page.waitForSelector("text=Customer chats");
  ok("sign-in lands on the inbox", true);
  ok("'Needs you' tab shows the handed-off chat", await page.isVisible("text=Playground t4"));
  ok("handoff reason is visible on the card", await page.isVisible("text=Customer wants to order 2 hoodies"));
  ok("inbox card previews the latest message", await page.isVisible("text=The owner will reply to you personally."));
  ok("tab counts rendered", await page.isVisible("text=Needs you (1)"));
  await page.screenshot({ path: OUT + "02-inbox.png" });

  await page.click("[role=tab]:has-text('Assistant')");
  ok("assistant tab shows Sara on Instagram", await page.isVisible("text=Sara") && await page.isVisible("text=Instagram"));

  // 2. thread + reply
  await page.click("[role=tab]:has-text('Needs you')");
  await page.click("text=Playground t4");
  await page.waitForSelector("text=I want to order 2 hoodies");
  ok("thread shows customer and assistant messages", await page.isVisible("text=The owner will reply to you personally."));
  await page.fill("textarea", "Hi! Yes we can arrange 2 hoodies.");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Hi! Yes we can arrange 2 hoodies.");
  await page.waitForSelector("text=Not sent yet");
  ok("owner reply appears with the 'not sent yet' note", true);
  ok("reply was POSTed as sender=owner, delivery pending", await logged((l) => l.startsWith("POST /rest/v1/messages") && l.includes('"sender":"owner"') && l.includes('"delivery_status":"pending"')));
  await page.screenshot({ path: OUT + "03-thread.png" });
  await page.click("button:has-text('Hand back to the assistant')");
  ok("hand-back sends status=bot and clears the reason", await logged((l) => l.startsWith("PATCH /rest/v1/conversations") && l.includes('"status":"bot"') && l.includes('"handoff_reason":null')));

  // 3. catalog
  await page.click("a:has-text('Catalog')");
  await page.waitForSelector("text=Black Hoodie");
  ok("catalog lists products with formatted DZD price", await page.isVisible("text=Black Hoodie") && /4[\s,. ]?500/.test(await page.textContent("body")));
  ok("stock badges: out / low / in stock", await page.isVisible("text=Out of stock") && await page.isVisible("text=Low: 3 left") && await page.isVisible("text=24 in stock"));
  ok("hidden product marked", await page.isVisible("text=Hidden"));
  await page.click("li:has-text('Black Hoodie') li:has-text('M') button[aria-label='Increase stock']");
  ok("stock + saves immediately", await logged((l) => l.startsWith("PATCH /rest/v1/product_variants") && l.includes('"stock_quantity":4')));
  await page.screenshot({ path: OUT + "04-catalog.png" });
  await page.fill("input[type=search]", "wallet");
  ok("search filters products", !(await page.isVisible("text=Black Hoodie")) && await page.isVisible("text=Leather Wallet"));
  await page.fill("input[type=search]", "");

  // 4. product editor validation + save
  await page.click("button:has-text('Add product')");
  await page.waitForSelector("[role=dialog]");
  await page.click("[role=dialog] button.btn-primary");
  ok("empty name is rejected with a message", await page.isVisible("text=Enter a product name."));
  await page.fill("#pname", "Linen Shirt");
  await page.fill("#pprice", "abc");
  await page.click("[role=dialog] button.btn-primary");
  ok("bad price is rejected", await page.isVisible("text=Enter a valid price."));
  await page.fill("#pprice", "3 800");
  await page.screenshot({ path: OUT + "05-editor.png" });
  await page.click("[role=dialog] button.btn-primary");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  ok("valid product is inserted (price 380000 cents) with its variant", await logged((l) => l.startsWith("POST /rest/v1/products") && l.includes('"price_cents":380000')) && state.log.some((l) => l.startsWith("POST /rest/v1/product_variants")));

  // 5. settings + channels
  await page.click("a:has-text('Settings')");
  await page.waitForSelector("text=Store settings");
  await page.fill("#sinfo", "Open daily. Delivery 3-5 days.");
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=Saved");
  ok("settings save sends only allowed columns", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes("business_info") && !l.includes('"id"')));
  await page.click("a:has-text('Channels')");
  await page.waitForSelector("text=Facebook Page");
  ok("channels page lists the connect options as coming soon", (await page.locator("button:has-text('Coming soon')").count()) === 2);
  await page.screenshot({ path: OUT + "06-channels.png" });

  // 6. Arabic / RTL
  await page.selectOption("aside select", "ar");
  ok("Arabic switches the document to RTL", (await page.evaluate(() => document.documentElement.dir)) === "rtl");
  await page.click("a:has-text('المحادثات')");
  await page.waitForSelector("text=محادثات الزبائن");
  await page.screenshot({ path: OUT + "07-inbox-ar.png" });
  await page.click("a:has-text('الكتالوج')");
  await page.waitForSelector("text=Black Hoodie");
  await page.screenshot({ path: OUT + "08-catalog-ar.png" });
  ok("no runtime errors across the desktop run", errors.length === 0);
  if (errors.length) console.log(errors.join("\n"));
  await ctx.close();

  // 7. mobile layout
  ({ page, ctx, errors } = await newPage({ viewport: { width: 390, height: 780 }, locale: "fr-FR", isMobile: true, hasTouch: true }));
  await page.goto("http://127.0.0.1:4173/login");
  await page.fill("#email", "owner@example.com"); await page.fill("#password", "password123");
  await page.click("button.btn-primary");
  await page.waitForURL(/\/inbox/);
  ok("French is picked from the browser locale", await page.isVisible("text=Discussions clients"));
  ok("mobile card shows a message preview, not the empty text", !(await page.isVisible("text=Aucun message")));
  ok("sign-out is a single compact button", (await page.locator("header button[aria-label='Se déconnecter']").count()) === 1);
  ok("mobile shows the bottom navigation", await page.isVisible("nav.fixed"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok("no horizontal scroll on a phone", !overflow);
  await page.screenshot({ path: OUT + "09-mobile-inbox-fr.png" });
  await page.click("nav a:has-text('Catalogue')");
  await page.waitForSelector("text=Black Hoodie");
  ok("no horizontal scroll on the catalog either", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await page.screenshot({ path: OUT + "10-mobile-catalog-fr.png" });
  ok("no runtime errors on mobile", errors.length === 0);
  await ctx.close();

  // 8. first-time user: no store -> onboarding -> create_store
  state.hasStore = false;
  ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
  await page.goto("http://127.0.0.1:4173/login");
  await page.fill("#email", "new@example.com"); await page.fill("#password", "password123");
  await page.click("button.btn-primary");
  await page.waitForURL(/\/onboarding/);
  ok("user without a store is sent to onboarding", await page.isVisible("text=Set up your store"));
  await page.fill("#name", "My Shop");
  await page.screenshot({ path: OUT + "11-onboarding.png" });
  await page.click("button.btn-primary");
  await page.waitForURL(/\/inbox/);
  ok("create_store RPC called with name and DZD", await logged((l) => l.includes("/rest/v1/rpc/create_store") && l.includes('"p_name":"My Shop"') && l.includes('"p_currency":"DZD"')));
  await ctx.close();
} catch (e) {
  console.log("TEST ERROR:", e.message.split("\n")[0]);
  results.push(["test run completed", false]);
}

await browser.close(); preview.kill(); mock.close();
const failed = results.filter(([, p]) => !p).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
