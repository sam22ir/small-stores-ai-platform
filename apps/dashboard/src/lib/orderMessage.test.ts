import assert from "node:assert/strict";
import { test } from "node:test";
import { algerianWaNumber, buildOrderMessage, whatsappUrl } from "./orderMessage.ts";

test("converts Algerian local mobile numbers to international form", () => {
  assert.equal(algerianWaNumber("0555 12 34 56"), "213555123456");
  assert.equal(algerianWaNumber("06-61-23-45-67"), "213661234567");
  assert.equal(algerianWaNumber("0712345678"), "213712345678");
});

test("keeps numbers that already carry the country code", () => {
  assert.equal(algerianWaNumber("+213 555 12 34 56"), "213555123456");
  assert.equal(algerianWaNumber("00213555123456"), "213555123456");
});

test("rejects unusable numbers", () => {
  assert.equal(algerianWaNumber(""), null);
  assert.equal(algerianWaNumber("12"), null);
  assert.equal(algerianWaNumber("0123"), null);
});

test("builds a WhatsApp link with an encoded message", () => {
  assert.equal(whatsappUrl("0555123456", "a b&c"), "https://wa.me/213555123456?text=a%20b%26c");
  assert.equal(whatsappUrl("nope", "x"), null);
});

test("builds the confirmation text from the order", () => {
  const text = buildOrderMessage(
    {
      customer_name: "Amine",
      wilaya: "Oran",
      total_cents: 350000,
      order_items: [
        { name: "Shirt", variant_label: "M", quantity: 2, unit_price_cents: 100000 },
        { name: "Cap", variant_label: "", quantity: 1, unit_price_cents: 150000 },
      ],
    },
    { greeting: (n) => `Hello ${n}, confirmed.`, items: "Items", wilaya: "Wilaya", total: "Total on delivery" },
    (c) => `${c / 100} DA`,
  );
  assert.equal(
    text,
    "Hello Amine, confirmed.\n\nItems:\n- 2 × Shirt (M): 2000 DA\n- 1 × Cap: 1500 DA\n\nWilaya: Oran\nTotal on delivery: 3500 DA",
  );
});
