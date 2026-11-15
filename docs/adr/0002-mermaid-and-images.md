# ADR 0002: Draw Mermaid in-process with a bundled renderer; show images from a cache

Status: accepted · 2026-11-15 · Confirmed by Phase 0: the bundle draws all six types in Herdr; `TextView.markdown` drops images, so images go through the cache ([renderer matrix](../renderer-matrix.md))

## Context

Mermaid diagrams and images are now Must requirements (SPEC R13–R16). Three
facts about Herdr's mod runtime decide how:

- Mods run in QuickJS. There is no DOM, no `window`, and `setTimeout`
  throws, so Mermaid's own library (which measures text in a browser) cannot
  run.
- `TextView.markdown` draws text. Whether it draws images is Q6; the shipped
  mods never use it for images.
- `image(path)` draws PNG, JPEG, GIF, WebP and SVG, but only from paths inside
  `~/.config/herdr-app`. Prior art reports that it caches by path.

## Options for diagrams

1. **Bundle a DOM-free renderer.** beautiful-mermaid (MIT, by Craft) parses
   Mermaid and writes SVG strings, laying graphs out with elkjs (EPL-2.0).
   jjongkwann/herdr-files-plus (MIT) already runs it in Herdr: about 1.5 MB
   of bundled JavaScript, four small build-time patches to elkjs, and a pass
   that turns its CSS variables and `color-mix()` into plain colours the SVG
   loader understands. Six diagram types; offline; theme colours.
2. **Run `mmdc` (mermaid-cli).** Full Mermaid fidelity, but needs Node and a
   headless Chromium on every machine, is slow per diagram, and breaks R11.
3. **A rendering service** (mermaid.ink, Kroki). Small code, full fidelity,
   but sends the person's diagrams to a third party and breaks R11.
4. **Draw our own diagrams** with gpui elements. Full control; a large
   project for each diagram type.
5. **Leave diagrams as source.** Rejected: it is the problem.

## Options for images

1. **Copy into a cache under the app folder** and draw with `image()`.
   Local files are read with `fs.readFile` (allowed inside the home folder).
2. **Rely on `TextView.markdown`** if Q6 shows it draws images from the root.
3. **Remote machines** need the bytes over `exec` (`base64`), a new program.

## Decision

- Diagrams: option 1. Reuse jjongkwann/herdr-files-plus's MIT-licensed
  splitter, SVG flattener and elkjs build patches, with credit, rather than
  re-deriving them. Pin beautiful-mermaid and elkjs versions with a lockfile;
  commit the built bundle so installing needs no tools; load it only when a
  file has a diagram.
- Images: option 2 if Q6 allows it for local files inside the root; else
  option 1. Remote-machine images wait (SPEC L4).
- Cache: `~/.config/herdr-app/data/files-md/`, files named by a hash of
  their content (and, for diagrams, the theme colours and renderer version),
  capped at 100 MB, oldest removed first.

## Consequences

- The mod gains about 1.5 MB of third-party code. The security review
  (QUALITY.md) covers it: no `fetch`, no `XMLHttpRequest`, no dynamic
  `import()` of anything but the bundle, built from pinned sources.
- The mod now writes, but only into its own cache folder (SPEC R10).
- elkjs is EPL-2.0 and patched at build time. The build will also write the
  patched elkjs source, unminified, to `vendor/elkjs-0.11.1-patched/`, and
  `THIRD-PARTY-NOTICES` will carry the EPL-2.0 text and point to it (SPEC Q8).
  This gates publishing.
- Diagram fidelity is beautiful-mermaid's, not Mermaid's: six types, its
  look. Other types show their source (R14).
- A document with diagrams is no longer one `TextView`. It is a column of
  text parts, diagrams and images, so text selection stops at a picture
  (R4) and scroll position is ours to keep (R9).
- The upstream proposal (Phase 5) stays text-only: a 1.5 MB renderer is the
  maintainers' call, not something to put in a first patch.
