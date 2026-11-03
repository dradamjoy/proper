import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importRates, importSummary, readRates } from "./fees.ts";

// Made-up amounts. Real contract rates stay out of this public repo.
const sample = [
  "plan,license,code,allowed_per_unit,effective_date,notes",
  'bcn,LP,96130,100.00,2026-07-01,"Schedule A, LP column"',
  'bcn,LLP,96130,90.00,2026-07-01,"Schedule A, HO column; own NPI"',
  "bcn-advantage,LP,96130,101.50,2026-07-01,",
  "bcn-advantage,LLP,96127,5.25,2026-07-01,",
].join("\r\n");

describe("importRates", () => {
  it("reads plan, license, code, and amount, with commas inside quoted notes", () => {
    const result = importRates({}, sample);
    assert.equal(result.error, null);
    assert.equal(result.loaded, 4);
    assert.deepEqual(result.next, { "bcn|lp|96130": 100, "bcn|llp|96130": 90, "bcn-advantage|lp|96130": 101.5, "bcn-advantage|llp|96127": 5.25 });
    assert.deepEqual(result.plans.map((plan) => [plan.payer, plan.count]), [["bcn", 2], ["bcn-advantage", 2]]);
    assert.deepEqual(readRates(result.next), result.next);
  });

  it("replaces typed rates and keeps the rest", () => {
    const result = importRates({ "bcn|lp|96130": 80, "aetna|lp|96130": 120 }, sample);
    assert.equal(result.replaced, 1);
    assert.equal(result.next["bcn|lp|96130"], 100);
    assert.equal(result.next["aetna|lp|96130"], 120);
    assert.match(importSummary(result), /Loaded 4 rates: Blue Care Network 2, BCN Advantage 2\. Replaced 1/);
  });

  it("skips rows it cannot use and says why", () => {
    const text = ["Plan,License,Code,Allowed", "bcbs,LP,96130,1", "medicare,LLP,96130,1", "bcn,PhD,96130,1", "bcn,LP,9613,1", "bcn,LP,96131,abc", "Blue Care Network,lp,96131,$75.10"].join("\n");
    const result = importRates({}, text);
    assert.equal(result.loaded, 1);
    assert.equal(result.next["bcn|lp|96131"], 75.1);
    assert.deepEqual(result.skipped.map((item) => item.row), [2, 3, 4, 5, 6]);
    assert.match(result.skipped[1].reason, /Medicare does not enroll an LLP/);
  });

  it("refuses a file without the needed columns", () => {
    const current = { "bcn|lp|96130": 80 };
    const result = importRates(current, "payer,cpt,amount\nbcn,96130,1");
    assert.ok(result.error);
    assert.equal(result.next, current);
  });
});
