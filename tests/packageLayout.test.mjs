import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("build artifacts are confined to a single dist directory", async () => {
  const [gitignore, packageScript] = await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../scripts/package-extension.mjs", import.meta.url), "utf8")
  ]);

  assert.match(gitignore, /^dist\/$/m);
  assert.match(packageScript, /join\(projectRoot,\s*"dist"\)/);
  assert.match(packageScript, /join\(outputDir,\s*"simple-image-downloader\.zip"\)/);
  assert.doesNotMatch(packageScript, /dist\/simple-image-downloader/);
});
