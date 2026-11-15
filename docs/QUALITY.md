# Quality control

Status: draft · 2026-11-15

A change is done when it passes all four layers below. "It loads" is not done.

## 1. Automated: pure logic

`node --test tests/` covers `lib.js` with no app running.

| Function | Cases that must be covered |
|---|---|
| `isMarkdown` | `.md`, `.markdown`, upper case, no extension, dotfiles, `.md.bak` |
| `stripFrontMatter` | none, valid, unterminated, `---` used as a rule later in the file, Windows line endings |
| `classifyLink` | web, mailto, relative file, `./` and `../`, traversal above root, absolute path, anchor only, anchor on file, encoded spaces, Windows separators, empty |
| `splitDocument` | no diagrams; one of each supported type; backtick and tilde fences; indented fence in a list; `mermaid` fence inside a longer fence; unclosed fence; CRLF; diagram at start and end of file; more than 50 diagrams; images inline and alone on a line |
| `flattenSvg` | nested `var()`, `var()` with fallback, `color-mix()` with one and two percentages, `@import` removed, diagram text left untouched |
| `resolveImage` | relative, `./`, `../` inside root, traversal above root, absolute path, web URL, data URL, encoded spaces, query string, empty |
| `imageKind` | each supported format by its first bytes; wrong extension; unsupported format; empty file |
| Cache | same input gives the same name; theme change gives a new name; pruning removes oldest first and stops under the cap |
| Renderer | every diagram in `fixtures/mermaid.md` renders in Node under a Herdr-like runtime (no timers, no `window`, frozen prototypes); the unsupported and broken ones throw a readable error |

Rule: a bug found by hand gets a test before it gets a fix, where the fault is
in `lib.js`.

## 1b. Automated: the gate (CI)

`npm run gate` (scripts/gate.mjs) checks the automatable boxes of section 4:
programs run, no network or eval, who writes files, who imports `herdr`, the one
dynamic import, the one timer and key binding, the bundle's contents and
notices, exact version pins, and a byte-for-byte rebuild of the bundle and the
patched elkjs source. `.github/workflows/gate.yml` runs `npm audit`, the tests
and the gate on every push and pull request (Node 24, Linux; actions pinned to
commits; install scripts off). A red run blocks a release. A new check that a
review finds automatable goes into the gate, with a planted violation to prove
it fails.

## 2. Automated: the app's own check

`herdr-app check ~/.config/herdr-app/mods/files-md` after every change. It
loads the mod and renders it once. It does not run later async states, so it
proves the mod loads, not that it works. `herdr-app status` must show no mod
error afterwards.

## 3. Manual acceptance

Run against `fixtures/` in the app. Record pass or fail with the app version.

| Check | Covers |
|---|---|
| Tree lists the folder; folders expand; git marks show | R1 |
| A `.py` or `.json` file still opens as highlighted source | R1 |
| `basics.md`, `tables.md`, `code.md`, `tasks.md` open formatted | R2 |
| The switch shows Source and back; the choice holds for the next file | R3 |
| Select a paragraph and a table cell, copy, paste elsewhere | R4 |
| `long.md` opens without a stall; an over-limit file shows Source and the notice | R5 |
| `empty.md` and `not-utf8.md` show a clear state, not a blank panel | R5 |
| `mermaid.md`: each supported type draws; `gantt` and the broken one show source and a reason; the nested fence stays code | R13, R14 |
| `architecture.md` draws in about 2 seconds or less, scaled to the panel, readable | R13 |
| Narrow the panel to its minimum: diagrams and images shrink, never overflow | R13, R15 |
| `many-diagrams.md`: the first 50 draw, the rest say why; the panel stays responsive while drawing | R14 |
| `images.md`: each local format shows; the web, missing, outside-root, too-large, `.tiff` and fake-PNG images each say why | R15, R16 |
| Switch theme with a diagram open: it redraws in the new colours | R12 |
| Edit one diagram in the open file: only that one shows "Rendering…" again | R9 |
| `data/files-md/` stays under 100 MB after opening every fixture twice | R15 |
| Web links open the browser; mailto copies the address and says so | R6 |
| A relative Markdown link opens in the panel; back returns | R7 |
| The outside-root and broken links are refused with a message | R8 |
| Append a line to the open file from a terminal; the view updates | R9 |
| Same on a remote machine, within about 10 seconds | R9 |
| Light theme and dark theme both readable | R12 |
| Open the panel with the suggested key and with `pane.split`, in the shipped `main` layout and in `terminals`; close, zoom and resize it | R0 |
| Click inside the panel: the tree stays on the terminal's folder; focus another terminal in another folder: the tree follows | R1 |
| `architecture.md`: drawn at 60%, scrolls sideways, text readable | R13 |
| Switch layout and back; resize the panel to its minimum | robustness |
| Focus a pane in a folder with no git repo | robustness |

Each release keeps screenshots per theme in `docs/shots/<theme>/` (dark: 0.1.16;
light: 0.1.15), taken with
`scripts/shots.sh <theme>` on the Mac (CI cannot run Herdr). The script opens
each fixture in a zoomed `files-md` pane through `props.file`, so no clicks are
needed; Herdr must be the front window while it runs. Look through them before
tagging: a shot that shows the tree instead of its file is a failure.

## 4. Review

### Security and safety

Traced by Claude, 2026-11-15 (Phase 3): every `readTextFile` takes a path from
the tree, from `classifyLink` or from the link history; every image read takes
a path from `resolveImage`; `open_url` gets only http(s); `fs` writes and
deletes happen only in `cache.js`, on names it makes; only `main.js` imports
`herdr`; the bundle has no `fetch`, `XMLHttpRequest`, `eval` or dynamic
`import()`. Signed off by Dane, 2026-11-15. Bundle: 1,559,744 bytes;
`npm audit`: 0 vulnerabilities. The two accepted limits are recorded in SPEC R8
and R15. From now on CI checks the automatable boxes on every push (below).

Mods are trusted code with unrestricted commands and network access, so this
review is on us.

- [x] `grep -n "exec(" mods/files-md/*.js` lists only the folder listing
      (`sh`, `powershell`) and the two `git` calls inherited from the shipped mod.
- [x] No `fetch`, no `XMLHttpRequest`, no `hc` call, in our code or the bundle.
- [x] `fs` and `writeTextFile` are used only by the cache, and only on paths
      under `~/.config/herdr-app/data/files-md/`, built from a hash, never
      from a file or link name.
- [x] No path from a link or image reaches `readTextFile` or `fs.readFile`
      without passing `classifyLink` or `resolveImage`.
- [x] Nothing is read outside the focused root.
- [x] No file content is logged or stored in `localStorage` or shared state.
- [x] The only dynamic `import()` is `./mermaid.bundle.js`.
- [x] The bundle rebuilds byte-for-byte from the pinned lockfile; its size is
      recorded; `npm audit` on the build inputs is clean or each finding is
      explained.
- [x] SVG written to the cache has no `<script>`, `<foreignObject>` or
      external `href`.

### Diff against the shipped mod

- [x] `diff` of our `main.js` against the cloned original is read line by line.
- [x] Every changed line is needed by a requirement in SPEC.md.
- [x] The cloned-from app version is recorded.

### Mod rules

- [x] No `setTimeout` or `setInterval`; no stored `cx`; no top-level side effects.
- [x] Editor state is created in handlers or `init`, and released.
- [x] No timer used for animation; the only timer is the inherited 10-second refresh.
- [x] All colours from `theme()`.
- [x] The only action the mod dispatches by hand is `shell_root::Copy` (copy on
      Herdr 0.1.16 and later; see the renderer matrix).
- [x] The only key binding the mod installs is `cmd-c` → `input::Copy` in the
      `TextView` context. `bind_keys` is app-wide and outlives the mod, so
      nothing else may be bound that way.

## Definition of done, per phase

| Phase | Done means |
|---|---|
| 0 | Renderer matrix (text and Mermaid) and go/no-go written down |
| 1 | Layers 1 and 2 green; Phase 1 rows of layer 3 pass; diff review done |
| 2 | Layer 1 green including the renderer tests; R13–R16 rows of layer 3 pass in both themes; bundle and cache items of the security review ticked |
| 3 | All of layer 3 passes in both themes; security review fully ticked |
| 4 | Fresh install from the gallery line passes `check`; recipe states limits, diagram types and tested version; third-party notices shipped |
| 5 | Upstream issue open, with the contributing guide followed |

## Regression

After any Herdr app update: run `herdr-app check`, compare the shipped
`mods/files/main.js` against the version we cloned, and re-run layer 3 if
either changed.

### Regression record

| Date | App | Shipped `files` mod | Our APIs | `check` | Shots | Copy (`cmd-c`) |
|---|---|---|---|---|---|---|
| 2026-11-15 | 0.1.16 | identical to 0.1.15 | all present | pass | dark set retaken, unchanged | broke: the text view now answers `shell_root::Copy`, not `input::Copy`. Fixed by passing an unhandled `input::Copy` on; works on 0.1.16 (Dane) |

## Known limits of this process

- `herdr-app check` and the app itself run only on the Mac. Claude can run
  `check`, `status` and `shot` there, but not click inside the window, so
  the layer 3 checks that need clicks depend on Dane or an agent inside Herdr.
- Windows and Linux are not tested in v1.
- Diagram rendering is tested in Node, not in the app. How text, diagrams and
  images look in the app is shown only by the fixtures and screenshots.
