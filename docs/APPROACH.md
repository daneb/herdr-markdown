# Approach

Status: draft · 2026-11-15

## What we start from

Read on this machine, in `~/.config/herdr-app` (app 0.1.15):

- `mods/files/main.js` is the shipped Files panel: 179 lines. `show(path)`
  reads the file with `readTextFile`, then builds a read-only `EditorState`
  for it. `render()` shows either the tree or that editor.
- `gpui-base` has `TextView.markdown(id, text)`, with `.selectable()`,
  `.scrollable()` and `.on_link_click(handler)`.
- Shipped mods are replaced on every start. The supported way to change one
  is `herdr-app do mod.clone '{"name":"files","as":"files-md"}'`, then edit
  the clone.
- The shipped `main` layout is also read-only. Its right-hand panel names the
  mod `files` directly, and the tab bar's Files button drives that panel.

## The change, in one paragraph

Clone `files`. In `show()`, when the file is Markdown, keep the text and mark
the view as formatted instead of building an editor. In `render()`, draw
`TextView.markdown` in a scroll area when formatted, the existing editor
otherwise, and add a Formatted/Source switch to the header. Handle link
clicks. Re-read the open file when the folder watch fires. When the file has
Mermaid blocks or images, draw it as a column of parts instead of one
`TextView` (see "Diagrams and images"). Everything else in the clone is left
as shipped, so later upstream changes are easy to merge.

## Design rules

1. **Smallest diff from the shipped mod.** Every changed line should be
   explainable. This keeps the clone mergeable and makes the upstream pull
   request (Phase 5) a small patch, not a rewrite. Diagram and image code
   lives in its own files, not in `main.js`.
2. **Pure logic in `lib.js` and `mermaid.js`, no `herdr` imports.** Is this
   Markdown? Where does this link or image point? Is it inside the root? Split
   the document into text, diagrams and images. Strip front matter. Flatten an
   SVG. These are plain functions, tested with `node --test` and no app
   running.
3. **`main.js` is the only file that imports `herdr`.** It passes `fs`, the
   cache and the theme to the others. `pictures.js` builds elements with
   `gpui-kit`, but never calls the app.
4. **Fail to Source.** Any error on the formatted path shows the source view
   and a notice. A diagram or image that fails shows its source or alt text in
   place (SPEC R14, R16). Reading a file must never get worse than the
   shipped panel.
5. **No new powers but one.** No new `exec`, no `fetch`. The one new power is
   writing into the mod's own cache folder. See QUALITY.md.
6. **Follow the app's rules for mods:** no `setTimeout`, never keep a `cx`,
   create editor state in handlers or `init` and release it, no top-level
   side effects, `theme()` colours only.

## Placement

How the panel gets on screen is the one real design choice; see
[ADR 0001](adr/0001-clone-files-mod.md). Phase 0 showed a `"place": "right"`
mod never docks into the shipped layout, so the panel is a **mod pane**:
`pane.split {direction: "right", mod: "files-md"}` beside the terminal, in any
layout. `mod.json` says `"place": "none"`. The mod ships a `keys.json` with
one suggested key for that command, merged only with consent.

One change to the cloned code follows: the shipped `location()` reads the
focused pane's folder, and clicking our pane focuses it. So `location()`
skips mod panes and keeps the last focused terminal's folder (SPEC R1).

## Diagrams and images

See [ADR 0002](adr/0002-mermaid-and-images.md) for why. How:

1. **Split.** `splitDocument(text)` walks the lines once, following every code
   fence, and returns parts in order: `markdown`, `mermaid` (the fence body)
   and, where images must be drawn by us, `image` (path and alt text). A
   `mermaid` fence inside another fence stays code; an unclosed fence stays
   Markdown.
2. **Text first.** Each `markdown` part is a non-scrolling
   `TextView.markdown`; the column around them scrolls. Diagrams and images
   show a placeholder until ready.
3. **Diagrams.** On the first diagram, `import("./mermaid.bundle.js")`
   (beautiful-mermaid with patched elkjs, about 1.5 MB). Render with theme
   colours, flatten CSS variables and `color-mix()` to plain colours, write
   `data/files-md/<hash>.svg`, show it with `image()` at its natural size,
   scaled down to the column width. The hash covers renderer version, source,
   colours and font, so an unchanged diagram is never redrawn and a theme
   change gets new files. One diagram at a time, in a `cx.spawn` task; a
   newer file or theme cancels the rest.
4. **Images.** Resolve the path against the file's folder with the same
   checks as links (inside the root, local folder). Read with `fs.readFile`,
   check type and size, write `data/files-md/<hash>.<ext>`, show with
   `image()`. If Phase 0 shows `TextView.markdown` draws local images itself
   (Q6), skip the copy.
5. **Cache.** One folder, named by content, capped at 100 MB, least recently
   used first, pruned when first used and after writes. The runtime's `fs` has
   no `stat`, so `index.json` records each file's size and last use;
   `cache.js` deletes only names it makes (a hash and a known extension).
6. **Sizes.** `on_size_change` reports widths with the person's zoom applied,
   while element sizes are at zoom 1, so the panel's width is divided by
   `settings().zoom` before diagrams and images are scaled.
7. **Build.** `scripts/build-mermaid.mjs` bundles pinned versions with esbuild
   and applies the elkjs patches, each checked to apply exactly once.
   `npm test` renders every fixture diagram in Node under a Herdr-like runtime
   (no timers, no `window`, frozen prototypes). The bundle is committed.

## Development loop

1. Edit in this repo under `mods/files-md/`.
2. `scripts/install.sh` copies the folder to `~/.config/herdr-app/mods/files-md/`.
   Copy, do not symlink: another mod author reports Herdr follows links but
   does not hot-reload through them.
3. `herdr-app check ~/.config/herdr-app/mods/files-md` must pass.
4. Look at it in the app; `herdr-app shot` saves a screenshot for the record.
5. `herdr-app status` shows any error from a broken save.
6. Escape hatch if the window breaks: `ctrl-alt-shift-escape`.

## Who does what

| Step | Claude | Dane |
|---|---|---|
| Write mod code, tests, fixtures, docs | yes | reviews |
| Copy the mod into the app's config folder | yes (has folder access) | or runs `install.sh` |
| Run `herdr-app check`, `status`, `shot` | yes, when running on the Mac (not from a cloud session) | yes, or an agent inside Herdr |
| Build the Mermaid bundle, run `npm test` | yes, once Node works | reviews the lockfile |
| Judge how it looks and feels | no | yes |
| `git init`, commits, push, repo topic | prepares the files | yes, from his GitHub account |
| Open the upstream issue or pull request | drafts the text | sends it |

## Risks

| Risk | Effect | Handling |
|---|---|---|
| `TextView.markdown` is weak (no tables, slow on big files) | Formatted view disappoints | Phase 0 measures it; R5 fallback; document limits; stop if it is not better than source |
| Docking beside the shipped panel is awkward | Two trees, or no clean toggle | Fallback: cloned layout with the panel pointing at `files-md` |
| A gallery mod already does this | Wasted work | Phase 0 reviews prior art first |
| Shipped `files` changes in a later app version | Clone drifts | Small diff; re-clone and re-apply; note the cloned version |
| Mod API changes (app is at 0.1.x) | Breaks on update | `herdr-app check` after each app update; pin the tested version in the recipe |
| Licence of shipped mod code is unclear | Cannot publish a modified copy | Answered: Apache-2.0. Mark changed files as changed. |
| Mermaid bundle is slow to load or freezes the window on big diagrams | Panel stalls | Phase 0 measures (Q7); load lazily; R14 limits; draw one diagram per task |
| beautiful-mermaid draws fewer types, or differently, than Mermaid | Some diagrams show as source | Document the six types; R14 fallback; L7 tracks the rest |
| elkjs is EPL-2.0 and patched | Cannot publish without the right notices | Q8 before Phase 4; ship notices and the patch script |
| A renderer or elkjs update breaks the build patches | Cannot rebuild | Pin versions; patches fail loudly if they do not apply once |
| Node on this Mac is broken (`libllhttp` missing, 2026-11-15) | No tests or bundle build | Dane: `brew reinstall llhttp node` before Phase 1 |
