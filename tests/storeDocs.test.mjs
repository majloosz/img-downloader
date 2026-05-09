import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("privacy policy states local-only processing and no sale of data", async () => {
  const policy = await readFile(new URL("../PRIVACY.md", import.meta.url), "utf8");

  assert.match(policy, /does not collect/i);
  assert.match(policy, /does not sell/i);
  assert.match(policy, /processed locally/i);
});

test("store listing explains activeTab, scripting, and downloads permissions", async () => {
  const listing = await readFile(new URL("../STORE_LISTING.md", import.meta.url), "utf8");

  assert.match(listing, /activeTab/);
  assert.match(listing, /scripting/);
  assert.match(listing, /downloads/);
  assert.match(listing, /single purpose/i);
});
