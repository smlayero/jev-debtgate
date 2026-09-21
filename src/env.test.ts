import assert from "node:assert/strict";
import test from "node:test";
import { isPlaceholderKey, maskKey } from "./env.js";

test("placeholder keys are rejected", () => {
  assert.equal(isPlaceholderKey(""), true);
  assert.equal(isPlaceholderKey("YOUR_TYPESAFE_API_KEY"), true);
  assert.equal(isPlaceholderKey("paste_your_key"), true);
  assert.equal(isPlaceholderKey("apikey_localdev_dummyvalue_for_tests"), false);
});

test("maskKey never prints the full secret", () => {
  const key = "apikey_localdev_dummyvalue_for_tests";
  const masked = maskKey(key);
  assert.equal(masked.includes("dummyvalue_for_tests"), false);
  assert.ok(masked.startsWith("apikey_"));
});
