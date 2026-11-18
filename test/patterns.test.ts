import assert from "node:assert/strict";
import test from "node:test";
import { compileNamePatterns } from "@src/patterns.js";

test("matches exact names and star wildcards, and ignores blank entries", () => {
  const match = compileNamePatterns([" vendor ", "", "cache*"]);
  assert.equal(match("vendor"), true);
  assert.equal(match("vendors"), false);
  assert.equal(match("cache"), true);
  assert.equal(match("cache-old"), true);
  assert.equal(match("mycache"), false);
});
