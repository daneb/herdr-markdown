import { test } from "node:test";
import assert from "node:assert/strict";
import * as nodeFs from "node:fs/promises";
import { mkdtemp, readdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCache } from "../mods/files-md/cache.js";

// The runtime's fs: Node's, plus `exists`.
const fs = { ...nodeFs, exists: p => nodeFs.access(p).then(() => true, () => false) };
const tmp = () => mkdtemp(join(tmpdir(), "files-md-cache-"));

test("put, then get after a reload", async () => {
  const dir = await tmp(), c = createCache({ fs, dir, now: () => 1 });
  await c.load();
  await c.put("abc.svg", "<svg/>", { width: 10, height: 5 });
  const again = createCache({ fs, dir, now: () => 2 });
  await again.load();
  assert.deepEqual(await again.get("abc.svg"), { width: 10, height: 5, bytes: 6, used: 2 });
  assert.equal(await again.get("nope.svg"), null);
});

test("prunes the least recently used first, down to the cap", async () => {
  let t = 0;
  const dir = await tmp(), c = createCache({ fs, dir, cap: 10, now: () => ++t });
  await c.load();
  await c.put("a.svg", "1234");
  await c.put("b.svg", "1234");
  await c.get("a.svg");           // a is now newer than b
  await c.put("c.svg", "1234");   // 12 bytes > 10: b goes
  assert.deepEqual((await readdir(dir)).sort(), ["a.svg", "c.svg", "index.json"]);
  assert.equal(c.size(), 8);
});

test("load drops files the index does not list, and leaves other files alone", async () => {
  const dir = await tmp();
  await writeFile(join(dir, "stray.svg"), "x");
  await writeFile(join(dir, "notes.txt"), "keep");
  await writeFile(join(dir, "index.json"), JSON.stringify({ "gone.png": { bytes: 1, used: 1 }, "../evil": { bytes: 1, used: 1 } }));
  const c = createCache({ fs, dir });
  await c.load();
  assert.deepEqual((await readdir(dir)).sort(), ["index.json", "notes.txt"]);
  assert.deepEqual(JSON.parse(await readFile(join(dir, "index.json"), "utf8")), {});
});

test("a broken index starts empty", async () => {
  const dir = await tmp();
  await writeFile(join(dir, "index.json"), "{not json");
  const c = createCache({ fs, dir });
  await c.load();
  assert.equal(c.size(), 0);
});

test("refuses names it did not make", async () => {
  const dir = await tmp(), c = createCache({ fs, dir });
  await c.load();
  for (const name of ["../x.svg", "a/b.svg", "x.js", "X.SVG", ""]) await assert.rejects(c.put(name, "x"));
});
