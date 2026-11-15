# ADR 0001: Clone the shipped Files mod and dock it as a standalone mod

Status: accepted, revised · 2026-11-15 · Phase 0 showed option 3 does not dock; option 6 (mod pane) chosen instead

## Context

We want Markdown shown formatted in the Herdr app's file browser. The shipped
`files` mod and the shipped `main` layout are both read-only: Herdr replaces
them on every start. The `main` layout's right-hand panel refers to the mod
`files` by name. On this machine the built-in Files and Changes panels are
currently switched off.

## Options

1. **Install the community Markdown panel.** Well engineered and tested, with
   block editing. But it is a separate window listing Markdown files only
   (no tree), and its handler installs `~/Applications/Kanso Markdown.app` and
   takes over `.md` files.
2. **Clone `files` and clone the `main` layout**, pointing the clone's panel
   at our mod. The tab bar's Files button then opens our panel. But a cloned
   layout never receives Herdr's layout updates, and a gallery mod may not
   ship a `layouts/` folder, so this cannot be shared as a mod.
3. **Clone `files` into a standalone mod** with `"place": "right"`, which
   Herdr docks into whatever layout is shown. Works with any layout and can be
   shared as a mod. Leaves the built-in Files panel off to avoid two trees.
4. **Write a new viewer from scratch.** Full control, but re-implements the
   lazy tree, limits, git marks and remote-machine handling that already
   work.
5. **Only propose the change upstream.** The right long-term home, but slow
   and uncertain, and gives us nothing to use meanwhile.

## Decision

Option 3 now, with option 5 following in Phase 5. Option 2 is the fallback if
Phase 0 shows docking does not work well.

## Phase 0 result (2026-11-15)

Option 3 does not work: a mod with `"place": "right"` is never docked into
the shipped `main` layout (no error, nothing recorded). Two ways remain:

- **Option 2, cloned layout:** the tab bar's Files button opens our panel.
  Narrow by default (368 px, up to 900). The clone never gets Herdr's layout
  updates, and the gallery entry becomes a layout, not a mod.
- **Option 6, mod pane:** `pane.split {direction: "right", mod: "files-md"}`
  puts the panel beside the terminal in any layout, shipped ones included,
  with a pane header, focus and resizing. Wide enough for diagrams. It is
  opened by a command or key rather than the Files button, and lives in its
  tab.

**Revised decision (Dane, 2026-11-15): option 6, a mod pane.** It stays a
plain gallery mod, works in every layout, and gives diagrams room. `mod.json`
says `"place": "none"`; a suggested key in the mod's `keys.json` opens it.
The tree follows the last focused *terminal*, not the pane itself, so
clicking the panel does not move it (SPEC R0, R1). See the
[renderer matrix](../renderer-matrix.md).

## Consequences

- Small, reviewable diff against the shipped mod; easy to offer upstream.
- We inherit the shipped mod's behaviour and limits, good and bad.
- We must re-check the clone when Herdr updates the shipped `files` mod.
- The tab bar's own Files button will not control our panel; a toggle needs
  either the docked block's id (Phase 0) or the fallback layout.
- No editing. Anyone who wants that installs the community panel alongside.
