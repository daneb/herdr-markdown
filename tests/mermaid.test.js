import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { splitDocument, hasPictures, fenceFor, solid, colorsFor, flattenSvg, unsafeSvg, svgSize, hash, diagramName, LIMITS } from "../mods/files-md/mermaid.js";

const kinds = parts => parts.map(p => p.kind);

test("splitDocument: plain Markdown is one part", () => {
  const parts = splitDocument("# Title\n\nText\n");
  assert.deepEqual(parts, [{ kind: "markdown", text: "# Title\n\nText\n" }]);
  assert.equal(hasPictures(parts), false);
});

test("splitDocument: a diagram between text", () => {
  const parts = splitDocument("Before\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter");
  assert.deepEqual(parts, [
    { kind: "markdown", text: "Before\n" },
    { kind: "mermaid", source: "flowchart LR\n  A --> B" },
    { kind: "markdown", text: "\nAfter" },
  ]);
  assert.equal(hasPictures(parts), true);
});

test("splitDocument: diagrams at the start and end", () => {
  assert.deepEqual(kinds(splitDocument("```mermaid\ngraph TD\n```\ntext\n```mermaid\ngraph LR\n```")), ["mermaid", "markdown", "mermaid"]);
});

test("splitDocument: tilde fence, extra info words, any case", () => {
  assert.equal(splitDocument("~~~mermaid\ngraph TD\n~~~")[0].kind, "mermaid");
  assert.equal(splitDocument("```Mermaid title\ngraph TD\n```")[0].kind, "mermaid");
});

test("splitDocument: an indented fence in a list loses its indent", () => {
  const parts = splitDocument("1. Step:\n\n   ```mermaid\n   flowchart LR\n     A --> B\n   ```\n\n2. Next");
  assert.equal(parts[1].source, "flowchart LR\n  A --> B");
});

test("splitDocument: a mermaid fence inside a longer fence stays code", () => {
  const doc = "````markdown\n```mermaid\nflowchart LR\n```\n````";
  assert.deepEqual(splitDocument(doc), [{ kind: "markdown", text: doc }]);
});

test("splitDocument: an unclosed fence stays Markdown to the end", () => {
  const doc = "Text\n```mermaid\nflowchart LR\n  A --> B";
  assert.deepEqual(splitDocument(doc), [{ kind: "markdown", text: doc }]);
});

test("splitDocument: CRLF", () => {
  const parts = splitDocument("A\r\n```mermaid\r\ngraph TD\r\n  X --> Y\r\n```\r\nB\r\n");
  assert.equal(parts[1].source, "graph TD\n  X --> Y");
});

test("splitDocument: diagrams over the limits are kept, with a reason", () => {
  const doc = Array.from({ length: 3 }, (_, i) => `\`\`\`mermaid\ngraph TD\n  A${i}\n\`\`\``).join("\n");
  const parts = splitDocument(doc, { ...LIMITS, diagrams: 2 });
  assert.deepEqual(parts.map(p => p.skip), [undefined, undefined, "More than 2 diagrams in this file"]);
  const big = splitDocument("```mermaid\n" + "x".repeat(LIMITS.source + 1) + "\n```")[0];
  assert.equal(big.skip, "Diagram over 20,000 characters");
});

test("splitDocument: an image alone on a line", () => {
  assert.deepEqual(splitDocument("Text\n\n![A shot](img/a.png)\n\nMore"), [
    { kind: "markdown", text: "Text\n" },
    { kind: "image", src: "img/a.png", alt: "A shot" },
    { kind: "markdown", text: "\nMore" },
  ]);
});

test("splitDocument: an image inside a line splits it", () => {
  assert.deepEqual(splitDocument("- Web: ![badge](https://x.test/b.svg) after"), [
    { kind: "markdown", text: "- Web:" },
    { kind: "image", src: "https://x.test/b.svg", alt: "badge" },
    { kind: "markdown", text: "after" },
  ]);
});

test("splitDocument: titles, angle brackets, escaped brackets", () => {
  assert.deepEqual(splitDocument('![a](x.png "Title")')[0], { kind: "image", src: "x.png", alt: "a" });
  assert.deepEqual(splitDocument("![a](<my file.png>)")[0], { kind: "image", src: "my file.png", alt: "a" });
  assert.deepEqual(splitDocument("![a \\] b](x.png)")[0], { kind: "image", src: "x.png", alt: "a \\] b" });
});

test("splitDocument: image syntax in code stays text", () => {
  for (const doc of ["Use `![a](x.png)` to embed.", "```md\n![a](x.png)\n```"])
    assert.deepEqual(splitDocument(doc), [{ kind: "markdown", text: doc }]);
});

test("splitDocument: in a table row or by reference, an image becomes text", () => {
  assert.deepEqual(splitDocument("| a | ![logo](l.png) |"), [{ kind: "markdown", text: "| a | *[image: logo]* |" }]);
  assert.deepEqual(splitDocument("See ![chart][c].\n\n[c]: c.png"), [{ kind: "markdown", text: "See *[image: chart]*.\n\n[c]: c.png" }]);
});

test("splitDocument: images over the limit are kept, with a reason", () => {
  const parts = splitDocument("![a](1.png)\n![b](2.png)", { ...LIMITS, images: 1 });
  assert.deepEqual(parts.map(p => p.skip), [undefined, "More than 1 images in this file"]);
});

test("fenceFor: longer than any backtick run", () => {
  assert.equal(fenceFor("plain"), "```");
  assert.equal(fenceFor("has ``` inside"), "````");
});

test("solid: alpha laid over the background", () => {
  assert.equal(solid("#ffffff18", "#17191d"), "#2d2f32");
  assert.equal(solid("#123456", "#000000"), "#123456");
  assert.equal(solid("#fff", "#000"), "#ffffff");
  assert.equal(solid("red", "#000"), "red");
});

test("colorsFor: every colour is solid #rrggbb", () => {
  const c = colorsFor({ background: "#17191d", foreground: "#eeeeef", dim: "#696a6d", ansi4: "#96b2d7", muted: "#98999b", border: "#ffffff18" });
  for (const v of Object.values(c)) assert.match(v, /^#[0-9a-f]{6}$/);
  assert.equal(c.border, "#2d2f32");
});

test("flattenSvg: variables, fallbacks and color-mix become literal colours", () => {
  const svg = '<svg width="10" height="10" style="--bg:#000000;--fg:#ffffff"><style>@import url("https://fonts.test/x.css"); .a { fill: var(--fg); stroke: color-mix(in srgb, var(--fg) 50%, var(--bg)); color: var(--none, #ff0000); font-family: Inter } </style><text fill="var(--fg)">var(--fg) stays</text></svg>';
  const out = flattenSvg(svg, "Arial, sans-serif");
  assert.match(out, /fill: #ffffff/);
  assert.match(out, /stroke: #808080/);
  assert.match(out, /color: #ff0000/);
  assert.match(out, /font-family: Arial, sans-serif/);
  assert.match(out, /<text fill="#ffffff">var\(--fg\) stays<\/text>/);
  assert.doesNotMatch(out, /@import/);
});

test("unsafeSvg: refuses scripts, foreign HTML and anything fetched; allows #ids", () => {
  assert.equal(unsafeSvg('<svg><path marker-end="url(#a)"/><use href="#b"/></svg>'), null);
  assert.equal(unsafeSvg("<svg><script>x</script></svg>"), "script");
  assert.equal(unsafeSvg("<svg><foreignObject/></svg>"), "foreignObject");
  assert.equal(unsafeSvg('<svg><image href="https://x.test/a.png"/></svg>'), "external href");
  assert.equal(unsafeSvg('<svg><image xlink:href="/etc/a.png"/></svg>'), "external href");
  assert.equal(unsafeSvg('<svg><rect style="fill:url(https://x.test/p)"/></svg>'), "external url()");
  assert.equal(unsafeSvg("<svg><style>@import url(x.css);</style></svg>"), "@import");
});

test("svgSize: from the root element", () => {
  assert.deepEqual(svgSize('<svg xmlns="x" width="826.8" height="225.6"><rect width="5"/></svg>'), { width: 826.8, height: 225.6 });
  assert.deepEqual(svgSize("<svg></svg>"), { width: 0, height: 0 });
});

test("hash and diagramName: stable, and change with any input", () => {
  assert.equal(hash("abc"), hash("abc"));
  assert.equal(hash("abc"), hash(new Uint8Array([97, 98, 99])));
  assert.notEqual(hash("abc"), hash("abd"));
  const c = { bg: "#000000" };
  assert.equal(diagramName("graph TD", c), diagramName("graph TD", c));
  assert.notEqual(diagramName("graph TD", c), diagramName("graph LR", c));
  assert.notEqual(diagramName("graph TD", c), diagramName("graph TD", { bg: "#ffffff" }));
  assert.match(diagramName("graph TD", c), /^[0-9a-z]+\.svg$/);
});

test("splitDocument on the fixtures", () => {
  const read = f => readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8");
  const m = splitDocument(read("mermaid.md")).filter(p => p.kind === "mermaid");
  assert.equal(m.length, 10, "six types, gantt, broken, tilde, indented; not the nested or unclosed");
  assert.equal(splitDocument(read("many-diagrams.md")).filter(p => p.skip).length, 10);
  const imgs = splitDocument(read("images.md")).filter(p => p.kind === "image");
  assert.equal(imgs.length, 14);
});
