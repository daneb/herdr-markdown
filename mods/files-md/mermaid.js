// files-md's diagrams and images: split a document into text, Mermaid and image parts, and turn a
// Mermaid block into an SVG the native image loader can draw. No herdr imports; `node --test` covers it.
//
// splitDocument's fence walk, flattenSvg and the 64-bit hash are adapted from
// jjongkwann/herdr-files-plus (MIT), mods/files-plus/mermaid.js. See THIRD-PARTY-NOTICES.

export const LIMITS = { diagrams: 50, source: 20000, images: 50 };

// The SVG loader finds real family names and generic sans-serif, but not system-ui.
export const FONT = "'Helvetica Neue', 'Segoe UI', Arial, 'Noto Sans', sans-serif";

// Bump when the SVG output changes: cache files are named by it.
export const RENDER_VERSION = 1;

// ![alt](src "title"): alt may hold escaped brackets; src may be <wrapped in angle brackets>.
const IMAGE = /!\[((?:[^\]\\]|\\.)*)\]\(\s*(<[^>\n]*>|[^\s)]+)(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^)\n]*\)))?\s*\)/g;
// ![alt][ref] and ![alt][]: the renderer drops these too, but there is no path to draw.
const IMAGE_REF = /!\[((?:[^\]\\]|\\.)*)\]\[[^\]\n]*\]/g;

/** Inline code spans blanked out (same length), so image syntax inside them is left alone. */
function maskCode(line) {
  return line.replace(/(`+)[^`]*?\1/g, m => " ".repeat(m.length));
}

const placeholder = alt => `*[image${alt ? `: ${alt}` : ""}]*`;

/**
 * Splits Markdown into parts, in order:
 *   { kind: "markdown", text }
 *   { kind: "mermaid", source, skip? }   skip: why it is not drawn (over a limit)
 *   { kind: "image", src, alt, skip? }
 * One pass over the lines, following every code fence: a `mermaid` fence inside another fence stays
 * code; a fence may be indented (in a list item; the indent is taken off the source); an unclosed
 * fence runs to the end and stays Markdown. Images alone or inside a line become their own part,
 * splitting the line; in a table row, or written by reference, they become "[image: alt]" text.
 */
export function splitDocument(markdown, limits = LIMITS) {
  const lines = markdown.split("\n"), parts = [];
  let text = [], diagrams = 0, images = 0;
  const flush = () => {
    const joined = text.join("\n");
    if (joined.trim()) parts.push({ kind: "markdown", text: joined });
    text = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    // A backtick fence's info string has no backticks; a tilde fence's may have anything.
    const open = /^([ \t]*)(?:(`{3,})([^`]*)|(~{3,})(.*))$/.exec(line);
    if (open) {
      const marks = open[2] ?? open[4], info = (open[3] ?? open[5]).trim();
      const fence = new RegExp(`^[ \\t]*${marks[0]}{${marks.length},}[ \\t]*\\r?$`);
      let close = i + 1;
      while (close < lines.length && !fence.test(lines[close])) close++;
      if (close === lines.length) { text.push(...lines.slice(i)); break; }
      if (info.split(/\s+/)[0].toLowerCase() === "mermaid") {
        flush();
        const indent = new RegExp(`^[ \\t]{0,${open[1].length}}`);
        const source = lines.slice(i + 1, close).map(l => l.replace(/\r$/, "").replace(indent, "")).join("\n");
        diagrams++;
        const skip = diagrams > limits.diagrams ? `More than ${limits.diagrams} diagrams in this file`
          : source.length > limits.source ? `Diagram over ${limits.source.toLocaleString("en-US")} characters` : undefined;
        parts.push(skip ? { kind: "mermaid", source, skip } : { kind: "mermaid", source });
      } else {
        text.push(...lines.slice(i, close + 1));
      }
      i = close;
      continue;
    }
    const masked = maskCode(line);
    const found = [...masked.matchAll(IMAGE)];
    const refs = IMAGE_REF.test(masked);
    IMAGE_REF.lastIndex = 0;
    if (!found.length && !refs) { text.push(lines[i]); continue; }
    if (/^\s*\|/.test(line) || !found.length) {
      // Table rows cannot be split; reference images have no path. Keep the text, say what was there.
      let out = "", at = 0;
      for (const m of [...masked.matchAll(IMAGE), ...masked.matchAll(IMAGE_REF)].sort((a, b) => a.index - b.index)) {
        if (m.index < at) continue;
        out += line.slice(at, m.index) + placeholder(line.slice(m.index, m.index + m[0].length).match(/^!\[((?:[^\]\\]|\\.)*)\]/)[1]);
        at = m.index + m[0].length;
      }
      text.push(out + line.slice(at));
      continue;
    }
    const refsToText = s => s.replace(IMAGE_REF, (_, alt) => placeholder(alt));
    let at = 0;
    for (const m of found) {
      const before = refsToText(line.slice(at, m.index));
      if (before.trim()) text.push(before.trimEnd());
      flush();
      const raw = line.slice(m.index, m.index + m[0].length);
      const [, alt, target] = new RegExp(IMAGE.source).exec(raw);
      const src = target.startsWith("<") ? target.slice(1, -1) : target;
      images++;
      parts.push(images > limits.images
        ? { kind: "image", src, alt, skip: `More than ${limits.images} images in this file` }
        : { kind: "image", src, alt });
      at = m.index + m[0].length;
    }
    const after = refsToText(line.slice(at));
    if (after.trim()) text.push(after.trimStart());
  }
  flush();
  return parts;
}

/** True when the parts need more than one text view. */
export const hasPictures = parts => parts.some(p => p.kind !== "markdown");

/** A code fence longer than any backtick run in `text`. */
export const fenceFor = text => "`".repeat(Math.max(2, ...(text.match(/`+/g) ?? []).map(r => r.length)) + 1);

// ---- Colours ----

function rgba(c) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(c ?? "").trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  return [0, 2, 4, 6].map(i => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
}
const toHex = rgb => "#" + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** A colour with alpha (`#ffffff18`) laid over `under`, as a solid `#rrggbb`. */
export function solid(color, under) {
  const c = rgba(color), u = rgba(under) ?? [0, 0, 0, 255];
  if (!c) return color;
  const a = c[3] / 255;
  return toHex([0, 1, 2].map(i => c[i] * a + u[i] * (1 - a)));
}

/** Herdr theme → diagram colours, all solid (the SVG loader and color-mix below need no alpha). */
export function colorsFor(t) {
  const bg = solid(t.background, "#000000");
  return { bg, fg: solid(t.foreground, bg), line: solid(t.dim, bg), accent: solid(t.ansi4, bg), muted: solid(t.muted, bg), border: solid(t.border, bg) };
}

// ---- CSS variables and color-mix() → literal colours (the SVG loader understands neither) ----

const hex = c => rgba(c)?.slice(0, 3) ?? null;

function args(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) { out.push(s.slice(start, i)); start = i + 1; }
  }
  out.push(s.slice(start));
  return out.map(a => a.trim());
}

function closing(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

function evaluate(expr, vars, depth = 0) {
  expr = expr.trim();
  const fn = /^(var|color-mix)\(/.exec(expr);
  if (!fn || depth > 16) return expr;
  const end = closing(expr, fn[0].length - 1);
  const [first, ...rest] = args(expr.slice(fn[0].length, end));
  if (fn[1] === "var") {
    if (vars.has(first)) return vars.get(first);
    return rest.length ? evaluate(rest.join(","), vars, depth + 1) : "currentColor";
  }
  // color-mix(in srgb, A p%, B [q%])
  const stop = s => { const m = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(s); return [evaluate(m[1], vars, depth + 1), m[2] === undefined ? null : +m[2]]; };
  const [[a, pa], [b, pb]] = rest.map(stop);
  const ca = hex(a ?? ""), cb = hex(b ?? "");
  if (!ca || !cb) return ca ? a : b;
  const p = pa ?? (pb === null ? 50 : 100 - pb);
  return toHex(ca.map((v, i) => (v * p + cb[i] * (100 - p)) / 100));
}

function resolve(css, vars) {
  let out = "", i = 0;
  for (;;) {
    const at = css.slice(i).search(/(var|color-mix)\(/);
    if (at < 0) return out + css.slice(i);
    const start = i + at, end = closing(css, css.indexOf("(", start));
    if (end < 0) return out + css.slice(i);
    out += css.slice(i, start) + evaluate(css.slice(start, end + 1), vars);
    i = end + 1;
  }
}

const STYLE = /<style>([\s\S]*?)<\/style>/g, ROOT = /^<svg\b[^>]*>/, ATTR = /(\s[\w:-]+=")([^"]*)(")/g;

/**
 * Rewrites the renderer's SVG so every colour is literal and no web font is imported. Only its
 * <style> blocks and attribute values change; diagram text is left alone.
 */
export function flattenSvg(svg, font = FONT) {
  font = font.split(",").map(f => f.trim()).map(f => /^[\w-]+$/.test(f) ? f : `'${f.replace(/['"]/g, "")}'`).join(", ");
  const vars = new Map();
  const declarations = [ROOT.exec(svg)?.[0] ?? "", ...[...svg.matchAll(STYLE)].map(m => m[1])].join("\n");
  for (const m of declarations.matchAll(/(--[\w-]+)\s*:\s*([^;}"]+)/g))
    if (!vars.has(m[1])) vars.set(m[1], evaluate(resolve(m[2].trim(), vars), vars));
  const css = text => resolve(text, vars)
    .replace(/@import\s+url\([^)]*\)[^;]*;/g, "")
    .replace(/\s*--[\w-]+\s*:\s*[^;}"]+;?/g, "")
    .replace(/font-family\s*:\s*[^;}"]+/g, `font-family: ${font}`);
  return svg
    .replace(STYLE, (_, body) => `<style>${css(body)}</style>`)
    .replace(/<[a-zA-Z][^>]*>/g, tag => tag.replace(ATTR, (_, pre, value, post) =>
      pre.trim().startsWith("font-family=") ? `${pre}${font.replaceAll('"', "'")}${post}` : pre + css(value) + post));
}

/** Why an SVG must not be cached and drawn, or null: scripts, foreign HTML, or anything fetched. */
export function unsafeSvg(svg) {
  if (/<script\b/i.test(svg)) return "script";
  if (/<foreignObject\b/i.test(svg)) return "foreignObject";
  if (/@import\b/i.test(svg)) return "@import";
  if (/\b(?:xlink:)?href\s*=\s*["'](?!#)/i.test(svg)) return "external href";
  if (/url\(\s*["']?(?!#)/i.test(svg)) return "external url()";
  return null;
}

/** The size an SVG declares on its root, or zeros. */
export function svgSize(svg) {
  const size = name => +(new RegExp(`<svg[^>]*\\s${name}="([\\d.]+)"`).exec(svg)?.[1] ?? 0);
  return { width: size("width"), height: size("height") };
}

// ---- Names ----

/** FNV-1a from two starting values: 64 bits, as base-36 text. Takes a string or bytes. */
export function hash(data) {
  let a = 2166136261, b = 0x9e3779b9;
  const n = data.length, isText = typeof data === "string";
  for (let i = 0; i < n; i++) {
    const c = isText ? data.charCodeAt(i) : data[i];
    a = Math.imul(a ^ c, 16777619);
    b = Math.imul(b ^ c, 16777619);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/** The cache name of a diagram: changes with its source, colours, font and the renderer version. */
export const diagramName = (source, colors, font = FONT) => `${hash(JSON.stringify([RENDER_VERSION, source, colors, font]))}.svg`;

// ---- Rendering ----

// The renderer is about 1.5 MB, so it loads on the first diagram, not with the mod. Shared by every
// copy of the mod: it is a library, not state.
let renderer = null;
const loadRenderer = async () => (renderer ??= (await import("./mermaid.bundle.js")).renderMermaidSVG);

/**
 * Draws one Mermaid source as a safe, self-contained SVG. Throws with the renderer's first line
 * when it cannot draw it.
 */
export async function renderDiagram(source, colors, font = FONT) {
  const render = await loadRenderer();
  let raw;
  try { raw = render(source, { ...colors, font, transparent: true }); }
  catch (e) { throw new Error(String(e?.message ?? e).split("\n")[0]); }
  const svg = flattenSvg(raw, font);
  const bad = unsafeSvg(svg);
  if (bad) throw new Error(`The drawn diagram was refused (${bad})`);
  const { width, height } = svgSize(svg);
  if (!width || !height) throw new Error("The drawn diagram has no size");
  return { svg, width, height };
}
