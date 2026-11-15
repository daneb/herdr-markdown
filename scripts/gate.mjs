// The release gate: the automatable parts of the security and mod-rules review in
// docs/QUALITY.md, as checks. Exits 1 and lists every failure.
// Usage: node scripts/gate.mjs [--no-rebuild]
import { readFileSync, readdirSync, existsSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mod = join(root, "mods/files-md");
const read = (p) => readFileSync(join(root, p), "utf8");
const failures = [], passes = [];
const check = (name, problems) => (problems.length ? failures.push([name, problems]) : passes.push(name));

// Our own modules: everything in the mod but the bundle.
const ours = readdirSync(mod).filter((f) => f.endsWith(".js") && f !== "mermaid.bundle.js");
// Code without comments, so prose mentioning setTimeout or fetch does not count.
const code = Object.fromEntries(ours.map((f) => [f, readFileSync(join(mod, f), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1")]));
const where = (re, files = ours) => files.flatMap((f) =>
  code[f].split("\n").flatMap((line, i) => (re.test(line) ? [`${f}:${i + 1}: ${line.trim().slice(0, 120)}`] : [])));

// Syntax ("lint"): every module parses.
check("every module parses", ours.flatMap((f) => {
  try { execFileSync(process.execPath, ["--check", join(mod, f)], { stdio: "pipe" }); return []; }
  catch (e) { return [`${f}: ${String(e.stderr).split("\n").slice(0, 3).join(" ")}`]; }
}));

// Programs: only what the shipped Files panel runs (SPEC R11).
// A bare exec( is the herdr program runner; .exec( is a regular expression.
check("exec runs only sh, powershell and git", where(/(?<![.\w])exec\(/).filter((l) => !/(?<![.\w])exec\("(sh|powershell|git)"/.test(l)));

// No network, no other process or terminal access, no eval (SPEC R11).
check("no network, hc, eval or new Function", where(/\bfetch\(|XMLHttpRequest|WebSocket|from\s+"(net|websocket)"|\bhc\(|\beval\(|new Function\b/));

// Only main.js talks to the app.
check("only main.js imports herdr", where(/from\s+"herdr"/).filter((l) => !l.startsWith("main.js:")));

// Writes and deletes only in the cache (SPEC R10).
check("files are written or deleted only by cache.js", where(/\b(writeFile|unlink|rmdir|writeTextFile)\b/).filter((l) => !l.startsWith("cache.js:")));
check("cache.js deletes only names it makes", /const OURS = \/\^\[0-9a-z\]\+\\\.\(svg\|png\|jpeg\|gif\|webp\|bmp\)\$\//.test(code["cache.js"]) ? [] : ["cache.js: the OURS name pattern changed; review what load() and prune() may delete"]);

// The one dynamic import is the bundle.
check("the only dynamic import() is the bundle", where(/\bimport\(/).filter((l) => !/import\("\.\/mermaid\.bundle\.js"\)/.test(l)));

// Mod rules: no browser timers, no stored state outside the copy, no logging of content.
check("no setTimeout, setInterval, localStorage or console", where(/\b(setTimeout|setInterval|localStorage|console)\b/));
check("the only timer is the inherited 10-second refresh", (() => {
  const timers = where(/cx\.timer\./);
  return timers.length === 1 && /every\(10000/.test(timers[0]) ? [] : timers.length ? timers : ["no cx.timer.every(10000) found"];
})());

// The one app-wide key binding (QUALITY.md, mod rules).
check("bind_keys binds only cmd-c to input::Copy in TextView", (() => {
  const calls = where(/bind_keys\(/);
  const ok = calls.length === 1 && /bind_keys\(\[\{ keystroke: "cmd-c", action: "input::Copy", context: "TextView" \}\]\)/.test(calls[0]);
  return ok ? [] : calls.length ? calls : ["no bind_keys call found"];
})());

// Actions dispatched by hand: only the copy hand-off for Herdr 0.1.16's text view.
check("dispatch_action only passes copy on", where(/dispatch_action\(/).filter((l) => !/dispatch_action\("shell_root::Copy"\)/.test(l)));

// Opening addresses: only the link handler and the web-image note.
check("open_url only in main.js and pictures.js", where(/open_url\(/).filter((l) => !/^(main|pictures)\.js:/.test(l)));

// The bundle: nothing that reaches out or evaluates code; licence notices kept.
const bundle = readFileSync(join(mod, "mermaid.bundle.js"), "utf8");
check("bundle has no fetch, XMLHttpRequest, WebSocket, eval or dynamic import", ["fetch(", "XMLHttpRequest", "WebSocket", "eval(", "new Function", "import("].filter((s) => bundle.includes(s)).map((s) => `mermaid.bundle.js contains ${s}`));
check("bundle keeps elkjs's copyright notices", /Copyright \(c\) 2017 Kiel University/.test(bundle) && /Copyright \(c\) 2021 Kiel University/.test(bundle) ? [] : ["elkjs notices missing from the bundle banner"]);

// Licences and notices travel with the code.
check("licence and notice files present", [
  ["LICENSE", /Apache License\s+Version 2\.0/], ["NOTICE", /vendor\/elkjs-0\.11\.1-patched/],
  ["mods/files-md/THIRD-PARTY-NOTICES.md", /Eclipse Public License/], ["vendor/elkjs-0.11.1-patched/LICENSE.md", /Eclipse Public License/],
].flatMap(([p, re]) => (!existsSync(join(root, p)) ? [`${p} missing`] : re.test(read(p)) ? [] : [`${p} lacks ${re}`])));

// Build inputs pinned to exact versions.
check("build inputs pinned exactly", Object.entries(JSON.parse(read("package.json")).devDependencies ?? {})
  .filter(([, v]) => !/^\d+\.\d+\.\d+$/.test(v)).map(([k, v]) => `package.json: ${k} is "${v}", not an exact version`));

// The bundle and the patched elkjs source rebuild byte for byte from the pinned inputs.
if (!process.argv.includes("--no-rebuild")) {
  const out = join(mkdtempSync(join(tmpdir(), "files-md-gate-")), "mermaid.bundle.js");
  const before = read("vendor/elkjs-0.11.1-patched/elk.bundled.js");
  let problems = [];
  try {
    execFileSync(process.execPath, [join(root, "scripts/build-mermaid.mjs"), "--out", out], { stdio: "pipe" });
    if (readFileSync(out, "utf8") !== bundle) problems.push("mermaid.bundle.js differs from a fresh build: run npm run build:mermaid and commit");
    if (read("vendor/elkjs-0.11.1-patched/elk.bundled.js") !== before) problems.push("vendor/elkjs-0.11.1-patched/elk.bundled.js changed on rebuild: commit it");
  } catch (e) { problems = [`build failed: ${String(e.stderr).split("\n")[0]}`]; }
  check("bundle and patched elkjs rebuild byte for byte", problems);
}

// Report: the size of our change to the shipped panel, for the reviewer (not a gate).
const changed = (() => {
  try { execFileSync("git", ["diff", "--no-index", "--numstat", "upstream/files-0.1.15/main.js", "mods/files-md/main.js"], { cwd: root, stdio: "pipe" }); return "0"; }
  catch (e) { const [add, del] = String(e.stdout).trim().split(/\s+/); return `+${add} -${del}`; }
})();

for (const name of passes) console.log(`ok    ${name}`);
for (const [name, problems] of failures) { console.log(`FAIL  ${name}`); for (const p of problems) console.log(`        ${p}`); }
console.log(`\nmain.js against the shipped panel: ${changed} lines`);
console.log(failures.length ? `\n${failures.length} check(s) failed` : `\nall ${passes.length} checks passed`);
process.exit(failures.length ? 1 : 0);
