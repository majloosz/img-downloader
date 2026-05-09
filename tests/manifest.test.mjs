import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("manifest uses Chrome Web Store friendly least-privilege permissions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ["activeTab", "downloads", "scripting"].sort());
  assert.equal(Object.hasOwn(manifest, "host_permissions"), false);
  assert.equal(Object.hasOwn(manifest, "optional_host_permissions"), false);
  assert.match(manifest.description, /download/i);
});

test("manifest does not declare remote code or unsafe extension CSP", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));

  assert.equal(Object.hasOwn(manifest, "content_security_policy"), false);
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.action.default_popup, "src/popup.html");
});
