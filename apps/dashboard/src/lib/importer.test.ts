import assert from "node:assert/strict";
import { test } from "node:test";
import { groupRows, parseImport, parseMoney } from "./importer.ts";

test("parses prices written the way people write them", () => {
  assert.equal(parseMoney("4500"), 450000);
  assert.equal(parseMoney("4 500 DA"), 450000);
  assert.equal(parseMoney("4,500.50"), 450050);
  assert.equal(parseMoney("4500,5"), 450050);
  assert.equal(parseMoney("4,500"), 450000);
  assert.equal(parseMoney("abc"), null);
  assert.equal(parseMoney(""), null);
});

test("reads a spreadsheet paste with a header row in any order", () => {
  const text = "stock\tproduit\tprix\n3\tBlack Hoodie\t4500\n10\tTote Bag\t1 200 DA";
  const { rows, errors } = parseImport(text);
  assert.deepEqual(errors, []);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Black Hoodie");
  assert.equal(rows[0].stock, 3);
  assert.equal(rows[0].priceCents, 450000);
  assert.equal(rows[1].priceCents, 120000);
});

test("without a header it assumes name, price, stock, option", () => {
  const { rows } = parseImport("Black Hoodie, 4500, 3, M\nBlack Hoodie, 4500, 24, L");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.option, r.stock]), [["M", 3], ["L", 24]]);
});

test("understands semicolons and quoted commas", () => {
  const { rows } = parseImport('name;price;stock\n"Shirt, linen";3800;5');
  assert.equal(rows[0].name, "Shirt, linen");
  assert.equal(rows[0].priceCents, 380000);
});

test("reports bad lines without dropping the good ones", () => {
  const { rows, errors } = parseImport("name,price,stock\nHoodie,4500,3\n,100,1\nWallet,abc,2\nBag,100,x");
  assert.equal(rows.length, 1);
  assert.deepEqual(errors.map((e) => [e.line, e.reason]), [[3, "name"], [4, "price"], [5, "stock"]]);
});

test("blank price or stock means 'not given' (so existing values can stay)", () => {
  const { rows } = parseImport("name,price,stock\nHoodie,,7\nWallet,3200,");
  assert.equal(rows[0].priceCents, null);
  assert.equal(rows[0].stock, 7);
  assert.equal(rows[1].stock, null);
});

test("rows with the same name become one product with several options", () => {
  const { rows } = parseImport("name,price,stock,option\nHoodie,4500,3,M\nhoodie,4500,24,L\nHoodie,4800,2,XL");
  const products = groupRows(rows);
  assert.equal(products.length, 1);
  assert.equal(products[0].priceCents, 450000);
  assert.deepEqual(products[0].options.map((o) => [o.label, o.stock, o.priceCents]), [
    ["M", 3, null],
    ["L", 24, null],
    ["XL", 2, 480000],
  ]);
});

test("a repeated option updates instead of duplicating", () => {
  const products = groupRows(parseImport("name,stock,option\nHoodie,3,M\nHoodie,9,M").rows);
  assert.equal(products[0].options.length, 1);
  assert.equal(products[0].options[0].stock, 9);
});

test("empty input yields nothing", () => {
  assert.deepEqual(parseImport("  \n \n"), { rows: [], errors: [] });
});
