# herdr-markdown

A mod for the Herdr desktop app: the Files panel, with Markdown shown formatted
instead of as source. Working name of the mod: `files-md`.

**Status:** Phases 1–3 built and checked in the app. Left before publishing: the full manual checklist in both themes, your security sign-off, a working session (Phase 1 gate), then Phase 4. Phase 0 done (see
docs/renderer-matrix.md). Drafted 2026-11-15.

## Try it

```sh
npm test                       # pure logic
./scripts/install.sh           # copy into ~/.config/herdr-app/mods/files-md and check it
herdr-app do pane.split '{"direction":"right","mod":"files-md"}'
```

To open it with a key, merge `keys.json` (`cmd-shift-m`) into
`~/.config/herdr-app/keys.json` yourself. Note that any edit to that file stops
Herdr updating its default keys.

## Why

The Herdr app ships a Files panel (a file tree with click-to-preview), but it
shows `.md` files as highlighted source. Agents write plans, notes and reviews
in Markdown, so the file you most often want to read is the one that reads
worst. The community "Markdown panel" mod is well built but is a separate
window listing Markdown files only, and it installs a macOS app to take over
`.md` files. We want the smaller thing: the tree we already have, with
readable Markdown: formatted text, Mermaid diagrams drawn, images shown.

## Documents

| Document | What it answers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | What we are building, and what we are not |
| [docs/APPROACH.md](docs/APPROACH.md) | How it is built and why that way |
| [docs/PLAN.md](docs/PLAN.md) | Phases, exit criteria, who does what |
| [docs/QUALITY.md](docs/QUALITY.md) | How we know it works and is safe to share |
| [docs/renderer-matrix.md](docs/renderer-matrix.md) | Phase 0: what the app's renderers do, measured |
| [docs/adr/0001-clone-files-mod.md](docs/adr/0001-clone-files-mod.md) | The main design decision |
| [docs/adr/0002-mermaid-and-images.md](docs/adr/0002-mermaid-and-images.md) | How diagrams and images are drawn |

## Repo layout

```
mods/files-md/     the mod (main.js, lib.js, mod.json, icons)   Phase 1
                   mermaid.js, mermaid.bundle.js                Phase 2
upstream/          the shipped files mod, unchanged, for diffs  Phase 1
keys.json          the suggested key, merged only by choice     Phase 1
fixtures/          Markdown files and images used for testing   Phase 0
tests/             node --test for the pure logic and renderer  Phase 1–2
scripts/           install.sh; build-mermaid.mjs                Phase 1–2
package.json       pinned build inputs for the Mermaid bundle   Phase 2
RECIPE.md          the gallery brief                            Phase 4
preview.png        the gallery screenshot                       Phase 4
vendor/            patched elkjs source (EPL-2.0), from the build Phase 2
LICENSE, NOTICE    Apache-2.0; credits                          Phase 2
mods/files-md/THIRD-PARTY-NOTICES.md  travels with the mod      Phase 2
```
