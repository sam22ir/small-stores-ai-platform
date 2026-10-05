// Browser smoke test: drives the built app against tests/mock.mjs (a stand-in for Supabase).
//   npm run test:ui          (needs a Chromium: set CHROMIUM_PATH, or run `npx playwright-core install chromium`)
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
import { start, state } from "./mock.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = ROOT + ".test-shots/";
import fs from "node:fs"; fs.mkdirSync(OUT, { recursive: true });

const mock = await start();
const preview = spawn("npx", ["vite", "preview", "--outDir", ".test-dist", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });
// Wait for the preview server instead of guessing how long `npx vite preview` takes to start.
for (let i = 0; i < 120; i++) {
  try { if ((await fetch("http://127.0.0.1:4173/")).ok) break; } catch { /* not up yet */ }
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

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  // The rate-limit test deliberately triggers a 429 from the function.
  page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("status of 429")) errors.push("console: " + m.text()); });
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
  await page.click("button:has-text('Sign in with an email link instead')");
  ok("link mode hides the password field", (await page.locator("#password").count()) === 0);
  await page.click("button.btn-primary");
  await page.waitForSelector("text=we sent you a sign-in link");
  ok("email-link sign-in calls the OTP endpoint with the address", await logged((l) => l.startsWith("POST /auth/v1/otp") && l.includes("owner@example.com")));
  await page.screenshot({ path: OUT + "01b-login-link.png" });
  await page.click("button:has-text('Use a password instead')");
  await page.fill("#password", "password123");
  await page.click("button.btn-primary");
  await page.waitForURL(/\/inbox/);
  await page.waitForSelector("text=Customer chats");
  ok("sign-in lands on the inbox", true);
  ok("'Needs you' tab shows the handed-off chat", await page.isVisible("text=Amine"));
  ok("handoff reason is visible on the card", await page.isVisible("text=Customer wants to order 2 hoodies"));
  ok("inbox card previews the latest message", await page.isVisible("text=The owner will reply to you personally."));
  ok("tab counts rendered", await page.isVisible("text=Needs you (1)"));
  ok("test chats are hidden from the customer inbox", !(await page.isVisible("text=test handoff")));
  ok("outage banner counts messages the assistant couldn't answer", await page.isVisible("text=couldn't answer 2 message(s)"));
  ok("setup checklist shows progress for a new store", await page.isVisible("text=Get your assistant ready") && await page.isVisible("text=0 of 3 done") && await page.isVisible("text=2 added"));
  ok("the first unfinished step is marked Next", await page.isVisible("li:has-text('Add your products') >> text=Next"));
  ok("optional and coming-soon steps are listed", await page.isVisible("text=Take orders in chats (optional)") && await page.isVisible("li:has-text('Connect Instagram or Facebook') >> text=Coming soon"));
  await page.screenshot({ path: OUT + "02-inbox.png" });

  await page.click("[role=tab]:has-text('Assistant')");
  ok("assistant tab shows Sara on Instagram", await page.isVisible("text=Sara") && await page.isVisible("text=Instagram"));

  await page.click("a:has-text('Import a list')");
  await page.waitForSelector("[role=dialog]:has-text('Import stock list')");
  ok("'Import a list' opens the import dialog on the catalog", /\/catalog/.test(page.url()));
  await page.click("[role=dialog] button:has-text('Cancel')");
  ok("closing it clears the ?import flag", !/import=1/.test(page.url()));
  await page.click("a:has-text('Chats')");
  await page.waitForSelector("text=Customer chats");

  // 2. thread + reply
  await page.click("[role=tab]:has-text('Needs you')");
  await page.click("text=Amine");
  await page.waitForSelector("text=I want to order 2 hoodies");
  ok("thread shows customer and assistant messages", await page.isVisible("text=The owner will reply to you personally."));
  await page.fill("textarea", "Hi! Yes we can arrange 2 hoodies.");
  await page.click("button:has-text('Send')");
  await page.waitForSelector("text=Hi! Yes we can arrange 2 hoodies.");
  await page.waitForSelector("text=Not sent yet");
  ok("owner reply appears with the 'not sent yet' note", true);
  ok("reply was POSTed as sender=owner, delivery pending", await logged((l) => l.startsWith("POST /rest/v1/messages") && l.includes('"sender":"owner"') && l.includes('"delivery_status":"pending"')));
  await page.click("button:has-text('Save as an answer the assistant can use')");
  await page.waitForSelector("[role=dialog]");
  ok("save-to-FAQ prefills the customer question and the owner's reply",
    (await page.inputValue("#faq-q")) === "I want to order 2 hoodies" && (await page.inputValue("#faq-a")) === "Hi! Yes we can arrange 2 hoodies.");
  await page.fill("#faq-a", "Yes, we can arrange 2 hoodies. Delivery is 3-5 days.");
  await page.screenshot({ path: OUT + "03b-save-faq.png" });
  await page.click("[role=dialog] button.btn-primary");
  await page.waitForSelector("text=Saved to your answers");
  ok("FAQ entry is stored with the question, the edited answer and the chat id", await logged((l) => l.startsWith("POST /rest/v1/faq_entries") && l.includes('"question":"I want to order 2 hoodies"') && l.includes("3-5 days") && l.includes('"conversation_id":"c1"')));
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

  // 3b. stock accuracy
  ok("catalog nudges the owner to try the assistant", await page.isVisible("text=Your assistant can now answer questions about these products."));
  ok("stale banner counts active products with old numbers", await page.isVisible("text=1 product(s) have had no stock update for 14+ days"));
  ok("stale product is flagged", await page.isVisible("li:has-text('Canvas Tote') >> text=Check stock"));
  await page.click("button:has-text('Mark all as checked')");
  ok("'mark all as checked' stamps stock_checked_at on those products", await logged((l) => l.startsWith("PATCH /rest/v1/products") && l.includes("in.%28p3%29") && l.includes("stock_checked_at")));
  ok("banner disappears once checked", !(await page.isVisible("text=have had no stock update")));
  await page.click("li:has-text('Black Hoodie') >> button:has-text('Sold out today')");
  ok("'sold out today' sets sold_out_until without touching stock", await logged((l) => l.startsWith("PATCH /rest/v1/products") && /"sold_out_until":"20\d\d-/.test(l) && !l.includes("stock_quantity")));
  ok("product shows the sold-out badge", await page.isVisible("li:has-text('Black Hoodie') >> .badge:has-text('Sold out today')"));
  await page.screenshot({ path: OUT + "04b-sold-out.png" });
  await page.click("li:has-text('Black Hoodie') >> button:has-text('Back in stock')");
  ok("'back in stock' clears sold_out_until", await logged((l) => l.startsWith("PATCH /rest/v1/products") && l.includes('"sold_out_until":null')));

  // 3c. bulk import
  await page.click("button:has-text('Import stock list')");
  await page.waitForSelector("[role=dialog]");
  await page.fill("[role=dialog] textarea", "name, price, stock, option\nBlack Hoodie, 4500, 5, M\nBlack Hoodie, 4500, 30, L\nSilk Scarf, 1500, 8, \n, 100, 1, x");
  ok("import preview counts products and options and flags unreadable lines", await page.isVisible("text=2 product(s), 3 option(s) found") && await page.isVisible("text=1 line(s) can't be read"));
  await page.screenshot({ path: OUT + "04c-import.png" });
  await page.click("[role=dialog] button.btn-primary:has-text('Import')");
  await page.waitForSelector("text=Done: 1 added, 1 updated.");
  ok("import updates existing stock by product and option", await logged((l) => l.startsWith("PATCH /rest/v1/product_variants") && l.includes('"stock_quantity":5')) && await logged((l) => l.startsWith("PATCH /rest/v1/product_variants") && l.includes('"stock_quantity":30')));
  ok("import creates new products with their price in cents", await logged((l) => l.startsWith("POST /rest/v1/products") && l.includes('"name":"Silk Scarf"') && l.includes('"price_cents":150000')));
  await page.click("[role=dialog] button:has-text('Cancel')");

  // 4. product editor validation + save
  await page.click("button:has-text('Add product')");
  await page.waitForSelector("[role=dialog]");
  await page.click("[role=dialog] button.btn-primary");
  ok("empty name is rejected with a message", await page.isVisible("text=Enter a product name."));
  await page.fill("#pname", "Linen Shirt");
  await page.fill("#pprice", "abc");
  await page.click("[role=dialog] button.btn-primary");
  ok("bad price is rejected", await page.isVisible("text=Enter a valid price."));
  await page.fill("#palias", "linen, kittan");
  await page.fill("#pprice", "3 800");
  await page.screenshot({ path: OUT + "05-editor.png" });
  await page.click("[role=dialog] button.btn-primary");
  await page.waitForSelector("[role=dialog]", { state: "detached" });
  ok("valid product is inserted (price 380000 cents) with its variant", await logged((l) => l.startsWith("POST /rest/v1/products") && l.includes('"price_cents":380000') && l.includes('"aliases":"linen, kittan"')) && state.log.some((l) => l.startsWith("POST /rest/v1/product_variants")));

  // 5. settings + channels
  await page.click("a:has-text('Settings')");
  await page.waitForSelector("text=Store settings");
  ok("settings shows the structured store-info fields", await page.isVisible("label:has-text('Opening hours')") && await page.isVisible("label:has-text('Returns and exchanges')"));
  await page.fill("#info-hours", "Every day 10:00-18:00");
  await page.fill("#info-delivery", "3-5 days");
  await page.fill("#info-other", "Gift wrapping available.");
  await page.check("label:has-text('Take orders in chats') input");
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=Saved");
  ok("settings save sends only allowed columns", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes("business_info") && !l.includes('"id"')));
  ok("the fields are composed into the text the assistant reads, and kept as JSON", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes("Opening hours: Every day 10:00-18:00") && l.includes("Delivery: 3-5 days") && l.includes("Gift wrapping available.") && l.includes('"business_info_fields"')));
  ok("orders toggle is saved", await logged((l) => l.startsWith("PATCH /rest/v1/stores") && l.includes('"orders_enabled":true')));

  // 5a. FAQ the assistant knows
  await page.waitForSelector("text=Answers the assistant knows");
  ok("existing and just-saved answers are listed", await page.isVisible("li:has-text('Do you gift wrap?')") && await page.isVisible("li:has-text('3-5 days')"));
  await page.click("button:has-text('Add an answer')");
  await page.click("[role=dialog] button.btn-primary");
  ok("empty question is rejected", await page.isVisible("text=Write the question."));
  await page.fill("#faq-q", "Can I pay by card?");
  await page.fill("#faq-a", "Cash on delivery only.");
  await page.click("[role=dialog] button.btn-primary");
  await page.waitForSelector("li:has-text('Can I pay by card?')");
  ok("manually added answer is stored", await logged((l) => l.startsWith("POST /rest/v1/faq_entries") && l.includes("Cash on delivery only.") && l.includes('"conversation_id":null')));
  page.once("dialog", (d) => void d.accept());
  await page.click("li:has-text('Do you gift wrap?') >> button:has-text('Delete')");
  ok("deleting an answer asks first and then calls DELETE", await logged((l) => l.startsWith("DELETE /rest/v1/faq_entries")));

  // 5b. delivery fees
  await page.waitForSelector("text=Delivery fees");
  ok("existing delivery fee is listed", await page.isVisible("li:has-text('Alger')"));
  await page.fill("#fw", "Oran");
  await page.click("form:has(#fw) button.btn-primary");
  ok("adding a fee without an amount is rejected", await page.isVisible("text=Enter a valid fee."));
  await page.fill("#ff", "600");
  await page.click("form:has(#fw) button.btn-primary");
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
  ok("channels are listed as coming soon", (await page.locator("button:has-text('Coming soon')").count()) === 2);
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
  ok("new test chat clears the conversation", !(await page.isDisabled("input[aria-label='Write as a customer…']")) && !(await page.isVisible("text=Black Hoodie in M is available")));
  await page.click("a:has-text('Chats')");
  await page.waitForSelector("text=Customer chats");
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
