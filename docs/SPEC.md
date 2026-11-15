# Spec: files-md

Status: draft · 2026-11-15 · revised 2026-11-15: diagrams and images are now
Must · Target: Herdr app 0.1.15 or later, macOS first

## Problem

In the Herdr app's Files panel, clicking a Markdown file shows its source in a
read-only code view. Tables, headings and lists are hard to read that way, and
Markdown is what agents write most. Agents also explain systems with Mermaid
diagrams and screenshots: an architecture flowchart as source is a wall of
arrows, and an image as source is just a path.

## Goal

Click a Markdown file in the file tree and read it formatted, with its Mermaid
diagrams drawn and its images shown, in the same panel, without installing
anything outside the app's config folder.

## Users and main scenario

One person running coding agents in the Herdr app. An agent writes or updates
`PLAN.md` or `docs/ARCHITECTURE.md`, with a Mermaid flowchart of the system
and a screenshot; the person opens the Files panel, clicks the file, reads it
formatted with the diagram drawn, and sees it update as the agent keeps
writing.

## Requirements

### Must (v1)

| ID | Requirement |
|---|---|
| R1 | Everything the shipped Files panel does still works: lazy tree of the focused pane's folder, git status marks, source preview for non-Markdown files, the 500-per-folder and 5,000-total limits. Focusing the panel itself (or another mod pane) keeps the folder of the last focused terminal. |
| R0 | The panel is a mod pane: it opens beside the focused terminal (`pane.split {direction: "right", mod: "files-md"}`) in any layout, shipped ones included, and closes, zooms and resizes like any pane. `props: {file}` opens that file first (relative to the terminal's folder, or absolute; refused outside it). The mod ships a `keys.json` with one suggested key to open it, merged only with the person's consent. |
| R2 | A file ending `.md` or `.markdown` opens formatted by default. |
| R3 | A control in the panel header switches the open file between Formatted and Source. The choice is remembered for the session. |
| R4 | Text in the formatted view can be selected and copied with `cmd-c`. Diagrams and images are pictures, not text; selection need not cross them. (Herdr binds no copy key in text views; the mod binds one, scoped to them: see the renderer matrix.) |
| R5 | A file over 400,000 characters, or one the renderer fails on, falls back to Source with a one-line notice. The panel never shows a blank view. (The renderer is native: a failure inside it cannot be seen from the mod. The size limit and the Source switch are the protection.) |
| R6 | `http` and `https` links open in the system browser. `mailto` links copy the address and say so (the app opens only web addresses). |
| R7 | A relative link to another Markdown file inside the tree's root opens that file in the panel. Any `#anchor` is dropped. |
| R8 | A link that resolves outside the tree's root is not followed; the panel says so. (Paths are checked as written: a symlink inside the root that points outside it is followed, as the shipped tree follows it.) |
| R9 | While a file is open and has not been switched to Source, it re-reads when it changes on disk (local folders: folder watch; remote machines: the existing 10-second timer). Scroll position is kept where the renderer allows. Diagrams and images that did not change are not redrawn. |
| R10 | The mod never writes, renames or deletes a file of the person's. Its only writes are its own render cache (see R15). |
| R11 | It runs no program the shipped Files mod does not already run (`sh` to list a folder, `git` for status) and makes no network request. Diagrams are drawn by JavaScript bundled in the mod; web images are not fetched. |
| R12 | Colours and fonts come from `theme()` and `settings()`, so it follows light and dark themes. Diagrams use theme colours too and are redrawn when the theme changes. |
| R13 | A fenced `mermaid` block (backticks or tildes, indented or not) is drawn as a diagram where it stands. Supported: flowchart (`graph`, `flowchart`), sequence, state, class, ER and XY chart. Each is scaled down to the panel's width, never up, and never below 60%; a diagram still wider than the panel scrolls sideways inside its own box, so its text stays readable. Text shows first; each diagram shows "Rendering diagram…" until it is drawn. A `mermaid` fence inside another code fence stays code. |
| R14 | A diagram that cannot be drawn (unsupported type, a syntax error the renderer rejects, renderer failure, over the limits below) shows its source as a code block, with one line saying why. One bad diagram never hides the rest of the file. Limits: 50 diagrams per file, 20,000 characters per diagram. (Drawing is one synchronous call, so the limit is on size, not time; the renderer draws some broken syntax anyway.) |
| R15 | An image (`![alt](path)` or `![alt](<path with spaces>)`; by reference, or in a table row, it shows as "[image: alt]" text) whose path resolves to a file inside the tree's root, in a local folder, is shown where it stands, scaled down to the panel's width. Formats: PNG, JPEG, GIF, WebP, SVG, BMP; at most 10 MB each, 50 per file. It is copied into the mod's cache under `~/.config/herdr-app/data/files-md/` because the app draws images only from its own folder. The cache is named by content, capped at 100 MB, and the oldest files go first. |
| R16 | An image that is not shown says why, in place of the picture, with its alt text: a web image ("not loaded: web image", with the address as a link per R6), outside the root (R8), missing, too large, unsupported format, or on a remote machine. |

### Should (v1 if cheap, else v2)

| ID | Requirement |
|---|---|
| S1 | YAML front matter is shown as a fenced block, not as a broken heading. |
| S2 | `.mdx` opens formatted, with JSX left as text. |
| S3 | The last opened file and view mode per folder survive a layout switch. |
| S4 | A diagram's source can be copied (a small "Copy source" control on the diagram). |

### Later (not v1)

| ID | Idea |
|---|---|
| L1 | Done differently: the whole panel is now a mod pane (R0). Still later: open one file in its own pane (`props: {file}`). |
| L2 | File management: new file, rename, move, delete. Needs its own spec: confirmations, no silent overwrite, and an undo story. |
| L3 | Moved into R0: the key is shipped as a suggestion, merged only with consent, because editing `keys.json` stops Herdr updating that file's defaults. |
| L4 | Images on remote machines. Reading bytes there needs a program (`base64`) the shipped mod does not run, so it needs R11 revisited first. |
| L5 | Web images, as an opt-in per folder. Fetching them tells the image's host that the file was opened, and breaks R11. |
| L6 | Open a diagram or image large, in a pane or window, with zoom. |
| L7 | Mermaid diagram types the bundled renderer lacks (gantt, pie, mindmap, timeline, gitGraph, C4, `architecture-beta`). Depends on the renderer upstream. |

## Non-goals

- Editing Markdown or diagrams. The community Markdown panel edits Markdown well.
- Maths, raw HTML, and Mermaid types beyond R13's list. We document what the
  app's renderer does with them; we do not add renderers beyond Mermaid's.
- Running a browser engine, `mmdc`, or any rendering service to draw diagrams.
- Becoming the system's default app for `.md` files.
- Windows and Linux testing in v1. The code should not break there (it keeps
  the shipped mod's Windows paths), but we only verify macOS.

## Open questions (answered in Phase 0)

| # | Question | Why it matters |
|---|---|---|
| Q1 | What does `TextView.markdown` render: tables, task lists, code highlighting, images, nested lists, long lines? | Answered ([renderer matrix](renderer-matrix.md)): tables, tasks, nested lists, quotes and wrapped code are good; code has no syntax colours; front matter breaks; images are dropped. |
| Q2 | Does a mod with `"place": "right"` dock cleanly beside the shipped `main` layout's own hidden panel, and what node id does it get? | Answered: it does not dock at all. A mod pane (`pane.split {mod}`) works in the shipped layout; chosen (R0, ADR 0001). |
| Q3 | How does `TextView` behave on a 5,000-line file: scroll, memory, redraw cost? | Sets the fallback threshold in R5. Not yet measured: needs Herdr's window in front. |
| Q4 | Under what licence are the shipped mods, and may a modified copy be republished? | Answered: Apache-2.0 (repo root `LICENSE`, `defaults/mods/files`). Modified files must say they were changed. |
| Q5 | Do existing gallery mods already do this well? | Answered: no. See "Prior art" below. |
| Q6 | Does `TextView.markdown` draw images on its own, and from which folders? | Answered: no, it drops them, alt text included. `image()` draws only from the app folder, so R15's cache is required. |
| Q7 | In Herdr's runtime, how big is the bundled Mermaid renderer, how long does it take to load, and how long to draw a 40-node flowchart? Does a long draw freeze the window? | Answered: 1.56 MB; first diagram 218 ms including load; 40-node flowchart 304 ms; small ones about 10 ms. Each draw blocks the window while it runs. But a 40-node diagram scaled to panel width is unreadable. |
| Q8 | elkjs (the layout engine) is EPL-2.0 and needs small build-time patches to run here. What must we ship to comply (source of the patched file, notices)? | Gates Phase 4 (publish). Our reading of EPL-2.0 §3 (not legal advice): the minified bundle is not Source Code, so we must (1) make the patched elkjs source available, by committing it unminified with the build; (2) ship the EPL-2.0 text and a statement saying where that source is; (3) keep elkjs's notices (the build keeps legal comments). Our own files stay Apache-2.0: they are separate modules, not changes to elkjs. Dane to confirm before publishing. |
| Q9 | Does `image()` re-read a file whose content changed at the same path? | Decides cache names. Prior art says it caches by path, so R15 names files by content. |

## Prior art (reviewed 2026-11-15)

The gallery has several Files-panel clones that render Markdown. None matches
this spec; two show the way for diagrams and images.

| Mod | What it does | Why not use it |
|---|---|---|
| regally7011/herdr-files-markdown (Apache-2.0) | Shipped Files clone; Markdown via `TextView`, Source button, images copied into the app folder | Runs `wc` and `base64`; no link handling; needs a cloned layout; no diagrams |
| jjongkwann/herdr-files-plus (MIT) | Shipped Files clone; Markdown and HTML previews; Mermaid drawn in-process with beautiful-mermaid and elkjs, cached as SVG | Runs `open`/`xdg-open`; ships a cloned layout; no link handling. Its Mermaid approach is the one we follow (ADR 0002). |
| cmarin/herdr-better-files, werlang/herdr-file-editor, ondrapopik/herdr-files-plus, focus000/herdr-files-preview | Files clones with Markdown preview plus more (editing, file operations, Quick Look) | Larger scope, editing or file operations; not reviewed in depth |
| jgrecoarroyo/herdr-markdown, ryanthedev/herdr-md, Nikospy/herdr-preview, kissmikijr, ohneda | Markdown viewers in their own pane or panel, some with Mermaid | Not the file tree |

## Success

- Dane uses it daily in place of opening Markdown elsewhere.
- An architecture document with a Mermaid flowchart and a screenshot reads
  correctly in the panel, in light and dark themes.
- Every Must requirement passes its check in QUALITY.md.
- Published to the gallery with a recipe another agent can build from.
- An upstream issue exists proposing formatted Markdown in the shipped panel.
