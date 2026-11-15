// Run under tests/support/herdr-like-runtime.js: draws every diagram in the given fixtures with the
// mod's own renderDiagram and prints one JSON line per diagram.
import { readFileSync } from "node:fs";
import { splitDocument, renderDiagram, colorsFor } from "../../mods/files-md/mermaid.js";

const colors = colorsFor({ background: "#17191d", foreground: "#eeeeef", dim: "#696a6d", ansi4: "#96b2d7", muted: "#98999b", border: "#ffffff18" });
for (const file of process.argv.slice(2)) {
  const parts = splitDocument(readFileSync(file, "utf8")).filter(p => p.kind === "mermaid" && !p.skip);
  for (const [i, p] of parts.entries()) {
    const head = p.source.trim().split("\n")[0].trim();
    try {
      const { svg, width, height } = await renderDiagram(p.source, colors);
      console.log(JSON.stringify({ file, i, head, ok: true, width, height, vars: /var\(|color-mix/.test(svg) }));
    } catch (e) { console.log(JSON.stringify({ file, i, head, ok: false, error: e.message })); }
  }
}
