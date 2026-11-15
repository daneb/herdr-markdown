# Plan

Status: draft · 2026-11-15 · revised 2026-11-15: diagrams and images added as Phase 2

Six phases. Each ends with a gate: the exit criteria are met, or we stop and
decide again. Sizes are relative (S, M, L), not dates.

| Phase | Outcome | Size | Gate |
|---|---|---|---|
| 0 | Unknowns answered; go or no-go | S | Go/no-go decision recorded |
| 1 | Formatted Markdown in the panel, usable daily | M | Must R0–R5, R10–R12 pass |
| 2 | Mermaid diagrams and images drawn in place | L | Must R13–R16 pass |
| 3 | Links, live re-read, hardening | M | All Must requirements pass |
| 4 | Published to the gallery | S | Listed on herdr.dev/mods |
| 5 | Proposed upstream | S | Issue open; pull request if invited |

## Phase 0: Spike and gates

Purpose: answer the open questions in SPEC.md before writing the real mod.

Status 2026-11-15: done. Q3 is answered in practice (`long.md` renders and
scrolls; draw time not timed). The link check passed in Phase 3. Q8 has a
written reading (SPEC.md) for Dane to confirm before publishing. The spike is
removed.

1. **Prior art (Q5).** Done 2026-11-15: no existing mod meets the spec; see
   SPEC.md "Prior art". jjongkwann/herdr-files-plus shows Mermaid working in
   Herdr's runtime.
2. **Fixtures.** `fixtures/`: `basics.md`, `tables.md`, `code.md`,
   `tasks.md`, `links.md` (web, relative, anchor, outside-root, broken),
   `frontmatter.md`, `images.md`, `long.md` (5,000 lines), `huge.md` (over
   400,000 characters), `empty.md`, `not-utf8.md`, `crlf.md`, `UPPER.MD`,
   `component.mdx`, `sub/`. Done for text; to add: `mermaid.md` (one block of
   each supported type, an unsupported `gantt`, a syntax error, a `mermaid`
   fence inside a four-backtick fence, an indented fence in a list, a tilde
   fence, an unclosed fence), `architecture.md` (a 40-node flowchart with
   subgraphs, the main scenario), `many-diagrams.md` (60 small diagrams), and
   `img/` (PNG, JPEG, GIF, WebP, SVG, BMP, an 11 MB PNG, a `.tiff`, a file named
   `.png` that is not an image).
3. **Renderer matrix (Q1, Q3, Q6).** A throwaway mod that shows one fixture
   in `TextView.markdown`. Record, per fixture, what renders, what does not,
   whether images draw and from where, and how the long file scrolls. Save as
   `docs/renderer-matrix.md` with screenshots from `herdr-app shot`.
4. **Mermaid in the runtime (Q7, Q9).** Build the bundle (pinned
   beautiful-mermaid and elkjs, with the patches from herdr-files-plus) and
   load it in the throwaway mod. Record bundle size, first-load time, draw
   time for `architecture.md` and `many-diagrams.md`, whether the window
   stalls, and whether `image()` picks up a changed file at the same path.
   Add to `docs/renderer-matrix.md`.
5. **Docking (Q2).** Done: `"place": "right"` does not dock into the shipped
   layout; a mod pane works. Placement is a mod pane (ADR 0001).
6. **Licence (Q4, Q8).** Q4 done: Apache-2.0. Q8: read EPL-2.0's terms for
   distributing a modified elkjs in a bundle, and write what we must ship.
7. Remove the throwaway mod.

Exit: `docs/renderer-matrix.md` written; ADR 0001 and ADR 0002 confirmed or
revised; a go/no-go line added to this file. No-go if the renderer is not
clearly better than source for tables and lists, or if the Mermaid bundle
cannot draw `architecture.md` in under about 2 seconds without stalling the
window.

## Phase 1: Minimum useful mod

Status 2026-11-15: steps 1–5 built. `upstream/files-0.1.15/` holds the shipped
original (no git yet, so it stands in for the "unchanged" commit). Layer 1:
21 tests pass. Layer 2: `herdr-app check` passes, no errors in `status`.
Layer 3: Dane checked it in the app ("looks good"); copy failed and was
fixed with a `cmd-c` binding in `TextView` (renderer matrix), confirmed.
Still to do: a working session before the gate.

1. `herdr-app do mod.clone '{"name":"files","as":"files-md"}'`; copy the
   result into `mods/files-md/` here and commit it unchanged, so the next
   commit shows exactly what we changed.
2. `lib.js`: `isMarkdown(path)`, `stripFrontMatter(text)`; tests.
3. `main.js`: formatted view for Markdown; Formatted/Source switch in the
   header; selectable text; fallback to Source on size or error.
4. `mod.json` (`"place": "none"`) and `keys.json` with the suggested open
   key, per ADR 0001; `location()` keeps the last terminal's folder when the
   pane itself has focus (R0, R1).
5. `scripts/install.sh`.

Exit: R0–R5 and R10–R12 pass their checks; `herdr-app check` passes; Dane has
used it for a working session without going back to another viewer.

## Phase 2: Diagrams and images

Status 2026-11-15: steps 1–5 built. 63 tests pass (splitter, SVG flattening,
colours, cache, image paths and headers, and every fixture diagram drawn in a
Herdr-like runtime). `herdr-app check` passes. Drawn in the app through a
harness pane (renderer matrix, "Found while building Phase 2"). Dane checked
`mermaid.md`, `architecture.md` and `images.md` in the real panel, the wide
diagram's sideways scroll and the theme switch: "looks right". Gate passed.

1. `package.json` with pinned dev dependencies and a lockfile;
   `scripts/build-mermaid.mjs`; `mods/files-md/mermaid.bundle.js` committed.
2. `mermaid.js`: `splitDocument`, `flattenSvg`, `colorsFor`, the cache
   (`renderToFile`, `prune`); tests, including a Node render of every
   diagram in `fixtures/mermaid.md` under a Herdr-like runtime.
3. `lib.js`: `resolveImage(src, fileDir, root)` (shares the root checks with
   `classifyLink`), `imageKind(bytes, name)` (checks the file's first bytes,
   not just its name); tests.
4. `main.js`: draw a document with diagrams or images as a scrolling column
   of parts; placeholders; per-diagram and per-image fallbacks; redraw on
   theme change.
5. `NOTICE` and `THIRD-PARTY-NOTICES` for beautiful-mermaid, elkjs (with the
   patch script) and herdr-files-plus, per Q8.

Exit: R13–R16 pass their checks in both themes; `architecture.md` draws
correctly; the security review's diagram and cache items are ticked.

## Phase 3: Links, live re-read, hardening

Status 2026-11-15: steps 1–4 built. 71 tests pass; `herdr-app check` passes.
Dane clicked every link in `fixtures/links.md` and watched `fixtures/live.md`
update while a script wrote to it: "all as listed". S3 needed no code (a mod
pane keeps its file and mode across layout switches); S4 is "Copy source"
under each diagram. The Phase 0 spike and the Phase 2 harness are removed.
Still to do for the gate: step 5, the whole of QUALITY.md layer 3 in light and
dark, and Dane's sign-off of the security review.

1. `lib.js`: `classifyLink(url, fileDir, root)` returning web, mailto,
   markdown-in-root, other-in-root, outside-root or broken; tests including
   `..` traversal, absolute paths, encoded characters and Windows separators.
2. `main.js`: `on_link_click` per R6–R8; a back arrow that returns to the
   previous file, then the tree.
3. Re-read the open file on folder change (R9); on remote machines use the
   existing 10-second timer. Unchanged diagrams and images keep their cache
   files.
4. Should items S1–S4 where cheap.
5. Run the whole manual checklist in QUALITY.md, light and dark.

Exit: every Must requirement passes; the security review in QUALITY.md is
signed off; no open defect that loses or misreports file content.

## Phase 4: Package and publish

Status 2026-11-15: step 1 drafted (`RECIPE.md`, from the real files); step 3
done (`LICENSE`, `NOTICE`, `mods/files-md/THIRD-PARTY-NOTICES.md`); Dane ran
`git init` and the first commit. `preview.png` taken from `fixtures/showcase.md` in
the panel. To do: push and the `herdr-mod` topic; the fresh-install test. Gated on
Phase 3's remaining items (checklist in both themes, security sign-off) and Q8.

1. `RECIPE.md` in the order the app's guide requires: what you see, how it
   behaves, built from, watch out, done when. State the tested app version,
   the renderer's limits from the matrix, and the six diagram types.
2. `preview.png` from `herdr-app shot`, showing a diagram.
3. `LICENSE` and `NOTICE` crediting Herdr's `files` mod; third-party notices
   per Q8.
4. Dane: `git init`, push to a public GitHub repo, add the topic `herdr-mod`.
5. Fresh-install test: an agent in Herdr adds the mod from the gallery line on
   a config without it, and `check` passes.

Exit: the mod appears on herdr.dev/mods and installs cleanly from there.

## Phase 5: Upstream

1. Read `herdrdev/herdr-app`'s contributing guide first and follow it.
2. Open an issue: the problem, a screenshot, a link to the mod, and the size
   of the patch against the shipped `files` mod. Propose formatted text only;
   mention diagrams as a separate question (ADR 0002).
3. If the maintainers want it, prepare the patch against their source tree
   and open the pull request. If they decline, the gallery mod stands.

Exit: issue open and answered either way.

## After v1 (each needs its own short spec)

- L1: preview as a pane beside the terminal.
- L2: file management.
- L3: opt-in toggle key.
- L4–L7: remote images, opt-in web images, large view, more diagram types.

## Decisions log

| Date | Decision |
|---|---|
| 2026-11-15 | Build our own rather than install the community Markdown panel: good quality, wrong shape (see ADR 0001). |
| 2026-11-15 | Prior art reviewed: no gallery mod meets the spec (SPEC.md, "Prior art"). Go for Phase 0. |
| 2026-11-15 | Security review signed off (Dane). CI gate added: tests, audit, 16 checks, byte-for-byte rebuild, on every push; screenshots per theme with scripts/shots.sh. Repo public at github.com/daneb/herdr-markdown, no gallery topic yet. |
| 2026-11-15 | Phase 3 built; links and live re-read checked in the app by Dane. |
| 2026-11-15 | Phase 2 done: diagrams and images checked in the app by Dane. |
| 2026-11-15 | Placement: mod pane beside the terminal, not a docked panel or cloned layout (Dane; ADR 0001 revised). Wide diagrams: minimum 60% scale, then sideways scroll (Dane; SPEC R13). |
| 2026-11-15 | Phase 0 go: text rendering clearly better than source; Mermaid draws in Herdr (40 nodes in 304 ms). Open: placement (docking failed), wide diagrams, Q3. See docs/renderer-matrix.md. |
| 2026-11-15 | Mermaid diagrams and images promoted from non-goal to Must (Dane). Drawn in-process with a bundled renderer; images through a cache (ADR 0002). Web images are not fetched. |
