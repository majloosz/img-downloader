import test from "node:test";
import assert from "node:assert/strict";
import { UNSCANNABLE_PAGE_MESSAGE, isScannablePage } from "../src/pageGuard.js";
import {
  DEFAULT_MIN_SIZE_KB,
  MIN_SIZE_KB_MAX,
  MIN_SIZE_KB_MIN,
  clampMinimumSizeKb,
  parseMinimumSizeKb
} from "../src/sizeFilter.js";

test("allows only http(s) pages for scanning", () => {
  assert.equal(isScannablePage("https://example.com/a.jpg"), true);
  assert.equal(isScannablePage("http://localhost:8000/"), true);
  assert.equal(isScannablePage("brave://extensions/"), false);
  assert.equal(isScannablePage("chrome://extensions/"), false);
  assert.equal(isScannablePage("opera://settings/"), false);
  assert.equal(isScannablePage("vivaldi://about/"), false);
  assert.equal(isScannablePage("edge://settings/"), false);
  assert.equal(isScannablePage("about:blank"), false);
  assert.equal(isScannablePage("file:///tmp/a.jpg"), false);
  assert.equal(isScannablePage("view-source:https://example.com/"), false);
  assert.equal(isScannablePage("devtools://devtools/bundled/inspector.html"), false);
  assert.equal(isScannablePage("chrome-extension://abc/popup.html"), false);
  assert.equal(isScannablePage(""), false);
  assert.equal(isScannablePage(null), false);
  assert.equal(isScannablePage("not a url"), false);
  assert.match(UNSCANNABLE_PAGE_MESSAGE, /http/);
});

test("parses and clamps the minimum-size filter", () => {
  assert.equal(DEFAULT_MIN_SIZE_KB, 5);
  assert.equal(parseMinimumSizeKb("42", 5), 42);
  assert.equal(parseMinimumSizeKb("junk", 5), 5);
  assert.equal(clampMinimumSizeKb(42), 42);
  assert.equal(clampMinimumSizeKb(-10), MIN_SIZE_KB_MIN);
  assert.equal(clampMinimumSizeKb(99999), MIN_SIZE_KB_MAX);
  assert.equal(clampMinimumSizeKb("junk"), DEFAULT_MIN_SIZE_KB);
});
