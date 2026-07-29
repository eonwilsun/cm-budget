import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isInterestRelated } from "./reportParsing";

test("detects interest wording in bank rows", () => {
  assert.equal(isInterestRelated("Bank Interest", "Current Account", "2024-07-01", "1234"), true);
  assert.equal(isInterestRelated("Interest earned", "Savings", "2024-07-01", "1234"), true);
  assert.equal(isInterestRelated("Monthly credit", "Current Account", "2024-07-01", "1234"), false);
  assert.equal(isInterestRelated("Transfer from savings", "Current Account", "2024-07-01", "1234"), false);
});
