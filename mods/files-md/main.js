// A lazy file browser for the focused pane's folder, with bounded read-only previews.
// files-md: modified from Herdr's shipped `files` mod (app 0.1.15, Apache-2.0) to show
// Markdown formatted, in a mod pane. Original: upstream/files-0.1.15/main.js.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, appHome, props } from "herdr";
import * as fs from "fs/promises";
import { isMarkdown, frontMatterAsCode, chooseView, pickLocation, classifyLink, resolvePath, relativeTo } from "./lib.js";
import { createCache } from "./cache.js";
import { Pictures } from "./pictures.js";

// Drawn diagrams and copied images, relative to the app's home (image() reads only there).
const CACHE = "data/files-md";

const key = (where) => JSON.stringify({ cwd: where.cwd, on: where.on, space: where.space });
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map(); this.last = null; this.mode = "formatted"; this.history = [];
    // pane.split {mod: "files-md", props: {file}}: a file to open first, inside the folder (SPEC R0).
    const file = props()?.file;
    this.opening = typeof file === "string" ? file : null;
    // TextView selects text, but Herdr binds no copy key inside it. On 0.1.15 the text view answers
    // input::Copy; from 0.1.16 it answers shell_root::Copy, so render() passes an unhandled one on.
    cx.bind_keys([{ keystroke: "cmd-c", action: "input::Copy", context: "TextView" }]);
    this.pictures = new Pictures({ fs, cache: createCache({ fs, dir: `${appHome()}/${CACHE}` }), dir: CACHE });
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { const changed = await watchFolder(root); if (this.current(context)) this.refresh(cx, changed); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  // This panel is a mod pane: focusing it keeps the last terminal's folder (lib.js).
  location() {
    const where = pickLocation(spaces(), panes(), focused(), this.last);
    if (where.terminal) this.last = where;
    return where;
  }

  current(context) {
    return this.context === context && key(this.location()) === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx, changed) {
    const where = this.location(), { cwd, on } = where, next = key(where);
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
      else if (this.opening && cwd) {
        const r = resolvePath(this.opening, `${cwd}/.`, cwd), rel = r.path && relativeTo(r.path, cwd);
        this.opening = null;
        if (rel) this.show(rel, cx);
      }
    } else this.reread(cx, changed);
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  // history: the files a followed link came from, for the back arrow.
  show(path, cx, history = []) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    this.text = null; this.view = null; this.notice = null; this.markdown = null; this.parts = null;
    this.history = history; this.message = null; this.gone = false;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        this.text = text;
        this.present(cx);
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  // The open file's view: Markdown formatted unless the session chose Source (lib.js), else
  // the shipped read-only source editor. Diagrams and images make it a column of parts.
  present(cx) {
    this.code?.release(); this.code = null;
    const { view, notice } = chooseView(this.file, this.text, this.mode);
    this.view = view; this.notice = notice;
    this.markdown = view === "formatted" ? frontMatterAsCode(this.text) : null;
    this.parts = view === "formatted" ? this.pictures.split(this.markdown, { file: `${this.root}/${this.file}`, root: this.root, remote: Boolean(this.on) }) : null;
    if (this.parts) this.pictures.draw(this.parts, theme(), cx);
    if (view !== "source") return;
    const t = theme(), path = this.file, text = this.text, ext = path.includes(".") ? path.split(".").pop() : "txt";
    this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
      value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
      font_family: settings().font_family, font_size: 12,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
  }

  // The open Markdown file again after a change on disk (SPEC R9). Source is left alone, and
  // so is an unchanged file; a changed image is drawn again.
  reread(cx, changed) {
    if (!this.file || this.view === "source" || (this.text === null && !this.gone)) return;
    const path = this.file, context = this.context, root = this.root, on = this.on;
    const forgot = (changed ?? []).map(p => this.pictures.forget(p)).some(Boolean);
    cx.spawn(async cx => {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => undefined);
      if (this.file !== path || !this.current(context) || text === undefined) return;
      if (text === null) {
        this.code?.release(); this.code = null; this.text = null; this.view = null; this.parts = null;
        this.gone = true; this.fileError = "This file is no longer available";
      } else if (text !== this.text || forgot) {
        this.gone = false; this.fileError = null; this.text = text; this.present(cx);
      } else return;
      cx.notify();
    });
  }

  // A clicked link (SPEC R6–R8). Nothing a link names is read without classifyLink's checks.
  follow(url, cx) {
    const link = classifyLink(url, `${this.root}/${this.file}`, this.root);
    this.message = null;
    if (link.kind === "web") cx.open_url(link.url);
    else if (link.kind === "mailto") { cx.write_to_clipboard(link.address); this.message = `Copied ${link.address}`; }
    else if (link.kind === "anchor") this.message = "Links within a file are not followed";
    else if (link.kind === "outside") this.message = `Not followed: outside this folder (${link.target})`;
    else if (link.kind === "unsupported") this.message = `Not followed: ${link.target || "empty link"}`;
    else {
      const from = this.file, history = this.history, context = this.context, root = this.root, on = this.on;
      cx.spawn(async cx => {
        const text = await readTextFile(`${root}/${link.rel}`, { on }).catch(() => undefined);
        if (this.file !== from || !this.current(context)) return;
        if (typeof text === "string") this.show(link.rel, cx, [...history, from]);
        else this.message = text === null ? `Not found: ${link.rel}` : `Cannot open ${link.rel}`;
        cx.notify();
      });
    }
    cx.notify();
  }

  // Back: to the file a link came from, then to the tree.
  back(cx) {
    const history = this.history;
    if (history.length) this.show(history.at(-1), cx, history.slice(0, -1));
    else this.show(null);
    cx.notify();
  }

  setMode(mode, cx) {
    if (this.mode === mode) return;
    this.mode = mode;
    if (this.text !== null) this.present(cx);
    cx.notify();
  }

  // Formatted / Source, for Markdown files; the choice holds for the session.
  modeSwitch(t) {
    const option = (mode, label) => div().id(`files-md-${mode}`).px(8).h(22).flex().items_center().rounded(5).cursor_pointer()
      .text_size(11).text_color(this.mode === mode ? t.foreground : t.muted)
      .when(this.mode === mode, el => el.bg(t.selected))
      .when(this.mode !== mode, el => el.hover(s => s.bg(t.hover)))
      .on_click((_e, cx) => this.setMode(mode, cx))
      .child(label);
    return h_flex().id("files-md-mode").flex_none().p(2).gap(2).rounded(7).border_1().border_color(t.border)
      .child(option("formatted", "Formatted")).child(option("source", "Source"));
  }

  formatted() {
    return div().id("files-md-view").flex_1().min_h(0).px(16).py(12).text_size(13)
      .child(TextView.markdown(`files-md-${this.file}`, this.markdown).selectable(true).scrollable(true).size_full()
        .on_link_click((url, cx) => this.follow(url, cx)));
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .child(entry.dir ? svg(`mods/files-md/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/files-md/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (key(this.location()) !== this.context?.key) this.refresh(cx);
    const t = theme();
    if (this.parts && this.pictures.stale(t)) this.pictures.draw(this.parts, t, cx);
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .on_size_change((size, cx) => { if (Math.abs(size.width - (this.width ?? 0)) >= 1) { this.width = size.width; cx.notify(); } })
      // `window` here is herdr's; the global one is GPUI's, which dispatches actions.
      .on_action("input::Copy", () => globalThis.window.dispatch_action("shell_root::Copy"))
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => this.back(cx)).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? ""))
        .when(isMarkdown(this.file) && this.text !== null, el => el.child(this.modeSwitch(t))))
      .when(Boolean(this.file && (this.message || this.notice)), el => el.child(div().flex_none().px(14).py(6).border_b(1).border_color(t.border).text_size(12).text_color(t.dim).child(this.message || this.notice)))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0)
        // on_size_change reports zoomed pixels; element sizes are at zoom 1.
        : this.view === "formatted" ? (this.parts ? this.pictures.view(this.parts, this.file, this.width / (settings().zoom || 1), t, (url, cx) => this.follow(url, cx)) : this.formatted())
        : div().p(12).text_color(t.dim).child(this.fileError || (this.view === "empty" ? "Empty file" : "Loading file…"))));
  }
}
