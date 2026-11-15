# Contributing

Thanks for helping. This page is for people changing files-md; the
[README](README.md) is for people using it.

## Report a problem

[Open an issue](https://github.com/daneb/herdr-markdown/issues) with your
Herdr version (`herdr-app --version`), what you did, what you expected, and a
screenshot if it's visual. A Markdown file that shows the problem helps most.

## Set up

You need Node (any current release) and the Herdr app, on a Mac.

```sh
npm ci --ignore-scripts      # pinned build tools; no install scripts needed
npm test                     # 71 tests of the pure logic and the renderer
./scripts/install.sh         # copy the mod into Herdr and run herdr-app check
```

Edit under `mods/files-md/`, then run `./scripts/install.sh` again: Herdr
reloads the mod at once. Copy, don't symlink; Herdr doesn't reload through
links.

## Before you open a pull request

```sh
npm run ci                   # tests and the gate, exactly as GitHub runs them
```

The gate (`scripts/gate.mjs`) checks the mod's promises: it runs only `sh`,
`powershell` and `git`; no network or `eval`; only `cache.js` writes files;
one key binding and one timer; the Mermaid bundle rebuilds byte for byte. If
your change needs to break one of these, say why in the pull request.

CI can't run Herdr, so also check it in the app:

- `herdr-app check ~/.config/herdr-app/mods/files-md` passes;
- the fixtures you touched look right (`fixtures/` has one per feature);
- for anything visual, `./scripts/shots.sh <theme>` takes a screenshot of each
  fixture into `docs/shots/<theme>/`; look through them in a light and a dark
  theme.

The full checklist is [docs/QUALITY.md](docs/QUALITY.md).

## Changing the Mermaid renderer

`mods/files-md/mermaid.bundle.js` is built, not written. To change the
versions, edit `package.json` (exact versions only), then:

```sh
npm install --ignore-scripts
npm run build:mermaid        # also rewrites vendor/elkjs-*-patched/
```

Commit the bundle, the vendored elkjs source and the lockfile together.
elkjs is EPL-2.0: its patched source must ship with the bundle.

## After a Herdr update

Compare Herdr's shipped Files mod with `upstream/files-0.1.15/`, run the
checks above, and add a row to the regression record in
[docs/QUALITY.md](docs/QUALITY.md). Herdr 0.1.16, for example, changed how
copy works in text views.

## How it's built

| Document | What it answers |
|---|---|
| [docs/SPEC.md](docs/SPEC.md) | What it does, and what it doesn't |
| [docs/APPROACH.md](docs/APPROACH.md) | How it's built and why |
| [docs/QUALITY.md](docs/QUALITY.md) | How we know it works and is safe |
| [docs/renderer-matrix.md](docs/renderer-matrix.md) | What Herdr's renderers do, measured |
| [docs/PLAN.md](docs/PLAN.md) | How it was built, phase by phase |
| [docs/adr/](docs/adr/) | The two main design decisions |
| [RECIPE.md](RECIPE.md) | The brief another agent can rebuild it from |

```
mods/files-md/       the mod: main.js (Herdr's Files panel, changed), lib.js,
                     mermaid.js, pictures.js, cache.js, the bundle, notices
upstream/            Herdr's shipped Files mod, unchanged, to diff against
fixtures/            a Markdown file (and images) for each feature
tests/               node --test
scripts/             install.sh, gate.mjs, shots.sh, build-mermaid.mjs
vendor/              patched elkjs source (EPL-2.0), written by the build
docs/                spec, approach, quality, plan, decisions, screenshots
keys.json            the suggested key, for people who want one
```
