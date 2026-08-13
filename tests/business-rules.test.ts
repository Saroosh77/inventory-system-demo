import assert from "node:assert/strict";
import test from "node:test";
import { can, visibleProductTypes } from "../lib/server/access-control";
import { calculateInvoice, isCompanyFinancialSale } from "../lib/server/business-rules";

test("calculates GST separately from revenue", () => {
  assert.deepEqual(calculateInvoice([
    { quantity: 3, unitPrice: 2_000, discount: 0 },
    { quantity: 4, unitPrice: 1_000, discount: 200 },
  ], 300, { taxType: "GST", taxRateBps: 1800 }), {
    grossAmount: 10_000, discount: 500, taxableAmount: 9_500, taxAmount: 1_710, netAmount: 11_210,
  });
});

test("non-GST invoices always have zero tax", () => {
  assert.throws(() => calculateInvoice([{ quantity: 1, unitPrice: 1000, discount: 0 }], 0, { taxType: "NON_GST", taxRateBps: 1800 }), /zero tax rate/i);
});

test("P&L includes primary and direct but excludes secondary", () => {
  assert.equal(isCompanyFinancialSale("PRIMARY"), true);
  assert.equal(isCompanyFinancialSale("DIRECT"), true);
  assert.equal(isCompanyFinancialSale("SECONDARY"), false);
});

test("raw materials stay visible only to roles holding that permission", () => {
  assert.ok((visibleProductTypes("FINANCE") as readonly string[]).includes("RAW_MATERIAL"));
  assert.ok((visibleProductTypes("WAREHOUSE_STAFF") as readonly string[]).includes("RAW_MATERIAL"));
});

test("the warehouse role moves stock but never sees cost or margin", () => {
  assert.equal(can("WAREHOUSE_STAFF", "ADJUST_INVENTORY"), true);
  assert.equal(can("WAREHOUSE_STAFF", "TRANSFER_INVENTORY"), true);
  assert.equal(can("WAREHOUSE_STAFF", "VIEW_INVENTORY_COST"), false);
  assert.equal(can("WAREHOUSE_STAFF", "VIEW_PNL"), false);
  assert.equal(can("WAREHOUSE_STAFF", "VIEW_INVOICES"), false);
});

test("finance owns the money but not the master data", () => {
  assert.equal(can("FINANCE", "VIEW_PNL"), true);
  assert.equal(can("FINANCE", "CANCEL_INVOICE"), true);
  assert.equal(can("FINANCE", "MANAGE_MASTER_DATA"), false);
  assert.equal(can("FINANCE", "MANAGE_USERS"), false);
  assert.equal(can("ADMIN", "MANAGE_MASTER_DATA"), true);
});
