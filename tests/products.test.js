import assert from "node:assert/strict";
import test from "node:test";
import { inferProduct, productHintScore } from "../server/products.js";

const products = [
  { id: 1, name: "Payro" },
  { id: 2, name: "Eduvia" },
  { id: 3, name: "Vaulta" },
  { id: 4, name: "Finara" },
  { id: 5, name: "VendiX POS" },
  { id: 6, name: "NenPOS" },
];

test("explicit product names map a concern to the right product", () => {
  assert.equal(inferProduct("My VendiX POS terminal will not start", products)?.name, "VendiX POS");
  assert.equal(inferProduct("Invoice shows the wrong VAT amount", products)?.name, "Finara");
  assert.equal(inferProduct("I cannot reset my password or sign in with SSO", products)?.name, "Vaulta");
});

test("product hints can identify the product without an explicit name", () => {
  assert.equal(inferProduct("The kitchen printer is not showing new orders", products)?.name, "NenPOS");
  assert.equal(inferProduct("My vendix keeps freezing at checkout", products)?.name, "VendiX POS");
  assert.equal(inferProduct("Student enrollment bulk import failed", products)?.name, "Eduvia");
});

test("single-word hints do not match inside unrelated words", () => {
  assert.equal(productHintScore("Payro", "rapid response needed"), 0);
  assert.equal(productHintScore("VendiX POS", "what is your position on this"), 0);
});

test("unrelated text is left unassigned", () => {
  assert.equal(inferProduct("Hello, can someone help me?", products), null);
});
