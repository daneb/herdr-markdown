// Builds mods/files-md/mermaid.bundle.js: beautiful-mermaid and elkjs, patched to run
// in Herdr's mod runtime (QuickJS: no window, setTimeout throws, frozen prototypes).
// Usage: node scripts/build-mermaid.mjs [--out <file>]
//
// elkjs is EPL-2.0. The minified bundle is not its source, so the patched elkjs source is
// also written, unminified, to vendor/elkjs-<version>-patched/ with its licence (SPEC Q8).
//
// The elkjs patches come from jjongkwann/herdr-files-plus (MIT), build/build.mjs.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const at = process.argv.indexOf("--out");
const out = at > 0 ? process.argv[at + 1] : here("../mods/files-md/mermaid.bundle.js");

// Each patch must apply exactly once, so an elkjs update that moves the code fails the build.
const ELK_PATCHES = [
  // Built-in prototypes are frozen, so assigning toString on elkjs's base prototype throws.
  ["_.toString=function(){return this.Ib()}",
   'Object.defineProperty(_,"toString",{value:function(){return this.Ib()},writable:true,configurable:true})'],
  // No window, global or self: GWT's $wnd must still reach Math, Error and friends.
  ["    $wnd = self // web worker\n",
   "    $wnd = self // web worker\nif (!$wnd || !$wnd.Math) $wnd = globalThis;\n"],
  // setTimeout throws. GWT's entry watchdog only resets a depth counter that stays balanced
  // in synchronous layouts, so it is skipped (-1 also skips its clearTimeout).
  ["Hz=$wnd.setTimeout(Qz,10)", "Hz=-1"],
  // Uncaught errors were rethrown on a timer; layout errors still reach the caller as replies.
  ["$wnd.setTimeout(function(){throw a},0)", "void a"],
];

const herdrSafeElk = {
  name: "herdr-safe-elk",
  setup(b) {
    b.onLoad({ filter: /elkjs[\\/]lib[\\/]elk\.bundled\.js$/ }, (args) => {
      let src = readFileSync(args.path, "utf8");
      for (const [from, to] of ELK_PATCHES) {
        if (src.split(from).length !== 2) throw new Error(`elkjs changed; patch no longer applies: ${from.trim()}`);
        src = src.replace(from, to);
      }
      // elkjs's remaining setTimeout calls are its fake worker's zero-delay hops. Running them
      // at once, through a module-local binding, registers the layout algorithms in time.
      src = "var setTimeout = function (fn) { fn(); return 0; };\n" + src;
      const vendor = here(`../vendor/elkjs-${version("elkjs")}-patched`);
      mkdirSync(vendor, { recursive: true });
      writeFileSync(`${vendor}/elk.bundled.js`, src);
      copyFileSync(here("../node_modules/elkjs/LICENSE.md"), `${vendor}/LICENSE.md`);
      return { contents: src, loader: "js" };
    });
  },
};

const version = (name) => JSON.parse(readFileSync(here(`../node_modules/${name}/package.json`), "utf8")).version;
// Minifying drops elkjs's copyright headers, which EPL-2.0 (3.3) says must stay: keep them verbatim.
const elkNotices = [...new Set(readFileSync(here("../node_modules/elkjs/lib/elk.bundled.js"), "utf8")
  .match(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g).filter(c => /Copyright/.test(c)))];
if (!elkNotices.length) throw new Error("elkjs copyright notices not found");
await build({
  entryPoints: [here("./mermaid-entry.js")],
  outfile: out,
  bundle: true, plugins: [herdrSafeElk], format: "esm", platform: "neutral", target: "es2020",
  minify: true, legalComments: "eof",
  banner: { js: `// beautiful-mermaid ${version("beautiful-mermaid")} (MIT), elkjs ${version("elkjs")} (EPL-2.0, patched at build time: scripts/build-mermaid.mjs; source in vendor/), entities (BSD-2-Clause). See THIRD-PARTY-NOTICES.md. Built by scripts/build-mermaid.mjs; do not edit.\n${elkNotices.join("\n")}` },
});
console.log(`built ${out}`);
