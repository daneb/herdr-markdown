import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// A child process, because the Herdr-like runtime freezes prototypes and removes timers.
const run = (...fixtures) => {
  const r = spawnSync(process.execPath, ["--import", fileURLToPath(new URL("./support/herdr-like-runtime.js", import.meta.url)),
    fileURLToPath(new URL("./support/render-fixtures.mjs", import.meta.url)),
    ...fixtures.map(f => fileURLToPath(new URL(`../fixtures/${f}`, import.meta.url)))], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split("\n").map(l => JSON.parse(l));
};

test("every supported diagram in mermaid.md draws, flat and sized", () => {
  const out = run("mermaid.md");
  const drawn = out.filter(d => d.ok);
  for (const head of ["flowchart LR", "sequenceDiagram", "stateDiagram-v2", "classDiagram", "erDiagram", "xychart-beta", "flowchart TD"])
    assert.ok(drawn.some(d => d.head === head), `${head} drew`);
  for (const d of drawn) {
    assert.ok(d.width > 0 && d.height > 0, `${d.head} has a size`);
    assert.equal(d.vars, false, `${d.head} has no var() or color-mix() left`);
  }
});

test("an unsupported type throws a readable one-line error", () => {
  const gantt = run("mermaid.md").find(d => d.head === "gantt");
  assert.equal(gantt.ok, false);
  assert.match(gantt.error, /Invalid mermaid header/);
  assert.doesNotMatch(gantt.error, /\n/);
});

test("the 40-node architecture diagram draws", () => {
  const [d] = run("architecture.md");
  assert.equal(d.ok, true, d.error);
  assert.ok(d.width > 1000, "wide enough to need sideways scrolling in a panel");
});
