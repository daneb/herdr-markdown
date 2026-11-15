// files-md's pure logic: no herdr imports, so `node --test` covers it without the app.

// The shipped Files panel shows previews up to this many characters.
export const MAX_FORMATTED = 400000;

/** True for a Markdown file name: `.md`, `.markdown` or `.mdx`, any case, with a name before it. */
export function isMarkdown(path) {
  const name = String(path ?? "").split(/[\\/]/).pop();
  return /^.+\.(md|markdown|mdx)$/i.test(name) && !/^\.(md|markdown|mdx)$/i.test(name);
}

/**
 * Leading YAML front matter as a fenced `yaml` block, so the renderer does not read its closing
 * `---` as a heading underline. Only a block that starts on the first line and is closed by
 * `---` or `...` counts; anything else is returned unchanged.
 */
export function frontMatterAsCode(text) {
  const m = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return text;
  // A fence longer than any backtick run inside, so the block cannot end early.
  const longest = Math.max(2, ...(m[1].match(/`+/g) ?? []).map(run => run.length));
  const fence = "`".repeat(longest + 1);
  return `${fence}yaml\n${m[1]}\n${fence}\n\n${text.slice(m[0].length)}`;
}

/**
 * How to show a file the panel has read.
 * mode: the person's choice for the session, "formatted" or "source".
 * Returns { view: "formatted" | "source" | "empty", notice: string | null }.
 */
export function chooseView(path, text, mode) {
  if (!isMarkdown(path)) return { view: "source", notice: null };
  if (mode === "source") return { view: "source", notice: null };
  if (text.length > MAX_FORMATTED) return { view: "source", notice: "Over 400,000 characters · showing source" };
  if (!text.trim()) return { view: "empty", notice: null };
  return { view: "formatted", notice: null };
}

/**
 * Which folder the tree shows: the focused terminal's, as the shipped panel does. When the
 * focus is on a mod pane (this panel, once clicked), keep the last terminal's folder, so the
 * tree does not jump away; with none yet, the first terminal in the focused tab, else the
 * space's folder.
 * Returns { cwd, on, space, terminal } (terminal: whether a terminal decided it).
 */
export function pickLocation(spaces, panes, f, last) {
  const space = spaces.find(s => s.active);
  if (f?.pane === null) {
    // A layout terminal block: no model pane, its machine is in its address.
    const on = f.terminal?.includes("/") ? f.terminal.split("/")[0] : null;
    return { cwd: f.cwd || space?.folder, on, space: space?.id, terminal: true };
  }
  const pane = f?.pane ? panes.find(p => p.pane === f.pane) : null;
  if (pane?.terminal) return { cwd: pane.cwd || f.cwd || space?.folder, on: space?.machine ?? null, space: space?.id, terminal: true };
  if (last && last.space === space?.id) return last;
  const first = panes.find(p => p.tab === f?.tab && p.terminal && p.cwd);
  return { cwd: first?.cwd || space?.folder, on: space?.machine ?? null, space: space?.id, terminal: false };
}

// ---- Images ----

export const MAX_IMAGE = 10 * 1024 * 1024;

/** `/a/./b/../c` → `/a/c`. Forward slashes; null when `..` climbs above `/`. */
export function normalize(path) {
  const out = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") { if (!out.length) return null; out.pop(); } else out.push(part);
  }
  return "/" + out.join("/");
}

/**
 * A path written in a Markdown file, resolved: against the file's folder, or as an absolute path;
 * `%20`-style escapes decoded, `?query` and `#anchor` dropped. It must stay inside `root`.
 * Returns { path } or { error: "outside" | "bad" }.
 */
export function resolvePath(src, file, root) {
  let decoded;
  try { decoded = decodeURIComponent(src.replace(/[?#].*$/, "")); } catch { return { error: "bad" }; }
  const base = normalize(root);
  const dir = normalize(String(file).replace(/\\/g, "/").replace(/\/[^/]*$/, ""));
  const path = normalize(decoded.startsWith("/") ? decoded : `${dir}/${decoded}`);
  if (!base || !dir || !path || (path !== base && !path.startsWith(base === "/" ? "/" : base + "/"))) return { error: "outside" };
  return { path };
}

/** A path inside `root` (from resolvePath) as the tree names it: relative to the root. */
export function relativeTo(path, root) {
  const base = normalize(root);
  return path === base ? "" : path.slice(base === "/" ? 1 : base.length + 1);
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i, DRIVE = /^[a-z]:[\\/]/i;

/**
 * Where an image in a Markdown file points, and whether the panel may show it.
 * src: as written; file: the Markdown file's absolute path; root: the tree's root; remote: the
 * tree is on another machine.
 * Returns { ok: true, path } or { ok: false, reason, url? } (url: a web image's address).
 */
export function resolveImage(src, file, root, remote = false) {
  const s = String(src ?? "").trim();
  if (!s) return { ok: false, reason: "No image address" };
  if (/^https?:\/\//i.test(s)) return { ok: false, reason: "Web image · not loaded", url: s };
  if (/^data:/i.test(s)) return { ok: false, reason: "Embedded image · not shown" };
  if (SCHEME.test(s) && !DRIVE.test(s)) return { ok: false, reason: "Not a file address" };
  if (remote) return { ok: false, reason: "Image on another machine · not shown" };
  const r = resolvePath(s, file, root);
  if (r.error === "bad") return { ok: false, reason: "Bad image address" };
  if (r.error) return { ok: false, reason: "Outside this folder · not shown" };
  return { ok: true, path: r.path };
}

/**
 * What a clicked link in a Markdown file is, and where it goes.
 * url: as the renderer reports it; file: the Markdown file's absolute path; root: the tree's root.
 * Returns one of:
 *   { kind: "web", url }            http or https: the system browser
 *   { kind: "mailto", address }     copied, since the app opens only web addresses
 *   { kind: "anchor" }              a place in this file
 *   { kind: "markdown", path, rel } a Markdown file inside the root: opens in the panel
 *   { kind: "file", path, rel }     another file inside the root: opens in the panel
 *   { kind: "outside", target }     resolves outside the root: refused
 *   { kind: "unsupported", target } any other scheme, an empty or unreadable address
 */
export function classifyLink(url, file, root) {
  const s = String(url ?? "").trim();
  if (!s) return { kind: "unsupported", target: "" };
  if (/^https?:\/\//i.test(s)) return { kind: "web", url: s };
  if (/^mailto:/i.test(s)) {
    let address = s.slice(7).replace(/\?.*$/, "");
    try { address = decodeURIComponent(address); } catch { /* keep it as written */ }
    return address ? { kind: "mailto", address } : { kind: "unsupported", target: s };
  }
  if (s.startsWith("#")) return { kind: "anchor" };
  // A renderer may hand back a relative link resolved to a file URL.
  const local = /^file:\/\//i.test(s) ? s.slice(7).replace(/^localhost(?=\/)/i, "") : s;
  if (SCHEME.test(local) && !DRIVE.test(local)) return { kind: "unsupported", target: s };
  if (/^[?#]/.test(local)) return { kind: "anchor" };
  const r = resolvePath(local, file, root);
  if (r.error === "outside") return { kind: "outside", target: s };
  if (r.error) return { kind: "unsupported", target: s };
  const rel = relativeTo(r.path, root);
  if (!rel) return { kind: "unsupported", target: s };
  return { kind: isMarkdown(r.path) ? "markdown" : "file", path: r.path, rel };
}

const startsWith = (bytes, sig, at = 0) => sig.every((b, i) => bytes[at + i] === b);
const ascii = s => [...s].map(c => c.charCodeAt(0));

/** The image type from a file's first bytes ("png", "jpeg", "gif", "webp", "bmp", "svg"), or null. */
export function imageKind(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "gif";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  if (startsWith(bytes, ascii("BM")) && bytes.length > 26) return "bmp";
  // SVG: text whose first element is <svg>, after any BOM, XML declaration, comments or doctype.
  let head = "";
  for (let i = 0; i < Math.min(bytes.length, 2048); i++) head += String.fromCharCode(bytes[i]);
  head = head.replace(/^\xef\xbb\xbf/, "").replace(/^(\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*/i, "");
  return /^<svg[\s>]/i.test(head) ? "svg" : null;
}

/** An image's size in pixels from its header, or null. `kind` is imageKind's answer. */
export function imageSize(bytes, kind) {
  const n = bytes?.length ?? 0;
  const le16 = o => bytes[o] | (bytes[o + 1] << 8);
  const be16 = o => (bytes[o] << 8) | bytes[o + 1];
  const le32 = o => (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24));
  const be32 = o => ((bytes[o] << 24) >>> 0) + ((bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]);
  const ok = (width, height) => (width > 0 && height > 0 && Number.isFinite(width + height) ? { width, height } : null);
  if (kind === "png" && n >= 24) return ok(be32(16), be32(20));
  if (kind === "gif" && n >= 10) return ok(le16(6), le16(8));
  if (kind === "bmp" && n >= 26) return ok(le32(18), Math.abs(le32(22)));
  if (kind === "jpeg") {
    for (let i = 2; i + 9 < n;) {
      if (bytes[i] !== 0xff) { i++; continue; }
      const m = bytes[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(be16(i + 7), be16(i + 5));
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
      i += 2 + be16(i + 2);
    }
    return null;
  }
  if (kind === "webp" && n >= 30) {
    const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === "VP8 ") return ok(le16(26) & 0x3fff, le16(28) & 0x3fff);
    if (chunk === "VP8L") return ok(1 + (((bytes[22] & 0x3f) << 8) | bytes[21]), 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)));
    if (chunk === "VP8X") return ok(1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)));
    return null;
  }
  if (kind === "svg") {
    let head = "";
    for (let i = 0; i < Math.min(n, 4096); i++) head += String.fromCharCode(bytes[i]);
    const tag = /<svg\b[^>]*>/i.exec(head)?.[0] ?? "";
    const attr = name => /^([\d.]+)(px)?$/.exec(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([^"']*)["']`).exec(tag)?.[1]?.trim() ?? "")?.[1];
    const box = /\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(tag);
    const width = +(attr("width") ?? box?.[1] ?? 0), height = +(attr("height") ?? box?.[2] ?? 0);
    return ok(width, height);
  }
  return null;
}
