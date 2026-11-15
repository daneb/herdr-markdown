# Renderer matrix (Phase 0)

Measured 2026-11-15 on Herdr app 0.1.15, macOS, dark theme (graphite), zoom
1.1, with a throwaway spike mod opened as a mod pane
(`pane.split {direction: "right", mod}`), about 750 px wide. Screenshots are
in [shots/phase0/](shots/phase0/).

## Text: `TextView.markdown`, one view per file (Q1)

| Fixture | Result | Shot |
|---|---|---|
| `basics.md` | Good. Headings 1–4, bold, italic, inline code, nested bullets (3 levels), nested numbers (shown as A.), nested quotes, rule, hard break. | [basics](shots/phase0/basics.png) |
| `tables.md` | Good. Header row, left, centre and right alignment, inline code in cells, long cells wrap, a 10-column table fits. | [tables](shots/phase0/tables.png) |
| `code.md` | Good, but no syntax colours. Fenced blocks get a box and a language label; long lines wrap; indented blocks work. | [code](shots/phase0/code.png) |
| `tasks.md` | Good. Checkboxes, ticked items dimmed, nested tasks. | [tasks](shots/phase0/tasks.png) |
| `links.md` | Links drawn in the link colour. The URL a click reports is not yet known (needs a click). | [links](shots/phase0/links.png) |
| `frontmatter.md` | Broken. The closing `---` turns the YAML into a setext heading ("title: Front matter tags: [one, two]"). S1 is needed. | [frontmatter](shots/phase0/frontmatter.png) |
| `images.md` | Images are dropped entirely, alt text included. Nothing marks where they were. | [images](shots/phase0/images-in-textview.png) |
| `empty.md` | Blank. The panel must say "Empty file" itself (R5). | |
| `long.md` | Renders and scrolls to the last section (seen in a later frame). Time to draw not measured. | |
| `huge.md`, `not-utf8.md`, `crlf.md` | **Not measured yet.** See "Not answered" below. | |

Verdict: clearly better than source for tables, lists and tasks. Go.

Copying (found in Phase 1, 2026-11-15): text in a `selectable(true)` `TextView`
highlights, but `cmd-c` does nothing. Herdr binds `cmd-c` only for terminals,
and nothing binds the view's native copy action. The mod binds it itself in
`init`: `cx.bind_keys([{ keystroke: "cmd-c", action: "input::Copy", context:
"TextView" }])`. Confirmed working by Dane. `bind_keys` accepts any action
name without checking it, so only a real copy proves the binding.

On Herdr 0.1.16 copy broke again: a diagnostic showed `input::Copy` reaching
the panel unhandled. 0.1.16's text view answers a new `shell_root::Copy`
(what Edit › Copy dispatches). The panel now passes an unhandled
`input::Copy` on as `shell_root::Copy`, so one build copies on 0.1.15 and
0.1.16. Confirmed by Dane on 0.1.16.

## Mermaid: beautiful-mermaid 1.1.3 + elkjs 0.11.1, bundled (Q7)

Bundle: 1,558,824 bytes, built by `scripts/build-mermaid.mjs`. It contains no
`fetch`, `XMLHttpRequest`, `eval` or dynamic `import()`.

| Measure | Node (V8), Herdr-like runtime | In Herdr (QuickJS) |
|---|---|---|
| Load the bundle | 78 ms | included in the first diagram |
| First diagram (`flowchart LR`, 5 nodes) | 53 ms | 218 ms |
| Other diagrams in `mermaid.md` | 1–9 ms | 4–30 ms |
| `architecture.md` (40 nodes, 7 subgraphs) | 38 ms | 304 ms |
| `many-diagrams.md` (60 small) | 52 ms total | about 10 ms each |

| Case | Result |
|---|---|
| flowchart, sequence (with a note), state, class, ER, XY chart | All draw, in theme colours, through `image()` from `data/<mod>/<hash>.svg`. [shot](shots/phase0/mermaid.png) |
| `gantt` | Throws "Invalid mermaid header" → R14 fallback works. |
| Broken syntax (`A -->` / `--> B [[[`) | **Draws anyway** (a partial diagram). The renderer is lenient; R14 can only catch what throws. |
| `mermaid` fence inside a four-backtick fence | Stays code (splitter). |
| Tilde fence; indented fence in a list | Draw. |
| Unclosed fence | Stays Markdown. |
| `architecture.md` at panel width | **Unreadable.** 2178 × 890 px scaled into about 700 px: text is a few pixels high. [shot](shots/phase0/architecture.png) |

Every SVG carries an `@import` of a web font and uses CSS variables and
`color-mix()`, so the flattening pass (ADR 0002) is required, for R11 as well
as for drawing.

Drawing is one synchronous call. While it runs (up to about 300 ms for the
architecture diagram) the window does not redraw. A time limit cannot stop a
call already running, so R14's limit has to be on input size, not time.

## Images (Q6, Q9)

| Case | Result |
|---|---|
| `TextView.markdown` with `![alt](path)` | Dropped (see above). We draw images ourselves. |
| `image()` from `data/<mod>/` | PNG, JPEG, GIF, SVG and **BMP** draw. WebP not confirmed (the fixture is 1×1 px; needs a real WebP). [shot](shots/phase0/image-formats.png) |
| `image()` with an absolute path outside the app folder | Draws nothing. The cache is required. |
| `fs.readFile` of a file in the home folder, outside the app folder | Allowed. |
| `fs.writeFile` outside `~/.config/herdr-app` | Refused. The sandbox matches the app's docs. |
| Q9: does `image()` re-read a changed file at the same path? | Not tested; content-named cache files make it moot. |

## Placement (Q2)

| Way | Result |
|---|---|
| Standalone mod with `"place": "right"` | **Does not dock** into the shipped `main` layout. The app never recorded it (`seen.json`, layout state) and showed nothing, with no error. |
| Mod pane: `pane.split {direction: "right", mod: "files-md-spike"}` | Works in the shipped layout, with Herdr's pane header, focus border and resizing. Wide enough for diagrams. |
| Cloned layout pointing the right panel at the mod | Not tried; prior art (regally7011, jjongkwann) uses it. |

## Spike mechanics, for the record

- (Fixed in 0.1.16, where `shot` gives the current frame.) On 0.1.15, `herdr-app shot` returned the last frame drawn. While Herdr's window is
  covered by another app, `render()` is not called at all, so shots go stale
  and timings that depend on drawing cannot be taken. The spike's data path
  kept running (checked with a log file).
- The spike read its fixture name from a control file on a 1-second timer,
  so no clicks were needed. Throwaway only.

## Found while building Phase 2

| Finding | Effect | Handling |
|---|---|---|
| `on_size_change` reports widths with the zoom applied (1.1 here); `.w()` takes sizes at zoom 1 | Diagrams drawn 10% too wide, their right edge cut off | Divide the width by `settings().zoom` |
| `theme()` colours may carry alpha (`border` is `#ffffff18`) | Diagram borders would be drawn white | `solid()` lays each colour over the background first |
| The runtime's `fs/promises` has no `stat` | No sizes or ages for pruning; an image is read before its size is known | `index.json` in the cache; images over 10 MB are read, then refused |
| Minifying drops elkjs's copyright headers | EPL-2.0 3.3 | The build copies them into the bundle's banner |
| Second open of `mermaid.md` | 10 diagrams from the cache in about 150 ms (first: 342 ms) | |
| A user's SVG with `url(#id)` markers | Allowed; external `href`, `url()`, scripts and `foreignObject` are refused | `unsafeSvg` |

Checked in the app through a temporary harness pane (since removed) that ran
the mod's own `pictures.js`: every fixture diagram, the fallbacks, the 40-node
diagram at 60% with sideways overflow, and every image case in `images.md`.

## Links (Phase 3)

`on_link_click` replaces the view's own link opening. Every link in
`fixtures/links.md` behaved as specified when Dane clicked it: web links opened
the browser, `mailto` copied the address, relative, `./`, subfolder, anchored
and `%20` links opened in the panel, outside-root and absolute links were
refused, the missing file said "Not found". `classifyLink` also accepts a
`file://` form in case a later renderer resolves links that way.

## Not answered yet

| Question | Why not | How |
|---|---|---|
| Q3: `long.md` (5,000 lines) and `huge.md` (412,000 chars) in one `TextView`: time to draw, scrolling, memory | Herdr's window was covered, so nothing was drawn | With Herdr in front, open each in the spike and watch the header |
| `not-utf8.md`, `crlf.md` | Same | Same |
| WebP | Fixture too small to see | Add a real WebP to `fixtures/img/` |
