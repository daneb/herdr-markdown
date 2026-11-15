// files-md's diagrams and images in a formatted file: draws them one at a time into the cache and
// lays the file out as a column of text, diagrams and pictures. No herdr imports: main.js passes
// in fs, the cache and the theme.
import { div, image } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { splitDocument, hasPictures, fenceFor, colorsFor, diagramName, renderDiagram, unsafeSvg, hash } from "./mermaid.js";
import { resolveImage, imageKind, imageSize, MAX_IMAGE } from "./lib.js";

// Wide diagrams shrink to the panel, but not below this; past it they scroll sideways (SPEC R13).
export const MIN_SCALE = 0.6;
const FORMATS = "PNG, JPEG, GIF, WebP, SVG or BMP";

export class Pictures {
  /** fs: the runtime's fs/promises; cache: cache.js; dir: the cache folder relative to the app home. */
  constructor({ fs, cache, dir }) {
    this.fs = fs; this.cache = cache; this.dir = dir;
    this.drawn = new Map(); this.run = 0; this.colorsKey = null; this.ready = null;
  }

  /** The file's parts, with each image's target resolved; null when one text view will do. */
  split(markdown, { file, root, remote }) {
    const parts = splitDocument(markdown);
    if (!hasPictures(parts)) return null;
    for (const p of parts) if (p.kind === "image") p.target = resolveImage(p.src, file, root, remote);
    return parts;
  }

  /** Where a part's drawing is kept in `drawn`, or null for one that is never drawn. */
  id(part, colors) {
    if (part.skip) return null;
    if (part.kind === "mermaid") return diagramName(part.source, colors);
    if (part.kind === "image" && part.target.ok) return `image:${part.target.path}`;
    return null;
  }

  /** Forgets drawn images at or under a changed path, so the next draw reads them again. True if any. */
  forget(path) {
    let any = false;
    for (const id of [...this.drawn.keys()]) if (id === `image:${path}` || id.startsWith(`image:${path}/`)) { this.drawn.delete(id); any = true; }
    return any;
  }

  /** True when the theme changed since the last draw: diagrams need its colours. */
  stale(t) {
    return this.colorsKey !== JSON.stringify(colorsFor(t));
  }

  /** Draws what is not drawn yet, one part at a time, redrawing after each. A newer run stops this one. */
  draw(parts, t, cx) {
    const run = ++this.run, colors = colorsFor(t);
    this.colorsKey = JSON.stringify(colors);
    cx.spawn(async cx => {
      this.ready ??= this.cache.load().catch(() => {});
      await this.ready;
      for (const part of parts) {
        if (run !== this.run) return;
        const id = this.id(part, colors);
        if (!id || this.drawn.has(id)) continue;
        try { this.drawn.set(id, part.kind === "mermaid" ? await this.diagram(part.source, colors) : await this.picture(part.target.path)); }
        catch (e) { this.drawn.set(id, { error: String(e?.message ?? e).split("\n")[0] }); }
        if (run === this.run) cx.notify();
      }
      await this.cache.save().catch(() => {});
    });
  }

  async diagram(source, colors) {
    const name = diagramName(source, colors);
    const hit = await this.cache.get(name);
    if (hit) return { path: `${this.dir}/${name}`, width: hit.width, height: hit.height };
    const { svg, width, height } = await renderDiagram(source, colors);
    await this.cache.put(name, svg, { width, height });
    return { path: `${this.dir}/${name}`, width, height };
  }

  // image() draws only from the app's home, so the file is copied into the cache first.
  async picture(path) {
    if (!(await this.fs.exists(path).catch(() => false))) throw new Error("Not found");
    let bytes;
    try { bytes = await this.fs.readFile(path); } catch { throw new Error("Cannot read this image"); }
    if (bytes.length > MAX_IMAGE) throw new Error("Over 10 MB · not shown");
    const kind = imageKind(bytes);
    if (!kind) throw new Error(`Not a ${FORMATS} image`);
    if (kind === "svg") {
      let text = "";
      for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
      if (unsafeSvg(text)) throw new Error("SVG with scripts or outside links · not shown");
    }
    const name = `${hash(bytes)}.${kind}`;
    const size = imageSize(bytes, kind);
    if (!(await this.cache.get(name))) await this.cache.put(name, bytes, size ?? {});
    return { path: `${this.dir}/${name}`, width: size?.width, height: size?.height };
  }

  /** The formatted file as a scrolling column. width: the panel's width; onLink: a clicked link. */
  view(parts, file, width, t, onLink) {
    const avail = Math.max(120, (width ?? 400) - 32), colors = colorsFor(t);
    return v_flex().id("files-md-parts").flex_1().min_h(0).overflow_y_scrollbar().px(16).py(12).gap(10).text_size(13)
      .children(parts.map((part, i) => {
        if (part.kind === "markdown") return TextView.markdown(`files-md-${file}-${i}`, part.text).selectable(true).on_link_click(onLink);
        if (part.kind === "mermaid") {
          if (part.skip) return this.source(part, part.skip, i, t);
          const d = this.drawn.get(this.id(part, colors));
          if (!d) return this.box("Drawing diagram…", t);
          if (d.error) return this.source(part, `Diagram not drawn: ${d.error}`, i, t);
          return v_flex().gap(4).child(this.fit(d, avail, `files-md-wide-${i}`, MIN_SCALE)).child(this.copySource(part, i, t));
        }
        const alt = part.alt ? `“${part.alt}”` : "Image";
        if (!part.target.ok) return this.note(`${alt} · ${part.target.reason}`, part.target.url, i, t);
        if (part.skip) return this.note(`${alt} · ${part.skip}`, null, i, t);
        const d = this.drawn.get(this.id(part, colors));
        if (!d) return this.box("Loading image…", t);
        if (d.error) return this.note(`${alt} · ${d.error}`, null, i, t);
        return this.fit(d, avail, `files-md-wide-${i}`, 0);
      }));
  }

  // Shrinks to the panel, never grows; below `min` it keeps `min` and scrolls sideways.
  fit(d, avail, id, min) {
    if (!d.width || !d.height) return image(d.path).max_w(avail);
    const scale = Math.max(min, Math.min(1, avail / d.width));
    const picture = image(d.path).w(d.width * scale).h(d.height * scale).flex_none();
    return d.width * scale <= avail ? picture : h_flex().id(id).w(avail).overflow_x_scrollbar().child(picture);
  }

  // Copies a drawn diagram's source (SPEC S4).
  copySource(part, i, t) {
    return div().id(`files-md-copy-${i}`).self_end().cursor_pointer().text_size(11).text_color(t.dim).hover(s => s.text_color(t.foreground))
      .on_click((_e, cx) => { cx.write_to_clipboard(part.source); this.copied = part.source; cx.notify(); })
      .child(this.copied === part.source ? "Copied" : "Copy source");
  }

  box(text, t) {
    return div().p(10).rounded(6).border_1().border_color(t.border).text_size(12).text_color(t.dim).child(text);
  }

  source(part, reason, i, t) {
    const fence = fenceFor(part.source);
    return v_flex().gap(4)
      .child(div().text_size(12).text_color(t.dim).child(reason))
      .child(TextView.markdown(`files-md-src-${i}`, `${fence}mermaid\n${part.source}\n${fence}`).selectable(true));
  }

  note(text, url, i, t) {
    return v_flex().gap(2).p(10).rounded(6).border_1().border_color(t.border).text_size(12).text_color(t.dim)
      .child(text)
      .when(Boolean(url), el => el.child(div().id(`files-md-url-${i}`).cursor_pointer().truncate().text_color(t.ansi4)
        .on_click((_e, cx) => cx.open_url(url)).child(url)));
  }
}
