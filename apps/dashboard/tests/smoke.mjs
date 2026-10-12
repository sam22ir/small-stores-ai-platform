// Browser smoke test: drives the built app against tests/mock.mjs (a stand-in for Supabase).
//   npm run test:ui          (needs a Chromium: set CHROMIUM_PATH, or run `npx playwright-core install chromium`)
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { start, state, pushChange, pushConversationChange } from "./mock.mjs";
import { flipConversation } from "./mock.mjs";
import { insightsFixture } from "./mock.mjs";

// TEST_PORT lets several checkouts run the smoke test at once.
const PORT = Number(process.env.TEST_PORT || 4173);
const ROOT = new URL("../", import.meta.url).pathname;
const OUT = ROOT + ".test-shots/";
import fs from "node:fs"; fs.mkdirSync(OUT, { recursive: true });

const mock = await start();
const preview = spawn("npx", ["vite", "preview", "--outDir", ".test-dist", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });
// Wait for the preview server instead of guessing how long `npx vite preview` takes to start.
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

// Set CHROMIUM_PATH to use an existing Chrome/Chromium; otherwise Playwright's own browser is used.
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); console.log((cond ? "PASS " : "FAIL ") + name); };

async function logged(pred, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (state.log.some(pred)) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}

// Waits until the mock has received a matching RPC call (RPC arguments are recorded in state.rpcCalls).
async function rpcSeen(name, pred = () => true, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (state.rpcCalls.some((c) => c.name === name && pred(c.args))) return true; await new Promise((r) => setTimeout(r, 100)); }
  return false;
}
const saveCalls = () => state.rpcCalls.filter((c) => c.name === "save_product").length;
// One variant row (option label) inside one product card.
const variantRow = (page, product, label) => page.locator("li", { hasText: product }).locator("li", { has: page.getByText(label, { exact: true }) });
// Polls the option's shown stock until it reads n (the number animates, so a single read can catch both digits).
async function stockShows(page, product, label, n, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const txt = await variantRow(page, product, label).textContent();
    if (new RegExp("\u2212" + n + "(\u2713)?\\+").test(txt)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  // The rate-limit and not-configured tests deliberately trigger a 429 / 503 from a function.
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("status of 429") && !m.text().includes("status of 503") && !m.text().includes("status of 500")) errors.push("console: " + m.text()); });
  return { page, ctx, errors };
}

// Signs in with the demo owner's password and waits for the inbox.
async function signIn(page) {
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill("#email", "owner@example.com");
  await page.fill("#password", "password123");
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/inbox/);
  await page.waitForSelector("text=Customer chats");
}

try {
  // 1. login + inbox
  let { page, ctx, errors } = await newPage({ locale: "en-US" });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector("#hero-title");
  ok("anonymous visitor at / sees the landing page", (await page.locator("#hero-title").count()) === 1);
  ok("the root landing is Arabic and right-to-left", (await page.getAttribute("html", "dir")) === "rtl" && (await page.getAttribute("html", "lang")) === "ar");
  await page.goto(`http://127.0.0.1:${PORT}/fr`);
  await page.waitForSelector("#hero-title");
  ok("/fr is French and left-to-right", (await page.getAttribute("html", "lang")) === "fr" && (await page.getAttribute("html", "dir")) === "ltr");
  await page.goto(`http://127.0.0.1:${PORT}/nope`);
  await page.waitForSelector("text=Page not found");
  ok("unknown paths show the not-found page", await page.isVisible("a:has-text('Back to home')"));
  await page.goto(`http://127.0.0.1:${PORT}/inbox`);
  await page.waitForURL(/\/login/);
  ok("redirects anonymous user to /login", true);
  await page.screenshot({ path: OUT + "01-login.png" });
  await page.fill("#email", "owner@example.com");
  await page.click("button:has-text('Sign in with an email link instead')");
  // The mode switch animates the old form out first, so wait for the field to leave the page.
  await page.waitForSelector("#password", { state: "detached", timeout: 3000 }).catch(() => {});
  ok("link mode hides the password field", (await page.locator("#password").count()) === 0);
  await page.click("[data-testid=auth-submit]");
  await page.waitForSelector("text=we sent you a sign-in link");
  ok("email-link sign-in calls the OTP endpoint with the address", await logged((l) => l.startsWith("POST /auth/v1/otp") && l.includes("owner@example.com")));
  await page.screenshot({ path: OUT + "01b-login-link.png" });
  await page.click("button:has-text('Use a password instead')");
  await page.fill("#password", "password123");
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/inbox/);
  await page.waitForSelector("text=Customer chats");
  ok("sign-in lands on the inbox", true);
  ok("'Needs you' tab shows the handed-off chat", await page.waitForSelector("text=Amine", { timeout: 5000 }).then(() => true, () => false));
  ok("handoff reason is visible on the card", await page.isVisible("text=Customer wants to order 2 hoodies"));
  ok("inbox card previews the latest message", await page.isVisible("text=The owner will reply to you personally."));
  ok("tab counts rendered", await page.isVisible("text=Needs you (1)"));
  ok("test chats are hidden from the customer inbox", !(await page.isVisible("text=test handoff")));
  ok("outage banner counts messages the assistant couldn't answer", await page.isVisible("text=couldn't answer 2 message(s)"));
  ok("setup checklist shows progress for a new store", await page.isVisible("text=Get your assistant ready") && await page.isVisible("text=0 of 3 done") && await page.isVisible("text=2 added"));
  ok("the first unfinished step is marked Next", await page.isVisible("li:has-text('Add your products') >> text=Next"));
  ok("optional steps are listed, with a Connect link for Instagram", await page.isVisible("text=Take orders in chats (optional)") && await page.isVisible("li:has-text('Connect Instagram') >> a:has-text('Connect')"));
  await page.screenshot({ path: OUT + "02-inbox.png" });

  await page.click("[role=tab]:has-text('Assistant')");
  await page.waitForSelector("text=Sara", { timeout: 5000 }).catch(() => {});
  ok("assistant tab shows Sara on Instagram", await page.isVisible("text=Sara") && await page.isVisible("text=Instagram"));

  await page.click("a:has-text('Import a list')");
  await page.waitForSelector("[role=dialog]:has-text('Import stock list')");
  ok("'Import a list' opens the import dialog on the catalog", /\/catalog/.test(page.url()));
  await page.click("[role=dialog] button:has-text('Cancel')");
  ok("closing it clears the ?import flag", !/import=1/.test(page.url()));
  await page.click("a:has-text('Chats')");
  await page.waitForSelector("text=Customer chats");

  // 1b. "Needs you" badge (realtime) and the pause switch
  const toggle = page.locator("aside [data-testid=agent-toggle]");
  ok("Chats badge counts chats that need you, not test chats",
    await page.waitForSelector("aside [data-testid=needs-badge]:text-is('1')", { timeout: 5000 }).then(() => true, () => false));
  for (let i = 0; i < 50 && state.realtimeJoins === 0; i++) await new Promise((r) => setTimeout(r, 100));
  ok("dashboard subscribes to conversation changes", state.realtimeJoins > 0);
  state.conversations.find((c) => c.id === "c2").status = "human";
  pushConversationChange();
  ok("a realtime change updates the badge without a reload",
    await page.waitForSelector("aside [data-testid=needs-badge]:has-text('2')", { timeout: 5000 }).then(() => true, () => false));
  state.conversations.find((c) => c.id === "c2").status = "bot";
  pushConversationChange();
  await page.waitForSelector("aside [data-testid=needs-badge]:has-text('1')", { timeout: 5000 });

  ok("pause switch shows the assistant is on", (await toggle.textContent()).includes("Assistant on"));
  await toggle.click();
  ok("pause switch sets agent_enabled to false", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes('"agent_enabled":false')) && state.store.agent_enabled === false);
  ok("pause switch shows Paused", await page.waitForSelector("aside [data-testid=agent-toggle]:has-text('Paused')", { timeout: 3000 }).then(() => true, () => false));
  state.failStoreWrites = true;
  await toggle.click();
  ok("a failed write reverts the switch and says so",
    await page.waitForSelector("aside :text('Could not change it')", { timeout: 3000 }).then(() => true, () => false)
    && (await toggle.textContent()).includes("Paused"));
  state.failStoreWrites = false;
  await toggle.click();
  // The failed write above also logged agent_enabled:true, so wait for the mock to apply this one.
  for (let i = 0; i < 50 && state.store.agent_enabled !== true; i++) await new Promise((r) => setTimeout(r, 100));
  ok("pause switch turns the assistant back on", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes('"agent_enabled":true')) && state.store.agent_enabled === true);
  await page.waitForSelector("aside [data-testid=agent-toggle]:has-text('Assistant on')");

  // 2. thread + reply
  await page.click("[role=tab]:has-text('Needs you')");
  await page.click("text=Amine");
  await page.waitForSelector("text=I want to order 2 hoodies");
  ok("thread shows customer and assistant messages", await page.isVisible("text=The owner will reply to you personally."));
  await page.fill("textarea", "Hi! Yes we can arrange 2 hoodies.");
  // "button[type=submit]" picks the Send button, not the quick replies that also start with "Send".
  await page.click("button[type=submit]:has-text('Send')");
  await page.waitForSelector("text=Hi! Yes we can arrange 2 hoodies.");
  ok("reply was POSTed as sender=owner, delivery pending", await logged((l) => l.startsWith("POST /rest/v1/messages") && l.includes('"sender":"owner"') && l.includes('"delivery_status":"pending"')));
  ok("the dashboard then asks the server to deliver it", await logged((l) => l.startsWith("POST /functions/v1/deliver-messages") && l.includes('"conversation_id":"c1"')));
  await page.waitForTimeout(500);
  ok("once delivered the reply no longer says 'Not sent yet'", !(await page.isVisible("text=Not sent yet")) && !(await page.isVisible("text=Not delivered")));
  await page.click("button:has-text('Save as an answer the assistant can use')");
  await page.waitForSelector("[role=dialog]");
  ok("save-to-FAQ prefills the customer question and the owner's reply",
    (await page.inputValue("#faq-q")) === "I want to order 2 hoodies" && (await page.inputValue("#faq-a")) === "Hi! Yes we can arrange 2 hoodies.");
  await page.fill("#faq-a", "Yes, we can arrange 2 hoodies. Delivery is 3-5 days.");
  await page.screenshot({ path: OUT + "03b-save-faq.png" });
  await page.click("[role=dialog] button[type=submit]");
  await page.waitForSelector("text=Saved to your answers");
  ok("FAQ entry is stored with the question, the edited answer and the chat id", await logged((l) => l.startsWith("POST /rest/v1/faq_entries") && l.includes('"question":"I want to order 2 hoodies"') && l.includes("3-5 days") && l.includes('"conversation_id":"c1"')));
  await page.screenshot({ path: OUT + "03-thread.png" });
  await page.click("button:has-text('Hand back to the assistant')");
  ok("hand-back sends status=bot and clears the reason", await logged((l) => l.startsWith("PATCH /rest/v1/conversations") && l.includes('"status":"bot"') && l.includes('"handoff_reason":null')));

  // 2b. a reply Instagram refuses is flagged, with the reason
  state.deliverMode = "fail";
  await page.fill("textarea", "Second reply that cannot be delivered");
  await page.click("button[type=submit]:has-text('Send')");
  await page.waitForSelector("text=Not delivered");
  ok("an undelivered reply is flagged with Instagram's reason", await page.isVisible("text=Instagram only allows a reply within 24 hours"));
  state.deliverMode = "ok";

  // 3. catalog
  await page.click("a:has-text('Catalog')");
  await page.waitForSelector("text=Black Hoodie");
  ok("catalog lists products with formatted DZD price", await page.isVisible("text=Black Hoodie") && /4[\s,. ]?500/.test(await page.textContent("body")));
  ok("stock badges: out / low / in stock", await page.isVisible("text=Out of stock") && await page.isVisible("text=Low: 3 left") && await page.isVisible("text=24 in stock"));
  ok("hidden product marked", await page.isVisible("text=Hidden"));
  await page.click("li:has-text('Black Hoodie') li:has-text('M') button[aria-label='Increase stock']");
  ok("stock + calls adjust_stock and shows the stored quantity", await rpcSeen("adjust_stock", (a) => a.p_variant_id === "v2" && a.p_delta === 1) && await variantRow(page, "Black Hoodie", "M").getByText("4", { exact: true }).isVisible());
  await page.screenshot({ path: OUT + "04-catalog.png" });
  await page.fill("input[type=search]", "wallet");
  await page.waitForSelector("li:has-text('Black Hoodie')", { state: "detached" }); // the row animates out
  ok("search filters products", !(await page.isVisible("text=Black Hoodie")) && await page.isVisible("text=Leather Wallet"));
  await page.fill("input[type=search]", "");

  // 3b. stock accuracy
  ok("catalog nudges the owner to try the assistant", await page.isVisible("text=Your assistant can now answer questions about these products."));
  ok("stale banner counts active products with old numbers", await page.isVisible("text=1 product(s) have had no stock update for 14+ days"));
  ok("stale product is flagged", await page.isVisible("li:has-text('Canvas Tote') >> text=Check stock"));
  await page.click("button:has-text('Mark all as checked')");
  ok("'mark all as checked' stamps stock_checked_at on those products", await logged((l) => l.startsWith("PATCH /rest/v1/products") && l.includes("in.%28p3%29") && l.includes("stock_checked_at")));
  ok("banner disappears once checked", !(await page.isVisible("text=have had no stock update")));
  await page.click("li:has-text('Black Hoodie') >> button:has-text('Sold out today')");
  ok("'sold out today' sets sold_out_until without touching stock", await logged((l) => l.startsWith("PATCH /rest/v1/products") && /"sold_out_until":"20\d\d-/.test(l) && !l.includes("stock_quantity")));
  ok("product shows the sold-out badge", await page.isVisible("li:has-text('Black Hoodie') >> text=Sold out today"));
  await page.screenshot({ path: OUT + "04b-sold-out.png" });
  await page.click("li:has-text('Black Hoodie') >> button:has-text('Back in stock')");
  ok("'back in stock' clears sold_out_until", await logged((l) => l.startsWith("PATCH /rest/v1/products") && l.includes('"sold_out_until":null')));

  // 3c. bulk import
  await page.click("button:has-text('Import stock list')");
  await page.waitForSelector("[role=dialog]");
  await page.fill("[role=dialog] textarea", "name, price, stock, option\nBlack Hoodie, 4500, 5, M\nBlack Hoodie, 4500, 30, L\nSilk Scarf, 1500, 8, \n, 100, 1, x");
  ok("import preview counts products and options and flags unreadable lines", await page.isVisible("text=2 product(s), 3 option(s) found") && await page.isVisible("text=1 line(s) can't be read"));
  await page.screenshot({ path: OUT + "04c-import.png" });
  await page.click("[role=dialog] button:has-text('Import')");
  await page.waitForSelector("text=Done: 1 added, 1 updated.");
  // The existing product goes through one save_product call that still lists its untouched option (S).
  ok("import updates existing stock by option and keeps the other options", await rpcSeen("save_product", (a) => a.p_product_id === "p1"
    && a.p_variants.some((v) => v.id === "v2" && v.stock_quantity === 5) && a.p_variants.some((v) => v.id === "v3" && v.stock_quantity === 30)
    && a.p_variants.some((v) => v.id === "v1" && v.label === "S") && a.p_variants.length === 3));
  ok("import creates new products with their price in cents", await rpcSeen("save_product", (a) => a.p_product_id === null && a.p_product.name === "Silk Scarf" && a.p_product.price_cents === 150000));
  await page.click("[role=dialog] button:has-text('Cancel')");

  // 4. product editor validation + save
  await page.click("button:has-text('Add product')");
  await page.waitForSelector("[role=dialog]");
  await page.click("[role=dialog] button[type=submit]");
  ok("empty name is rejected with a message", await page.isVisible("text=Enter a product name."));
  await page.fill("#pname", "Linen Shirt");
  await page.fill("#pprice", "abc");
  await page.click("[role=dialog] button[type=submit]");
  ok("bad price is rejected", await page.isVisible("text=Enter a valid price."));
  await page.fill("#palias", "linen, kittan");
  await page.fill("#pprice", "3 800");
  await page.screenshot({ path: OUT + "05-editor.png" });
  const createdBefore = saveCalls();
  await page.click("[role=dialog] button[type=submit]");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  ok("valid product is created with one save_product call (price 380000 cents, its variant)", saveCalls() - createdBefore === 1 && await rpcSeen("save_product", (a) => a.p_product_id === null && a.p_product.price_cents === 380000 && a.p_product.aliases === "linen, kittan" && a.p_variants.length === 1));

  // 4b. editing: one atomic save; a forced failure keeps the editor open and changes nothing
  const hoodie = () => page.locator("li", { hasText: "Black Hoodie" }).first();
  const editedBefore = saveCalls();
  await hoodie().getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector("[role=dialog]");
  await page.fill("#pprice", "4 900");
  await page.click("[role=dialog] button[type=submit]");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  await page.locator("li", { hasText: "Black Hoodie" }).filter({ hasText: /4[\s,. ]?900/ }).first().waitFor({ timeout: 5000 }).catch(() => {});
  ok("editing a product sends one save_product call and the list shows the new price", saveCalls() - editedBefore === 1 && await rpcSeen("save_product", (a) => a.p_product_id === "p1" && a.p_product.price_cents === 490000 && a.p_variants.length === 3) && /4[\s,. ]?900/.test(await hoodie().textContent()));

  const snapshot = JSON.stringify(state.products);
  state.failSaveProduct = true;
  await hoodie().getByRole("button", { name: "Edit" }).click();
  await page.waitForSelector("[role=dialog]");
  await page.fill("#pname", "Broken Hoodie");
  await page.click("[role=dialog] button[type=submit]");
  await page.waitForSelector("[role=dialog] >> text=Something went wrong. Please try again.");
  ok("a failed save keeps the editor open with the generic error", await page.isVisible("[role=dialog]") && await page.isVisible("[role=dialog] >> text=Something went wrong. Please try again."));
  ok("a failed save writes nothing and the list is unchanged", JSON.stringify(state.products) === snapshot && await hoodie().count() === 1 && !(await page.textContent("body")).includes("Broken Hoodie"));
  state.failSaveProduct = false;
  await page.click("[role=dialog] button:has-text('Cancel')");
  await page.waitForSelector("[role=dialog]", { state: "detached" });

  // 4c. stock +/- go through adjust_stock and show the number it returns (L: 30)
  await variantRow(page, "Black Hoodie", "L").getByRole("button", { name: "Increase stock" }).click();
  ok("stock + calls adjust_stock with +1 and shows the stored quantity", await rpcSeen("adjust_stock", (a) => a.p_variant_id === "v3" && a.p_delta === 1) && await stockShows(page, "Black Hoodie", "L", 31));
  await variantRow(page, "Black Hoodie", "L").getByRole("button", { name: "Decrease stock" }).click();
  ok("stock - calls adjust_stock with -1 and shows the stored quantity", await rpcSeen("adjust_stock", (a) => a.p_variant_id === "v3" && a.p_delta === -1) && await stockShows(page, "Black Hoodie", "L", 30));

  // 4d. a failed import leaves the earlier groups saved; retrying must not create them twice
  {
    await page.click("button:has-text('Import stock list')");
    await page.waitForSelector("[role=dialog]");
    await page.fill("[role=dialog] textarea", "name, price, stock, option\nCotton Cap, 1000, 4, \nWool Hat, 2000, 3, ");
    state.failSaveProductOnCall = 2; // the second group fails
    await page.click("[role=dialog] button:has-text('Import')");
    await page.waitForSelector("[role=dialog] >> text=Something went wrong. Please try again.");
    ok("a failed import shows the error", await page.isVisible("[role=dialog] >> text=Something went wrong. Please try again."));
    ok("the first group was saved before the failure", state.products.filter((x) => x.name === "Cotton Cap").length === 1 && !state.products.some((x) => x.name === "Wool Hat"));
    await page.click("[role=dialog] button:has-text('Import')");
    await page.waitForSelector("text=Done:");
    ok("retrying the import does not duplicate the product saved the first time",
      state.products.filter((x) => x.name === "Cotton Cap").length === 1 && state.products.filter((x) => x.name === "Wool Hat").length === 1);
    await page.click("[role=dialog] button:has-text('Cancel')");
    state.failSaveProductOnCall = 0;
    state.products = state.products.filter((x) => x.name !== "Cotton Cap" && x.name !== "Wool Hat");
  }

  // 5. settings + channels
  await page.click("a:has-text('Settings')");
  await page.waitForSelector("text=Store settings");
  ok("settings shows the structured store-info fields", await page.isVisible("label:has-text('Opening hours')") && await page.isVisible("label:has-text('Returns and exchanges')"));
  await page.fill("#info-hours", "Every day 10:00-18:00");
  await page.fill("#info-delivery", "3-5 days");
  await page.fill("#info-other", "Gift wrapping available.");
  await page.click("text=Take orders in chats");
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=Saved");
  ok("settings save sends only allowed columns", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes("business_info") && !l.includes('"id"')));
  ok("the fields are composed into the text the assistant reads, and kept as JSON", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes("Opening hours: Every day 10:00-18:00") && l.includes("Delivery: 3-5 days") && l.includes("Gift wrapping available.") && l.includes('"business_info_fields"')));
  ok("orders toggle is saved", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes('"orders_enabled":true')));
  // 5b. pause switch flipped in the header while Settings is open must survive a Settings save
  const mark = state.log.length;
  await toggle.click();
  await page.waitForSelector("aside [data-testid=agent-toggle]:has-text('Paused')", { timeout: 3000 });
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=Saved");
  ok("settings save does not overwrite a header toggle", state.store.agent_enabled === false && state.log.slice(mark).some((l) => l.startsWith("PATCH /rest/v1/stores") && !l.includes('"agent_enabled"')));
  await toggle.click();
  await page.waitForSelector("aside [data-testid=agent-toggle]:has-text('Assistant on')", { timeout: 3000 });

  // 5a. FAQ the assistant knows
  await page.waitForSelector("text=Answers the assistant knows");
  ok("existing and just-saved answers are listed", await page.isVisible("li:has-text('Do you gift wrap?')") && await page.isVisible("li:has-text('3-5 days')"));
  await page.click("button:has-text('Add an answer')");
  await page.click("[role=dialog] button[type=submit]");
  ok("empty question is rejected", await page.isVisible("text=Write the question."));
  await page.fill("#faq-q", "Can I pay by card?");
  await page.fill("#faq-a", "Cash on delivery only.");
  await page.click("[role=dialog] button[type=submit]");
  await page.waitForSelector("li:has-text('Can I pay by card?')");
  ok("manually added answer is stored", await logged((l) => l.startsWith("POST /rest/v1/faq_entries") && l.includes("Cash on delivery only.") && l.includes('"conversation_id":null')));
  page.once("dialog", (d) => void d.accept());
  await page.click("li:has-text('Do you gift wrap?') >> button:has-text('Delete')");
  ok("deleting an answer asks first and then calls DELETE", await logged((l) => l.startsWith("DELETE /rest/v1/faq_entries")));

  // 5b. delivery fees
  await page.waitForSelector("text=Delivery fees");
  ok("existing delivery fee is listed", await page.isVisible("li:has-text('Alger')"));
  await page.fill("#fw", "Oran");
  await page.click("form:has(#fw) button[type=submit]");
  ok("adding a fee without an amount is rejected", await page.isVisible("text=Enter a valid fee."));
  await page.fill("#ff", "600");
  await page.click("form:has(#fw) button[type=submit]");
  ok("fee is inserted in cents", await logged((l) => l.startsWith("POST /rest/v1/delivery_fees") && l.includes('"wilaya":"Oran"') && l.includes('"fee_cents":60000')));
  await page.click("button:has-text('Add all 58 wilayas')");
  ok("bulk add skips wilayas that already exist", await logged((l) => l.startsWith("POST /rest/v1/delivery_fees") && l.includes('"wilaya":"Adrar"') && !l.includes('"wilaya":"Oran"')));
  await page.screenshot({ path: OUT + "06-settings-fees.png", fullPage: true });

  // 5c. orders
  await page.click("a:has-text('Orders')");
  await page.waitForSelector("text=Karim B");
  ok("new orders tab shows the order with phone, address and total", await page.isVisible("text=0555123456") && await page.isVisible("text=12 rue des Frères, Es Senia") && /9[\s,. ]?600/.test(await page.textContent("body")));
  ok("order tab counts", await page.isVisible("text=New (1)") && await page.isVisible("text=Shipped (1)"));
  await page.screenshot({ path: OUT + "06b-orders.png" });
  await page.click("button:has-text('Confirm order')");
  ok("confirm calls set_order_status", await logged((l) => l.includes("/rest/v1/rpc/set_order_status") && l.includes('"p_status":"confirmed"')));
  await page.click("[role=tab]:has-text('Confirmed')");
  await page.waitForSelector("text=Karim B");
  page.once("dialog", (d) => void d.accept());
  await page.click("button:has-text('Cancel order')");
  ok("cancel asks first, then calls set_order_status", await logged((l) => l.includes("/rest/v1/rpc/set_order_status") && l.includes('"p_status":"cancelled"')));

  // 5d. assistant: usage, test chat, channels
  await page.click("a:has-text('Assistant')");
  await page.waitForSelector("text=Try your assistant");
  ok("usage meter shows replies used of the limit", await page.isVisible("text=7 of 1000"));
  ok("usage meter shows conversations and replies per conversation", await page.isVisible("text=7 replies · 3 conversations") && await page.isVisible("text=(≈2.3 replies each)"));
  ok("Facebook is still marked coming soon; Instagram can be connected", (await page.locator("button:has-text('Coming soon')").count()) === 1 && await page.isEnabled("button:has-text('Connect Instagram')"));
  ok("channels start empty", await page.isVisible("text=No account connected yet."));
  await page.click("button:has-text('Connect Instagram')");
  await page.waitForSelector("text=Instagram is connected.");
  ok("Connect asks the server for Instagram's approval page for this store", await logged((l) => l.startsWith("POST /functions/v1/instagram-connect") && l.includes('"action":"start"') && l.includes('"store_id":"s1"')));
  await page.waitForSelector("li:has-text('@fennec_vision_') >> text=Connected", { timeout: 5000 }).catch(() => {});
  ok("coming back from Instagram finishes the connection with the owner's session", await logged((l) => l.startsWith("POST /functions/v1/instagram-connect") && l.includes('"action":"finish"') && l.includes('"code":"ig-code"') && l.includes('"state":"signed-state"')));
  ok("coming back from Instagram shows the connected account and clears the URL", await page.isVisible("li:has-text('@fennec_vision_') >> text=Connected") && !/instagram=/.test(page.url()));
  page.once("dialog", (d) => d.accept());
  await page.click("li:has-text('@fennec_vision_') >> button:has-text('Disconnect')");
  await page.waitForSelector("li:has-text('@fennec_vision_') >> text=Disconnected");
  ok("Disconnect asks first, then calls the server with the channel id", await logged((l) => l.startsWith("POST /functions/v1/instagram-connect") && l.includes('"action":"disconnect"') && l.includes('"channel_id":"ch-ig"')));
  await page.goto(`http://127.0.0.1:${PORT}/assistant?instagram=error&reason=already_connected`);
  await page.waitForSelector("[role=alert]:has-text('already connected to another store')");
  ok("a failed connection explains why", !/instagram=/.test(page.url()));
  state.startStatus = 503;
  await page.click("button:has-text('Connect Instagram')");
  await page.waitForSelector("[role=alert]:has-text('set up on this server yet')");
  ok("a server without Instagram configured says so", true);
  state.startStatus = 200;
  await page.fill("input[aria-label='Write as a customer…']", "do you have the hoodie in M?");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Black Hoodie in M is available");
  ok("test chat sends store id and session to assistant-chat", await logged((l) => l.startsWith("POST /functions/v1/assistant-chat") && l.includes('"store_id":"s1"') && l.includes('"session_id"')));
  await page.fill("input[aria-label='Write as a customer…']", "hello");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Instant reply, no credit used.");
  ok("fast-path replies are labelled free", await page.isVisible("text=Hi, welcome to Demo Boutique!"));
  await page.fill("input[aria-label='Write as a customer…']", "I want to order the hoodie");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Test mode: no real order was created.");
  ok("test orders are labelled as not real", await page.isVisible("text=Your order is received."));
  await page.fill("input[aria-label='Write as a customer…']", "spam");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Too many test messages. Try again in a while.");
  ok("rate limit (429) shows a friendly message", await page.isVisible("[role=alert]:has-text('Too many test messages')"));
  await page.fill("input[aria-label='Write as a customer…']", "let me talk to a human");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Start a new test chat to continue.");
  ok("handoff disables the input until a new test chat", await page.isDisabled("input[aria-label='Write as a customer…']"));
  await page.screenshot({ path: OUT + "06c-assistant.png", fullPage: true });
  await page.click("button:has-text('New test chat')");
  // Messages leave with an exit animation, so wait for them to detach instead of checking once.
  await page.waitForSelector("text=Black Hoodie in M is available", { state: "detached" });
  ok("new test chat clears the conversation", !(await page.isDisabled("input[aria-label='Write as a customer…']")) && !(await page.isVisible("text=Black Hoodie in M is available")));
  // The products this run created through save_product / import would finish the products step. Drop them
  // so the checklist still starts with only the two seeded products (the step this section is about).
  state.products = state.products.filter((p) => !p.id.startsWith("p-new-"));
  await page.click("a:has-text('Chats')");
  await page.waitForSelector("text=Customer chats");
  await page.waitForSelector("text=2 of 3 done");
  ok("checklist progress follows what the owner did (info + tried the assistant)", await page.isVisible("text=2 of 3 done"));
  state.products.push({ id: "p4", name: "Silk Scarf", description: null, price_cents: 150000, active: true, aliases: null, stock_checked_at: new Date().toISOString(), sold_out_until: null, product_variants: [] });
  await page.reload();
  await page.waitForSelector("text=Your assistant is ready.");
  ok("with 3 products, info and a test chat the checklist shows 'ready'", await page.isVisible("text=Your assistant is ready."));
  await page.click("button:has-text('Hide')");
  ok("hiding the checklist removes it", !(await page.isVisible("text=Your assistant is ready.")));
  await page.reload();
  await page.waitForSelector("text=Customer chats");
  ok("and it stays hidden after a reload", !(await page.isVisible("text=Your assistant is ready.")) && !(await page.isVisible("text=Get your assistant ready")));

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

  // 6b. public legal pages need no sign-in
  ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
  for (const [path, heading, text] of [
    ["/privacy", "Privacy policy", "Instagram"],
    ["/terms", "Terms of service", "cash-on-delivery"],
    ["/data-deletion", "Data deletion", "Delete my data"],
  ]) {
    await page.goto(`http://127.0.0.1:${PORT}` + path);
    await page.waitForSelector(`h1:has-text('${heading}')`);
    ok(`${path} is public and readable`, !/\/login/.test(page.url()) && (await page.textContent("main")).includes(text));
  }
  ok("legal pages link to each other", await page.isVisible("nav[aria-label=Legal] >> text=Privacy policy"));
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.waitForSelector("nav[aria-label=Legal]");
  ok("the sign-in page links to them", await page.isVisible("nav[aria-label=Legal] >> text=Data deletion"));
  ok("no runtime errors on public pages", errors.length === 0);
  await ctx.close();

  // 7. mobile layout
  ({ page, ctx, errors } = await newPage({ viewport: { width: 390, height: 780 }, locale: "fr-FR", isMobile: true, hasTouch: true }));
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill("#email", "owner@example.com"); await page.fill("#password", "password123");
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/inbox/);
  await page.waitForSelector("text=Discussions clients");
  ok("French is picked from the browser locale", await page.isVisible("text=Discussions clients"));
  await page.waitForSelector("text=Amine");
  ok("mobile card shows a message preview, not the empty text", !(await page.isVisible("text=Aucun message")));
  ok("sign-out is a single compact button", (await page.locator("header button[aria-label='Se déconnecter']").count()) === 1);
  ok("pause switch is in the phone header", await page.isVisible("header [data-testid=agent-toggle]:has-text('Assistant actif')"));
  ok("Chats tab in the bottom bar shows the badge", await page.waitForSelector("nav [data-testid=needs-badge]:has-text('1')", { timeout: 3000 }).then(() => true, () => false));
  await page.click("header [data-testid=agent-toggle]");
  ok("pausing from the phone header works", await page.waitForSelector("header [data-testid=agent-toggle]:has-text('En pause')", { timeout: 3000 }).then(() => true, () => false));
  await page.click("header [data-testid=agent-toggle]");
  await page.waitForSelector("header [data-testid=agent-toggle]:has-text('Assistant actif')", { timeout: 3000 });
  ok("mobile shows the bottom navigation", await page.isVisible("nav.fixed"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok("no horizontal scroll on a phone", !overflow);
  await page.screenshot({ path: OUT + "09-mobile-inbox-fr.png" });
  await page.click("nav a:has-text('Catalogue')");
  await page.waitForSelector("text=Black Hoodie");
  ok("no horizontal scroll on the catalog either", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await page.screenshot({ path: OUT + "10-mobile-catalog-fr.png" });
  for (const [label, wait] of [["Commandes", "h1:has-text('Commandes')"], ["Assistant", "text=Essayez votre assistant"]]) {
    await page.click(`nav a:has-text('${label}')`);
    await page.waitForSelector(wait);
    ok(`no horizontal scroll on ${label}`, !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  }
  await page.screenshot({ path: OUT + "10b-mobile-assistant-fr.png" });
  ok("no runtime errors on mobile", errors.length === 0);
  await ctx.close();

  // 8. first-time user: no store -> onboarding -> create_store
  state.hasStore = false;
  ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.fill("#email", "new@example.com"); await page.fill("#password", "password123");
  await page.click("[data-testid=auth-submit]");
  await page.waitForURL(/\/onboarding/);
  await page.waitForSelector("text=Set up your store");
  ok("user without a store is sent to onboarding", await page.isVisible("text=Set up your store"));
  await page.fill("#name", "My Shop");
  await page.screenshot({ path: OUT + "11-onboarding.png" });
  await page.click("button[type=submit]");
  await page.waitForURL(/\/inbox/);
  ok("create_store RPC called with name and DZD", await logged((l) => l.includes("/rest/v1/rpc/create_store") && l.includes('"p_name":"My Shop"') && l.includes('"p_currency":"DZD"')));
  await ctx.close();

  // 9. forgot password: the link action shows the neutral confirmation and calls recover
  state.hasStore = true;
  ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
  await page.goto(`http://127.0.0.1:${PORT}/login`);
  await page.click("button:has-text('Forgot password?')");
  await page.fill("#email", "owner@example.com");
  await page.click("[data-testid=auth-submit]");
  ok("forgot password shows the neutral confirmation", await page.waitForSelector("text=If an account exists for this email", { timeout: 3000 }).then(() => true, () => false));
  ok("forgot password calls /auth/v1/recover", await logged((l) => l.startsWith("POST /auth/v1/recover")));
  await ctx.close();

  // 10. recovery link: /reset-password with a recovery session sets the password via PUT /auth/v1/user
  {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "user-1", role: "authenticated", exp: 4102444800, aud: "authenticated" })}.sig`;
    ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
    await page.goto(`http://127.0.0.1:${PORT}/reset-password#access_token=${token}&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery`);
    await page.waitForSelector("#new-password", { timeout: 5000 });
    await page.fill("#new-password", "newpassword1");
    await page.fill("#confirm-password", "newpassword1");
    await page.click("button[type=submit]");
    ok("reset-password sets the password and confirms", await page.waitForSelector("text=Your password is saved", { timeout: 3000 }).then(() => true, () => false));
    ok("reset-password sends PUT /auth/v1/user with the new password", await logged((l) => l.startsWith("PUT /auth/v1/user") && l.includes("newpassword1")));
    await ctx.close();
  }
  // 11. sign-up page: renders, validates, links to login, and posts to Supabase auth
  {
    ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
    await page.goto(`http://127.0.0.1:${PORT}/signup`);
    await page.waitForSelector("#confirm-password", { timeout: 5000 });
    ok("sign-up page renders for anonymous visitors", await page.isVisible("[data-testid=auth-submit]:has-text('Create account')"));
    await page.fill("#email", "new-owner@example.com");
    await page.fill("#password", "password123");
    await page.fill("#confirm-password", "password124");
    await page.click("[data-testid=auth-submit]");
    ok("mismatched passwords show an inline message", await page.waitForSelector("#confirm-error:has-text(\"don't match\")", { timeout: 3000 }).then(() => true, () => false));
    ok("mismatched passwords do not call Supabase", !(await logged((l) => l.startsWith("POST /auth/v1/signup"), 300)));
    await page.fill("#confirm-password", "password123");
    await page.click("[data-testid=auth-submit]");
    ok("valid sign-up without a session asks the owner to check their email", await page.waitForSelector("text=Check your email", { timeout: 3000 }).then(() => true, () => false));
    ok("sign-up posts the address to /auth/v1/signup", await logged((l) => l.startsWith("POST /auth/v1/signup") && l.includes("new-owner@example.com")));
    await page.screenshot({ path: OUT + "11-signup.png" });
    await page.goto(`http://127.0.0.1:${PORT}/signup`);
    await page.waitForSelector("#confirm-password", { timeout: 5000 });
    await page.click("a:has-text('Already have an account')");
    await page.waitForURL(/\/login/);
    ok("'Already have an account' links to login", /\/login/.test(page.url()));
    await page.goto(`http://127.0.0.1:${PORT}/login`);
    await page.waitForSelector("#email", { timeout: 5000 });
    await page.click("a:has-text('New here')");
    await page.waitForURL(/\/signup/);
    ok("login links to sign-up", /\/signup/.test(page.url()));
    ok("sign-up page has no store-name field (onboarding asks for it)", (await page.locator("#name").count()) === 0);
    await ctx.close();
  }
  // 12. signed-in visitor: the landing offers "Go to inbox", which opens the inbox
  {
    ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
    await page.goto(`http://127.0.0.1:${PORT}/login`);
    await page.fill("#email", "owner@example.com"); await page.fill("#password", "password123");
    await page.click("[data-testid=auth-submit]");
    await page.waitForURL(/\/inbox/);
    await page.goto(`http://127.0.0.1:${PORT}/en`);
    const goInbox = page.locator("a:has-text('Go to inbox')").first();
    await goInbox.waitFor({ timeout: 8000 }).catch(() => {});
    ok("signed-in visitor on the landing sees 'Go to inbox'", (await goInbox.count()) > 0);
    await goInbox.click();
    ok("'Go to inbox' navigates to /inbox", await page.waitForURL(/\/inbox/, { timeout: 5000 }).then(() => true, () => false));
    await ctx.close();
  }
  // 13. inbox search (server-side, all statuses while searching), paging, long threads, realtime messages
  {
    ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
    await signIn(page);
    const search = "input[type=search]";
    const gone = (sel) => page.waitForSelector(sel, { state: "detached", timeout: 3000 }).then(() => true, () => false);
    const seen = (sel) => page.waitForSelector(sel, { timeout: 3000 }).then(() => true, () => false);
    await page.fill(search, "Sara");
    ok("inbox search by name finds a chat in any status", await seen("a:has-text('Sara')"));
    ok("a search hides the other chats", await gone("a:has-text('Amine')"));
    await page.fill(search, "hoodies");
    ok("inbox search matches message text", await seen("a:has-text('Amine')") && await gone("a:has-text('Sara')"));
    await page.fill(search, "هودي");
    ok("inbox search matches an Arabic term in a message", await seen("a:has-text('Sara')") && await gone("a:has-text('Amine')"));
    await page.fill(search, "zzz-no-such-chat");
    ok("a search with no match says so", await seen("text=No chats match this search."));
    await page.fill(search, "");
    ok("clearing the search brings the 'Needs you' box back", await seen("text=Needs you") && await seen("a:has-text('Amine')"));

    // Load more: 62 closed chats, 50 per page
    state.bulk = true;
    await page.reload();
    await page.waitForSelector("text=Customer chats");
    await page.click("[role=tab]:has-text('Closed')");
    await page.waitForSelector("[role=tab]:has-text('Closed (62)')");
    const rowLinks = () => page.locator("a[href^='/inbox/']").count();
    // The tab count comes from a head query; the rows come from inbox_list a moment later.
    await page.waitForFunction(() => document.querySelectorAll("a[href^='/inbox/']").length >= 51, null, { timeout: 5000 }).catch(() => {});
    ok("the first page of chats is 50 rows (plus one 'Needs you' row)", (await rowLinks()) === 51);
    await page.click("button:has-text('Load more')");
    await page.waitForFunction(() => document.querySelectorAll("a[href^='/inbox/']").length === 63, null, { timeout: 5000 }).catch(() => {});
    ok("'Load more' appends the rest of the chats", (await rowLinks()) === 63);
    state.bulk = false;
    await page.screenshot({ path: OUT + "12-inbox-search.png" });

    // A 250-message chat: the newest 100 show first, and "Load earlier" fetches the rest in pages
    await page.goto(`http://127.0.0.1:${PORT}/inbox/c5`);
    await page.waitForSelector("text=Long thread message 250");
    ok("a 250-message chat opens at the newest message", await page.isVisible("text=Long thread message 250"));
    ok("older messages are not loaded until asked for", !(await page.getByText("Long thread message 150", { exact: true }).isVisible()));
    await page.click("button:has-text('Load earlier messages')");
    await page.waitForSelector("text=Long thread message 150", { state: "attached", timeout: 5000 });
    ok("'Load earlier' brings in the messages before the newest page", await page.getByText("Long thread message 150", { exact: true }).isVisible());
    ok("the newest message is still the last one", await page.isVisible("text=Long thread message 250"));
    await page.screenshot({ path: OUT + "12b-long-thread.png" });

    // A new customer message arrives over realtime, with no reload and no poll
    const joinsBefore = state.realtimeJoins;
    await page.goto(`http://127.0.0.1:${PORT}/inbox/c1`);
    await page.waitForSelector("text=The owner will reply to you personally.");
    // Wait for this page's subscriptions (Layout, Inbox, and the thread's messages and header) before pushing.
    for (let i = 0; i < 100 && state.realtimeJoins < joinsBefore + 4; i++) await new Promise((r) => setTimeout(r, 100));
    state.messages.push({ id: "rt1", conversation_id: "c1", direction: "inbound", sender: "customer", body: "Realtime hello from the customer", created_at: new Date().toISOString(), delivery_status: null, delivery_error: null });
    pushChange("messages");
    ok("a realtime message update shows in the open chat within 5 s", await seen("text=Realtime hello from the customer"));
    ok("the new customer message is announced to screen readers", await seen("[role=status]:has-text('New message from the customer: Realtime hello')"));

    // A reply that is not delivered yet is retried by the 8 s timer, not left for the 60 s poll
    state.deliverMode = "skip";
    await page.fill("textarea", "Reply that waits to go out");
    await page.click("button[type=submit]:has-text('Send')");
    await page.waitForSelector("text=Not sent yet");
    state.deliverMode = "ok";
    const started = Date.now();
    ok("a pending reply goes out on the retry without waiting for the 60 s poll",
      await page.waitForSelector("text=Not sent yet", { state: "detached", timeout: 12000 }).then(() => true, () => false) && Date.now() - started < 12000);
    ok("no runtime errors in the inbox search, paging, long thread and realtime checks", errors.length === 0);
    if (errors.length) console.log(errors.join("\n"));
    await ctx.close();
  }
  // 14. orders search
  {
    ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
    await signIn(page);
    await page.goto(`http://127.0.0.1:${PORT}/orders`);
    await page.waitForSelector("[role=tab]:has-text('Shipped')");
    await page.click("[role=tab]:has-text('Shipped')");
    await page.fill("input[type=search]", "Lina");
    ok("orders search finds a shipped order by name", await page.waitForSelector("text=Lina S", { timeout: 3000 }).then(() => true, () => false));
    await page.fill("input[type=search]", "0661");
    ok("orders search also matches the phone number", await page.waitForSelector("text=Lina S", { timeout: 3000 }).then(() => true, () => false));
    await page.fill("input[type=search]", "nobody-here");
    ok("an orders search with no match says so", await page.waitForSelector("text=No orders match this search.", { timeout: 3000 }).then(() => true, () => false));
    ok("no runtime errors in the orders search checks", errors.length === 0);
    await ctx.close();
  }
  // 15. insights: nav entry, range toggle, stat cards, empty state, Arabic, phone bottom bar
  {
    const card = async (pg, k) => ((await pg.textContent(`[data-testid=insights-stat-${k}] .text-2xl`)) || "").trim();
    // Compares the stat cards with what the RPC fixture returns for the same window.
    const cardsMatch = async (pg, want) => {
      const t = want.totals;
      const rate = t.conversations ? `${Math.round((100 * t.handoffs) / t.conversations)}%` : "0%";
      return (await card(pg, "conversations")) === String(t.conversations)
        && (await card(pg, "replies")) === String(t.replies)
        && (await card(pg, "handoff")) === rate
        && (await card(pg, "orders")) === String(t.orders)
        && (await card(pg, "revenue")).replace(/\D/g, "") === String(t.revenue_cents / 100)
        && (await card(pg, "credits")) === String(want.reply_credits);
    };
    const want7 = insightsFixture(7);
    const want30 = insightsFixture(30);

    ({ page, ctx, errors } = await newPage({ locale: "en-US" }));
    await page.goto(`http://127.0.0.1:${PORT}/login`);
    await page.fill("#email", "owner@example.com"); await page.fill("#password", "password123");
    await page.click("[data-testid=auth-submit]");
    await page.waitForURL(/\/inbox/);
    await page.click("a:has-text('Insights')");
    await page.waitForURL(/\/insights/);
    await page.waitForSelector("[data-testid=insights-stat-orders] .text-2xl");
    ok("insights page is reachable from the nav", await page.isVisible("h1:has-text('Insights')"));
    ok("stat cards show the 7-day totals from store_insights", await cardsMatch(page, want7));
    ok("first load asks for 7 days", await logged((l) => l.includes("/rest/v1/rpc/store_insights") && l.includes('"p_days":7')));
    ok("the bar charts have accessible labels and a data table", await page.isVisible("svg[role=img][aria-label^='Conversations per day']") && await page.locator("table.sr-only tbody tr").count() === 14);
    await page.click("[role=tab]:has-text('30 days')");
    ok("30-day toggle asks for 30 days", await logged((l) => l.includes("/rest/v1/rpc/store_insights") && l.includes('"p_days":30')));
    await page.waitForFunction((n) => document.querySelector("[data-testid=insights-stat-orders] .text-2xl")?.textContent?.trim() === n, String(want30.totals.orders), { timeout: 3000 }).catch(() => {});
    ok("the 30-day window holds more orders than the 7-day one", want30.totals.orders > want7.totals.orders);
    ok("stat cards show the 30-day totals after the toggle", await cardsMatch(page, want30));
    await page.screenshot({ path: OUT + "11-insights-30d.png" });

    // An empty window shows the empty state instead of charts.
    state.insightsEmpty = true;
    await page.reload();
    await page.waitForSelector("[data-testid=insights-empty]", { timeout: 5000 }).catch(() => {});
    ok("an all-zero window shows the empty state and no charts", await page.isVisible("[data-testid=insights-empty]") && (await card(page, "conversations")) === "0" && (await page.locator("svg[role=img]").count()) === 0);
    state.insightsEmpty = false;
    ok("no runtime errors on the insights page", errors.length === 0);
    if (errors.length) console.log(errors.join("\n"));

    // Arabic: right-to-left page, Latin digits in the cards.
    await page.selectOption("aside select", "ar");
    await page.click("a:has-text('الإحصاءات')");
    await page.waitForSelector("h1:has-text('الإحصاءات')");
    await page.waitForSelector("[data-testid=insights-stat-orders] .text-2xl");
    ok("Arabic insights page is right-to-left", (await page.evaluate(() => document.documentElement.dir)) === "rtl");
    ok("Arabic insights keep Latin digits in the cards", (await card(page, "conversations")) === String(want7.totals.conversations));
    await page.screenshot({ path: OUT + "11-insights-ar.png" });
    ok("no runtime errors on the Arabic insights page", errors.length === 0);
    if (errors.length) console.log(errors.join("\n"));
    await ctx.close();

    // Phone: six bottom tabs on one row, labels not clipped, no horizontal scroll.
    ({ page, ctx, errors } = await newPage({ viewport: { width: 375, height: 760 }, locale: "fr-FR", isMobile: true, hasTouch: true }));
    await page.goto(`http://127.0.0.1:${PORT}/login`);
    await page.fill("#email", "owner@example.com"); await page.fill("#password", "password123");
    await page.click("[data-testid=auth-submit]");
    await page.waitForURL(/\/inbox/);
    await page.waitForSelector("nav.fixed a:has-text('Stats')");
    const bar = await page.evaluate(() => {
      const links = [...document.querySelectorAll("nav.fixed a")];
      const labels = links.map((a) => a.querySelector("span.truncate")).filter(Boolean);
      return {
        count: links.length,
        labels: labels.length,
        rows: new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size,
        inView: links.every((a) => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; }),
        clipped: labels.filter((l) => l.scrollWidth > l.clientWidth + 1).length,
      };
    });
    ok("phone bottom bar holds six tabs on one row at 375px", bar.count === 6 && bar.rows === 1 && bar.inView);
    ok("phone bottom bar labels are not clipped at 375px", bar.labels === 6 && bar.clipped === 0);
    await page.click("nav.fixed a:has-text('Stats')");
    await page.waitForSelector("h1:has-text('Statistiques')");
    ok("no horizontal scroll on the insights page on a phone", !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    await page.screenshot({ path: OUT + "11-insights-phone-fr.png" });
    ok("no runtime errors on the phone insights page", errors.length === 0);
    if (errors.length) console.log(errors.join("\n"));
    await ctx.close();
  }
  // 16. settings cards: password, delivery-fee delete (asks first), reply credits, Telegram (when configured)
  {
    const { page: sp, ctx: sctx, errors: serrors } = await newPage({ locale: "en-US" });
    try {
      await signIn(sp);
      state.fees.push({ id: "fx1", wilaya: "Testville", fee_cents: 50000 });
      await sp.click("a:has-text('Settings')");
      await sp.waitForSelector("section[aria-labelledby=sec-password]");

      const pwCard = sp.locator("section[aria-labelledby=sec-password]");
      await sp.fill("#pw-new", "newpass123");
      await sp.fill("#pw-confirm", "different1");
      await pwCard.locator("button[type=submit]").click();
      ok("password card rejects two different passwords", await sp.isVisible("section[aria-labelledby=sec-password] >> text=don't match"));
      const pwMark = state.log.length;
      await sp.fill("#pw-confirm", "newpass123");
      await pwCard.locator("button[type=submit]").click();
      await sp.waitForSelector("text=Password updated.");
      ok("password change calls the auth user endpoint with the new password", state.log.slice(pwMark).some((l) => l.startsWith("PUT /auth/v1/user") && l.includes('"password":"newpass123"')));

      await sp.waitForSelector("li:has-text('Testville')");
      const feeRow = sp.locator("li", { hasText: "Testville" });
      const cancelMark = state.log.length;
      sp.once("dialog", (d) => void d.dismiss());
      await feeRow.locator("button:has-text('Remove')").click();
      await sp.waitForTimeout(500);
      ok("cancelling the delivery-fee delete keeps the fee", (await feeRow.count()) === 1 && !state.log.slice(cancelMark).some((l) => l.startsWith("DELETE /rest/v1/delivery_fees")));
      const acceptMark = state.log.length;
      sp.once("dialog", (d) => void d.accept());
      await feeRow.locator("button:has-text('Remove')").click();
      await feeRow.waitFor({ state: "detached" });
      ok("accepting the delivery-fee delete removes the fee", state.log.slice(acceptMark).some((l) => l.startsWith("DELETE /rest/v1/delivery_fees") && l.includes("fx1")) && !state.fees.some((f) => f.id === "fx1"));

      const packMark = state.log.length;
      state.checkoutUrl = `http://127.0.0.1:${PORT}/settings?billing=success`;
      try {
        await sp.locator("section[aria-labelledby=sec-reply-credits] button").first().click();
        await sp.waitForURL(/billing=success/);
        await sp.waitForSelector("text=Payment received.");
        ok("a reply pack sends its size to billing-checkout and follows the checkout URL", state.log.slice(packMark).some((l) => l.startsWith("POST /functions/v1/billing-checkout") && l.includes('"pack":"500"')));
      } finally {
        state.checkoutUrl = null;
      }

      if (process.env.VITE_TELEGRAM_BOT_USERNAME) {
        await sp.waitForSelector("text=Telegram alerts");
        ok("Telegram card offers to connect when not linked", await sp.isVisible("button:has-text('Connect Telegram')"));
        state.telegramConnected = true;
        await sp.click("button:has-text('Refresh status')");
        await sp.waitForSelector("span:text-is('Connected')");
        const tgMark = state.log.length;
        await sp.click("button:has-text('Disconnect')");
        await sp.waitForSelector("span:text-is('Not connected')");
        ok("Telegram disconnect calls telegram_unlink", state.log.slice(tgMark).some((l) => l.startsWith("POST /rest/v1/rpc/telegram_unlink")));
      } else {
        console.log("SKIP Telegram card: VITE_TELEGRAM_BOT_USERNAME is not set for this build");
      }
      await sp.screenshot({ path: OUT + "12-settings-cards.png", fullPage: true });
      ok("no runtime errors on the settings cards", serrors.length === 0);
      if (serrors.length) console.log(serrors.join("\n"));
    } finally {
      state.fees = state.fees.filter((f) => f.id !== "fx1");
      state.telegramConnected = false;
      await sctx.close();
    }
  }

  // 17. assistant test chat: the reply shows, and the usage meter counts it when the page is opened again
  {
    const { page: ap, ctx: actx, errors: aerrors } = await newPage({ locale: "en-US" });
    await signIn(ap);
    await ap.click("a:has-text('Assistant')");
    await ap.waitForSelector("text=Try your assistant");
    const before = 7 + state.usageExtra;
    await ap.waitForSelector(`text=${before} of 1000`);
    await ap.fill("input[aria-label='Write as a customer…']", "do you have the hoodie in M?");
    await ap.click("button:has-text('Send')");
    await ap.waitForSelector("text=Yes, the Black Hoodie in M is available");
    ok("test chat shows the assistant's reply", await ap.isVisible("text=Yes, the Black Hoodie in M is available"));
    await ap.click("a:has-text('Chats')");
    await ap.waitForSelector("text=Customer chats");
    await ap.click("a:has-text('Assistant')");
    await ap.waitForSelector(`text=${before + 1} of 1000`);
    ok("usage meter counts the test reply", await ap.isVisible(`text=${before + 1} of 1000`));
    ok("no runtime errors in the assistant test chat", aerrors.length === 0);
    if (aerrors.length) console.log(aerrors.join("\n"));
    await actx.close();
  }

  // 18. checklist: each step has screen-reader text (done / to do) next to its glyph
  {
    const { page: cp, ctx: cctx } = await newPage({ locale: "en-US" });
    const testRuns = state.testRuns;
    try {
      state.testRuns = 0; // the "test the assistant" step becomes to-do, so the list shows both states
      await signIn(cp);
      await cp.waitForSelector("li .sr-only");
      const texts = (await cp.locator("li .sr-only").allTextContents()).map((x) => x.trim());
      ok("checklist steps have screen-reader text for done and to do", texts.length > 0 && texts.every((x) => x === "Done" || x === "To do") && texts.includes("To do") && texts.includes("Done"));
    } finally {
      state.testRuns = testRuns;
      await cctx.close();
    }
  }

  // 19. onboarding: a failed create_store shows an error alert and keeps the owner on the form
  {
    const { page: op, ctx: octx, errors: oerrors } = await newPage({ locale: "en-US" });
    state.hasStore = false; state.createStoreFail = true;
    try {
      await op.goto(`http://127.0.0.1:${PORT}/login`);
      await op.fill("#email", "new@example.com"); await op.fill("#password", "password123");
      await op.click("[data-testid=auth-submit]");
      await op.waitForURL(/\/onboarding/);
      await op.waitForSelector("text=Set up your store");
      await op.fill("#name", "My Shop");
      await op.click("button[type=submit]");
      await op.waitForSelector("[role=alert]:has-text('We could not create your store')");
      ok("a failed create_store shows an error alert and stays on onboarding", /\/onboarding/.test(op.url()));
      ok("no runtime errors on the onboarding error path", oerrors.length === 0);
      if (oerrors.length) console.log(oerrors.join("\n"));
    } finally {
      state.createStoreFail = false; state.hasStore = true;
      await octx.close();
    }
  }

  // 20. orders: "Load more" fetches the next page (50 per page)
  {
    const extra = Array.from({ length: 55 }, (_, i) => ({ id: `bulk-o${i + 1}`, customer_name: `Bulk order ${i + 1}`, phone: "0550000000", wilaya: "Oran", address: "Centre", subtotal_cents: 100000, delivery_fee_cents: 0, total_cents: 100000, status: "pending", order_items: [], created_at: new Date(Date.UTC(2026, 8, 1) - i * 60000).toISOString() }));
    state.orders.push(...extra);
    const { page: op2, ctx: o2ctx } = await newPage({ locale: "en-US" });
    try {
      await signIn(op2);
      await op2.click("a:has-text('Orders')");
      await op2.waitForSelector("div.truncate:has-text('Bulk order')");
      const bulkRows = () => op2.locator("div.truncate", { hasText: "Bulk order" }).count();
      ok("orders list shows the first 50 orders", (await bulkRows()) === 50);
      await op2.click("button:has-text('Load more')");
      await op2.waitForSelector("div.truncate:has-text('Bulk order 55')");
      ok("Load more adds the remaining orders", (await bulkRows()) === 55);
      ok("no Load more button once every order is shown", (await op2.locator("button:has-text('Load more')").count()) === 0);
    } finally {
      state.orders = state.orders.filter((o) => !o.id.startsWith("bulk-o"));
      await o2ctx.close();
    }
  }
  // 21. dialogs: the close button has a translated label in Arabic
  {
    const { page: mp, ctx: mctx } = await newPage({ locale: "ar-DZ" });
    try {
      await mp.goto(`http://127.0.0.1:${PORT}/login`);
      await mp.fill("#email", "owner@example.com"); await mp.fill("#password", "password123");
      await mp.click("[data-testid=auth-submit]");
      await mp.waitForURL(/\/inbox/);
      await mp.goto(`http://127.0.0.1:${PORT}/settings`);
      await mp.waitForSelector("button:has-text('إضافة جواب')");
      await mp.click("button:has-text('إضافة جواب')");
      await mp.waitForSelector("[role=dialog]");
      ok("Arabic dialog close button is labelled إغلاق", await mp.isVisible("[role=dialog] button[aria-label='إغلاق']"));
    } finally {
      await mctx.close();
    }
  }
  // 22. handoff alerts: tab title count (realtime), owner replies, baseline at load, Settings card,
  // browser notifications with Notification stubbed, Arabic card
  {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const orig = Object.fromEntries(["c1", "c2", "c3"].map((id) => {
      const c = state.conversations.find((x) => x.id === id);
      return [id, { status: c.status, handoff_reason: c.handoff_reason }];
    }));
    const restoreChats = () => {
      for (const [id, v] of Object.entries(orig)) Object.assign(state.conversations.find((x) => x.id === id), v);
      pushConversationChange();
    };
    // Waits until the dashboard has joined at least n realtime subscriptions (so a push is not missed).
    const waitJoins = async (n, ms = 5000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if (state.realtimeJoins >= n) return true; await pause(100); }
      return false;
    };
    const waitTitle = (p, re, ms = 5000) => p.waitForFunction((src) => new RegExp(src).test(document.title), re.source, { timeout: ms }).then(() => true, () => false);
    // Stands in for the Notification API: records each notification built, and reports a fixed permission.
    const notificationStub = (permission) => `(() => {
      window.__notes = []; window.__requests = 0;
      class FakeNotification {
        constructor(title, opts) { window.__notes.push({ title, body: opts && opts.body }); }
        static get permission() { return ${JSON.stringify(permission)}; }
        static requestPermission() { window.__requests++; return Promise.resolve(FakeNotification.permission); }
      }
      window.Notification = FakeNotification;
    })();`;
    const alertsCard = (p) => p.locator("section[aria-labelledby=sec-alerts]");
    const notes = (p) => p.evaluate(() => window.__notes);
    const reloadAndJoin = async (p) => {
      const j = state.realtimeJoins;
      await p.reload();
      // Layout, the inbox and the alert hook each subscribe to conversations.
      await waitJoins(j + 3);
    };
    try {
      // Nothing is waiting at the start: Amine's chat (c1) is answered and the others are not handed over.
      flipConversation("c1", { status: "bot", handoff_reason: null });

      // a) title count from realtime
      {
        const { page: hp, ctx: hctx, errors: herrors } = await newPage({ locale: "en-US" });
        try {
          const j = state.realtimeJoins;
          await signIn(hp);
          await waitJoins(j + 3);
          ok("no count in the title when no chat is waiting", /^Store Assistant$/.test(await hp.title()));
          flipConversation("c2", { status: "human", handoff_reason: "Wants a refund" });
          ok("a new handoff over realtime puts (1) in the tab title", await waitTitle(hp, /^\(1\) Store Assistant$/));
          // An owner reply in a chat with no handoff reason: status human, reason null. Chat c2 still waits,
          // so the count must stay at 1 (it would read 2 if the reply counted).
          flipConversation("c3", { status: "human", handoff_reason: null });
          await hp.waitForSelector("aside [data-testid=needs-badge]:text-is('2')", { timeout: 5000 });
          await pause(400);
          ok("an owner reply in a chat with no handoff reason leaves the title count alone", (await hp.title()) === "(1) Store Assistant");
          flipConversation("c2", { status: "bot", handoff_reason: null });
          ok("resolving the handed-over chat clears the count from the title", await waitTitle(hp, /^Store Assistant$/));
          ok("no runtime errors in the title count checks", herrors.length === 0);
          if (herrors.length) console.log(herrors.join("\n"));
        } finally {
          await hctx.close();
        }
      }

      // b) browser notifications granted: toggles persist, one notification per new handoff, none when off
      {
        const { page: gp, ctx: gctx, errors: gerrors } = await newPage({ locale: "en-US" });
        await gctx.addInitScript(notificationStub("granted"));
        try {
          const j = state.realtimeJoins;
          await signIn(gp);
          await waitJoins(j + 3);
          await gp.click("a:has-text('Settings')");
          await gp.waitForSelector("section[aria-labelledby=sec-alerts]");
          await alertsCard(gp).locator("label").nth(0).click();
          await reloadAndJoin(gp);
          await gp.waitForSelector("section[aria-labelledby=sec-alerts]");
          ok("the sound toggle stays on after a reload", await alertsCard(gp).getByRole("switch").nth(0).isChecked());
          await alertsCard(gp).locator("label").nth(0).click();
          await alertsCard(gp).locator("label").nth(1).click();
          await gp.waitForFunction(() => window.__requests >= 1, null, { timeout: 5000 });
          ok("turning on browser notifications asks the browser for permission", (await gp.evaluate(() => window.__requests)) >= 1);
          await reloadAndJoin(gp);
          await gp.waitForSelector("section[aria-labelledby=sec-alerts]");
          ok("the notifications toggle stays on after a reload", await alertsCard(gp).getByRole("switch").nth(1).isChecked());
          ok("the sound toggle is back off", !(await alertsCard(gp).getByRole("switch").nth(0).isChecked()));

          flipConversation("c2", { status: "human", handoff_reason: "Wants a refund" });
          await gp.waitForFunction(() => window.__notes.length >= 1, null, { timeout: 5000 }).catch(() => {});
          const first = await notes(gp);
          ok("a new handoff with notifications on sends exactly one notification", first.length === 1);
          ok("the notification names the customer and the reason",
            first.length === 1 && first[0].title === "New customer chat" && first[0].body === "Sara: Wants a refund");

          // Owner reply in a chat with no reason: the badge reads 2 once the push lands, the notification count stays.
          flipConversation("c3", { status: "human", handoff_reason: null });
          await gp.waitForSelector("aside [data-testid=needs-badge]:text-is('2')", { timeout: 5000 });
          await pause(400);
          ok("an owner reply in a chat with no handoff reason sends no notification", (await notes(gp)).length === 1);

          // Switch notifications off: a new handoff is still counted in the title but notifies nothing.
          await alertsCard(gp).locator("label").nth(1).click();
          ok("the notifications toggle turns off", !(await alertsCard(gp).getByRole("switch").nth(1).isChecked()));
          flipConversation("c3", { status: "human", handoff_reason: "Second question" });
          ok("with notifications off a new handoff still shows in the title", await waitTitle(gp, /^\(2\) Store Assistant$/));
          ok("with notifications off a new handoff sends no notification", (await notes(gp)).length === 1);
          ok("no runtime errors on the alerts card and notification checks", gerrors.length === 0);
          if (gerrors.length) console.log(gerrors.join("\n"));
        } finally {
          await gctx.close();
        }
      }

      // c) chats already waiting when the app opens do not alert; a later handoff alerts once
      {
        // Only c1 waits at load: (b) left c2 and c3 handed over.
        flipConversation("c2", { status: "bot", handoff_reason: null });
        flipConversation("c3", { status: "closed", handoff_reason: null });
        flipConversation("c1", { status: "human", handoff_reason: "Customer wants to order 2 hoodies" });
        const { page: bp, ctx: bctx, errors: berrors } = await newPage({ locale: "en-US" });
        await bctx.addInitScript(notificationStub("granted"));
        // Preset the preference only when nothing is stored yet, so a reload keeps what the owner chose.
        await bctx.addInitScript(() => { try { if (localStorage.getItem("wakil.alerts.notify") === null) localStorage.setItem("wakil.alerts.notify", "1"); } catch { /* storage blocked */ } });
        try {
          const j = state.realtimeJoins;
          await signIn(bp);
          await waitJoins(j + 3);
          ok("a chat already waiting at load shows (1) in the title", await waitTitle(bp, /^\(1\) Store Assistant$/));
          await pause(400);
          ok("a chat already waiting at load does not notify", (await notes(bp)).length === 0);
          flipConversation("c2", { status: "human", handoff_reason: "Wants a refund" });
          await bp.waitForFunction(() => window.__notes.length >= 1, null, { timeout: 5000 }).catch(() => {});
          ok("after load, one new handoff notifies once (the waiting chat does not repeat)", (await notes(bp)).length === 1);
          ok("no runtime errors in the load-time baseline checks", berrors.length === 0);
          if (berrors.length) console.log(berrors.join("\n"));
        } finally {
          await bctx.close();
        }
      }

      // d) permission denied: the toggle stays off, the reason is shown, nothing is sent
      {
        // Nothing waits at load: (c) left c1 and c2 handed over.
        flipConversation("c1", { status: "bot", handoff_reason: null });
        flipConversation("c2", { status: "bot", handoff_reason: null });
        const { page: dp, ctx: dctx, errors: derrors } = await newPage({ locale: "en-US" });
        await dctx.addInitScript(notificationStub("denied"));
        try {
          const j = state.realtimeJoins;
          await signIn(dp);
          await waitJoins(j + 3);
          await dp.click("a:has-text('Settings')");
          await dp.waitForSelector("section[aria-labelledby=sec-alerts]");
          await alertsCard(dp).locator("label").nth(1).click();
          await dp.waitForSelector("section[aria-labelledby=sec-alerts] [role=status]:has-text('blocked')", { timeout: 5000 });
          ok("a denied permission keeps the notifications toggle off and says why",
            !(await alertsCard(dp).getByRole("switch").nth(1).isChecked()));
          ok("the browser was asked once", (await dp.evaluate(() => window.__requests)) === 1);
          flipConversation("c2", { status: "human", handoff_reason: "Wants a refund" });
          ok("a new handoff with permission denied shows in the title", await waitTitle(dp, /^\(1\) Store Assistant$/));
          ok("a new handoff with permission denied sends no notification", (await notes(dp)).length === 0);
          ok("no runtime errors in the denied-permission checks", derrors.length === 0);
          if (derrors.length) console.log(derrors.join("\n"));
        } finally {
          await dctx.close();
        }
      }

      // e) Arabic: the alerts card shows and the page logs no errors
      {
        const { page: ap, ctx: actx, errors: aerrors } = await newPage({ locale: "ar-DZ" });
        try {
          await ap.goto(`http://127.0.0.1:${PORT}/login`);
          await ap.fill("#email", "owner@example.com"); await ap.fill("#password", "password123");
          await ap.click("[data-testid=auth-submit]");
          await ap.waitForURL(/\/inbox/);
          await ap.goto(`http://127.0.0.1:${PORT}/settings`);
          await ap.waitForSelector("section[aria-labelledby=sec-alerts]");
          ok("Arabic Settings shows the alerts card", (await alertsCard(ap).textContent()).includes("تنبيهات على هذا الجهاز"));
          ok("the Arabic alerts card has two labelled switches",
            (await alertsCard(ap).getByRole("switch").count()) === 2);
          ok("no runtime errors on the Arabic Settings alerts card", aerrors.length === 0);
          if (aerrors.length) console.log(aerrors.join("\n"));
        } finally {
          await actx.close();
        }
      }
    } finally {
      restoreChats();
    }
  }
  // 23. close and reopen: reopening a chat that once had a handoff must not look like a new handoff
  {
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitTitle = (p, re, ms = 6000) => p.waitForFunction((src) => new RegExp(src).test(document.title), re.source, { timeout: ms }).then(() => true, () => false);
    const keep = ["c1", "c2", "c3"].map((id) => [id, { ...state.conversations.find((x) => x.id === id) }]);
    const { page: rp, ctx: rctx, errors: rerrors } = await newPage({ locale: "en-US" });
    try {
      for (const id of ["c1", "c3"]) Object.assign(state.conversations.find((x) => x.id === id), { status: "bot", handoff_reason: null });
      Object.assign(state.conversations.find((x) => x.id === "c2"), { status: "human", handoff_reason: "Wants a refund" });
      state.applyConversationPatch = true;
      await signIn(rp);
      await rp.goto(`http://127.0.0.1:${PORT}/inbox/c2`);
      ok("a chat waiting with a handoff reason shows (1) in the title", await waitTitle(rp, /^\(1\) Store Assistant$/));
      await rp.click("button:has-text('Close')");
      ok("closing drops the handoff reason along with the status", await logged((l) => l.startsWith("PATCH /rest/v1/conversations") && l.includes('"status":"closed"') && l.includes('"handoff_reason":null')));
      ok("closing clears the count from the title", await waitTitle(rp, /^Store Assistant$/));
      await rp.click("button:has-text('Reopen')");
      await rp.waitForSelector("button:has-text('Hand back to the assistant')");
      await pause(1500);
      ok("reopening a closed chat does not put the count back in the title", (await rp.title()) === "Store Assistant");
      ok("no runtime errors in the close and reopen checks", rerrors.length === 0);
    } finally {
      state.applyConversationPatch = false;
      for (const [id, v] of keep) Object.assign(state.conversations.find((x) => x.id === id), v);
      pushConversationChange();
      await rctx.close();
    }
  }
} catch (e) {
  console.log("TEST ERROR:", e.message.split("\n")[0]);
  results.push(["test run completed", false]);
}

await browser.close(); preview.kill(); mock.close();
const failed = results.filter(([, p]) => !p).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
