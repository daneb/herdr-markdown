import { test } from "node:test";
import assert from "node:assert/strict";
import { isMarkdown, frontMatterAsCode, chooseView, pickLocation, MAX_FORMATTED } from "../mods/files-md/lib.js";

test("isMarkdown: Markdown extensions, any case", () => {
  for (const p of ["a.md", "docs/PLAN.md", "x.markdown", "UPPER.MD", "Mixed.Markdown", "c.mdx", "dir.v2/readme.md", "C:\\docs\\a.md"])
    assert.equal(isMarkdown(p), true, p);
});

test("isMarkdown: everything else", () => {
  for (const p of ["", null, undefined, "README", "a.md.bak", "a.mdown", "notes.txt", ".md", "dir/.markdown", "md", "a.md/", "docs.md/file.txt"])
    assert.equal(isMarkdown(p), false, String(p));
});

test("frontMatterAsCode: no front matter is unchanged", () => {
  for (const t of ["", "# Title\n", "Text\n---\nmore", " ---\na: 1\n---\n"]) assert.equal(frontMatterAsCode(t), t);
});

test("frontMatterAsCode: a closed block becomes a yaml fence", () => {
  assert.equal(frontMatterAsCode("---\ntitle: X\ntags: [a]\n---\n# Body\n"), "```yaml\ntitle: X\ntags: [a]\n```\n\n# Body\n");
});

test("frontMatterAsCode: closed by ... too, and at the end of the file", () => {
  assert.equal(frontMatterAsCode("---\na: 1\n..."), "```yaml\na: 1\n```\n\n");
});

test("frontMatterAsCode: unterminated is unchanged", () => {
  const t = "---\ntitle: X\n# Body\n";
  assert.equal(frontMatterAsCode(t), t);
});

test("frontMatterAsCode: a later rule stays a rule", () => {
  const out = frontMatterAsCode("---\na: 1\n---\n\nText\n\n---\n\nEnd\n");
  assert.equal(out, "```yaml\na: 1\n```\n\n\nText\n\n---\n\nEnd\n");
});

test("frontMatterAsCode: Windows line endings and a byte-order mark", () => {
  assert.equal(frontMatterAsCode("\uFEFF---\r\na: 1\r\n---\r\nBody"), "```yaml\na: 1\n```\n\nBody");
});

test("frontMatterAsCode: backticks inside get a longer fence", () => {
  assert.equal(frontMatterAsCode("---\ncmd: ```x```\n---\n"), "````yaml\ncmd: ```x```\n````\n\n");
});

test("chooseView: Markdown is formatted by default", () => {
  assert.deepEqual(chooseView("a.md", "# Hi", "formatted"), { view: "formatted", notice: null });
});

test("chooseView: the session's Source choice wins", () => {
  assert.deepEqual(chooseView("a.md", "# Hi", "source"), { view: "source", notice: null });
});

test("chooseView: other files are always source", () => {
  assert.deepEqual(chooseView("a.json", "{}", "formatted"), { view: "source", notice: null });
});

test("chooseView: over the limit falls back to source with a notice", () => {
  assert.equal(chooseView("a.md", "x".repeat(MAX_FORMATTED), "formatted").view, "formatted");
  assert.deepEqual(chooseView("a.md", "x".repeat(MAX_FORMATTED + 1), "formatted"), { view: "source", notice: "Over 400,000 characters · showing source" });
});

test("chooseView: an empty file says so", () => {
  assert.deepEqual(chooseView("a.md", "", "formatted"), { view: "empty", notice: null });
  assert.deepEqual(chooseView("a.md", " \n\n", "formatted"), { view: "empty", notice: null });
  assert.deepEqual(chooseView("a.md", "", "source"), { view: "source", notice: null });
});

const spaces = [{ id: "s1", active: true, folder: "/home/me", machine: null }, { id: "s2", active: false, folder: "/other", machine: null }];
const panes = [
  { pane: "p1", tab: "t1", terminal: "t1a", cwd: "/repo" },
  { pane: "p2", tab: "t1", terminal: null, mod: "files-md", cwd: null },
  { pane: "p3", tab: "t1", terminal: "t1b", cwd: "/repo/docs" },
];

test("pickLocation: a focused terminal pane decides, as in the shipped panel", () => {
  assert.deepEqual(pickLocation(spaces, panes, { tab: "t1", pane: "p3", terminal: "t1b", cwd: "/repo/docs" }, null),
    { cwd: "/repo/docs", on: null, space: "s1", terminal: true });
});

test("pickLocation: focusing the panel keeps the last terminal's folder", () => {
  const last = { cwd: "/repo/docs", on: null, space: "s1", terminal: true };
  assert.equal(pickLocation(spaces, panes, { tab: "t1", pane: "p2", terminal: null, cwd: null }, last), last);
});

test("pickLocation: the panel focused with no last uses the tab's first terminal", () => {
  assert.deepEqual(pickLocation(spaces, panes, { tab: "t1", pane: "p2", terminal: null, cwd: null }, null),
    { cwd: "/repo", on: null, space: "s1", terminal: false });
});

test("pickLocation: a last from another space is not reused", () => {
  const last = { cwd: "/other/x", on: null, space: "s2", terminal: true };
  assert.equal(pickLocation(spaces, panes, { tab: "t1", pane: "p2", terminal: null, cwd: null }, last).cwd, "/repo");
});

test("pickLocation: no terminal anywhere falls back to the space's folder", () => {
  assert.equal(pickLocation(spaces, [panes[1]], { tab: "t1", pane: "p2", terminal: null, cwd: null }, null).cwd, "/home/me");
  assert.equal(pickLocation(spaces, panes, null, null).cwd, "/home/me");
});

test("pickLocation: a layout terminal block on another machine", () => {
  assert.deepEqual(pickLocation(spaces, panes, { tab: "t1", pane: null, terminal: "vps/t7", cwd: "/srv" }, null),
    { cwd: "/srv", on: "vps", space: "s1", terminal: true });
});

test("pickLocation: a space on another machine runs there", () => {
  const remote = [{ id: "s1", active: true, folder: "/home/me", machine: "vps" }];
  assert.equal(pickLocation(remote, panes, { tab: "t1", pane: "p1", terminal: "vps/t1a", cwd: "/repo" }, null).on, "vps");
});

import { normalize, resolveImage, imageKind, MAX_IMAGE } from "../mods/files-md/lib.js";
import { readFileSync } from "node:fs";

test("normalize: dots, doubles, backslashes; null above /", () => {
  assert.equal(normalize("/a/./b/../c"), "/a/c");
  assert.equal(normalize("/a//b/"), "/a/b");
  assert.equal(normalize("C:\\x\\y"), "/C:/x/y");
  assert.equal(normalize("/../x"), null);
  assert.equal(normalize("/"), "/");
});

const root = "/Users/me/repo", file = "/Users/me/repo/docs/PLAN.md";

test("resolveImage: relative, ./, ../ inside the root", () => {
  assert.deepEqual(resolveImage("img/a.png", file, root), { ok: true, path: "/Users/me/repo/docs/img/a.png" });
  assert.deepEqual(resolveImage("./a.png", file, root), { ok: true, path: "/Users/me/repo/docs/a.png" });
  assert.deepEqual(resolveImage("../shots/a.png", file, root), { ok: true, path: "/Users/me/repo/shots/a.png" });
});

test("resolveImage: encoded spaces, query and fragment, angle-bracket paths", () => {
  assert.deepEqual(resolveImage("my%20shot.png?raw=1#x", file, root), { ok: true, path: "/Users/me/repo/docs/my shot.png" });
  assert.deepEqual(resolveImage("my shot.png", file, root), { ok: true, path: "/Users/me/repo/docs/my shot.png" });
});

test("resolveImage: absolute paths only inside the root", () => {
  assert.deepEqual(resolveImage("/Users/me/repo/a.png", file, root), { ok: true, path: "/Users/me/repo/a.png" });
  assert.equal(resolveImage("/etc/hosts", file, root).reason, "Outside this folder · not shown");
});

test("resolveImage: traversal above the root, and a sibling with the same prefix", () => {
  for (const src of ["../../secret.png", "../../../../../../etc/x.png", "../../repo-other/a.png", "..%2F..%2Fsecret.png"])
    assert.equal(resolveImage(src, file, root).ok, false, src);
});

test("resolveImage: web, data, other schemes, empty, remote, bad encoding", () => {
  assert.deepEqual(resolveImage("https://x.test/a.png", file, root), { ok: false, reason: "Web image · not loaded", url: "https://x.test/a.png" });
  assert.equal(resolveImage("HTTP://x.test/a.png", file, root).url, "HTTP://x.test/a.png");
  assert.equal(resolveImage("data:image/png;base64,AAAA", file, root).reason, "Embedded image · not shown");
  assert.equal(resolveImage("file:///etc/x.png", file, root).reason, "Not a file address");
  assert.equal(resolveImage("", file, root).reason, "No image address");
  assert.equal(resolveImage("a.png", file, root, true).reason, "Image on another machine · not shown");
  assert.equal(resolveImage("%E0%A4%A.png", file, root).reason, "Bad image address");
});

test("resolveImage: Windows separators", () => {
  assert.deepEqual(resolveImage("img\\a.png", "C:\\repo\\docs\\a.md", "C:\\repo"), { ok: true, path: "/C:/repo/docs/img/a.png" });
});

test("imageKind: each supported format from the fixtures", () => {
  const read = f => new Uint8Array(readFileSync(new URL(`../fixtures/img/${f}`, import.meta.url)));
  assert.equal(imageKind(read("screenshot.png")), "png");
  assert.equal(imageKind(read("photo.jpg")), "jpeg");
  assert.equal(imageKind(read("anim.gif")), "gif");
  assert.equal(imageKind(read("pixel.webp")), "webp");
  assert.equal(imageKind(read("old.bmp")), "bmp");
  assert.equal(imageKind(read("diagram.svg")), "svg");
  assert.equal(imageKind(read("not-really.png")), null);
  assert.equal(imageKind(read("scan.tiff")), null, "TIFF is not a format the panel shows");
});

test("imageKind: SVG after a declaration and comment; not HTML; empty", () => {
  const b = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
  assert.equal(imageKind(b('<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="x"></svg>')), "svg");
  assert.equal(imageKind(b("<html><svg></svg></html>")), null);
  assert.equal(imageKind(new Uint8Array()), null);
  assert.equal(MAX_IMAGE, 10485760);
});

import { imageSize } from "../mods/files-md/lib.js";

test("imageSize: each fixture format", () => {
  const read = f => new Uint8Array(readFileSync(new URL(`../fixtures/img/${f}`, import.meta.url)));
  for (const [f, kind, size] of [["screenshot.png", "png", [640, 360]], ["photo.jpg", "jpeg", [640, 360]], ["anim.gif", "gif", [640, 360]],
    ["old.bmp", "bmp", [640, 360]], ["pixel.webp", "webp", [1, 1]], ["diagram.svg", "svg", [320, 120]]])
    assert.deepEqual(imageSize(read(f), kind), { width: size[0], height: size[1] }, f);
});

test("imageSize: SVG from viewBox when width is relative; nothing usable is null", () => {
  const b = s => new Uint8Array([...s].map(c => c.charCodeAt(0)));
  assert.deepEqual(imageSize(b('<svg width="100%" viewBox="0 0 200 50"></svg>'), "svg"), { width: 200, height: 50 });
  assert.equal(imageSize(b('<svg width="10em"></svg>'), "svg"), null);
  assert.equal(imageSize(new Uint8Array(8), "png"), null);
  assert.equal(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), "jpeg"), null);
});

import { classifyLink, resolvePath, relativeTo } from "../mods/files-md/lib.js";

const R = "/Users/me/repo", F = "/Users/me/repo/docs/PLAN.md";

test("classifyLink: web and mailto", () => {
  assert.deepEqual(classifyLink("https://herdr.dev/mods", F, R), { kind: "web", url: "https://herdr.dev/mods" });
  assert.deepEqual(classifyLink("HTTP://example.com", F, R), { kind: "web", url: "HTTP://example.com" });
  assert.deepEqual(classifyLink("mailto:someone@example.com?subject=hi", F, R), { kind: "mailto", address: "someone@example.com" });
  assert.deepEqual(classifyLink("mailto:a%2Bb@example.com", F, R), { kind: "mailto", address: "a+b@example.com" });
  assert.equal(classifyLink("mailto:", F, R).kind, "unsupported");
});

test("classifyLink: relative Markdown and other files inside the root", () => {
  assert.deepEqual(classifyLink("basics.md", F, R), { kind: "markdown", path: "/Users/me/repo/docs/basics.md", rel: "docs/basics.md" });
  assert.deepEqual(classifyLink("./tables.md", F, R), { kind: "markdown", path: "/Users/me/repo/docs/tables.md", rel: "docs/tables.md" });
  assert.deepEqual(classifyLink("../README.md", F, R), { kind: "markdown", path: "/Users/me/repo/README.md", rel: "README.md" });
  assert.deepEqual(classifyLink("sub/data.json", F, R), { kind: "file", path: "/Users/me/repo/docs/sub/data.json", rel: "docs/sub/data.json" });
});

test("classifyLink: anchors are dropped, anchor-only stays in the file", () => {
  assert.equal(classifyLink("code.md#code", F, R).rel, "docs/code.md");
  assert.equal(classifyLink("code.md?plain=1#L3", F, R).rel, "docs/code.md");
  assert.deepEqual(classifyLink("#links", F, R), { kind: "anchor" });
});

test("classifyLink: encoded spaces, angle-bracket style spaces, Windows separators", () => {
  assert.equal(classifyLink("sub/with%20space.md", F, R).rel, "docs/sub/with space.md");
  assert.equal(classifyLink("sub\\nested.md", F, R).rel, "docs/sub/nested.md");
});

test("classifyLink: outside the root is refused", () => {
  for (const url of ["../../etc/passwd", "../../../../../../etc/passwd", "/etc/hosts", "../../repo-other/x.md", "..%2F..%2Fsecret.md"])
    assert.equal(classifyLink(url, F, R).kind, "outside", url);
});

test("classifyLink: absolute paths and file URLs inside the root", () => {
  assert.equal(classifyLink("/Users/me/repo/docs/a.md", F, R).rel, "docs/a.md");
  assert.equal(classifyLink("file:///Users/me/repo/docs/a.md", F, R).rel, "docs/a.md");
  assert.equal(classifyLink("file://localhost/Users/me/repo/a.md", F, R).rel, "a.md");
  assert.equal(classifyLink("file:///etc/passwd", F, R).kind, "outside");
});

test("classifyLink: other schemes, empty, bad escapes, the root itself", () => {
  for (const url of ["javascript:alert(1)", "ftp://x.test/a", "vscode://file/x", "", "  ", "%E0%A4%A.md", "../"])
    assert.equal(classifyLink(url, F, R).kind, "unsupported", url);
});

test("resolvePath and relativeTo", () => {
  assert.deepEqual(resolvePath("a b.md", F, R), { path: "/Users/me/repo/docs/a b.md" });
  assert.deepEqual(resolvePath("../../x", F, R), { error: "outside" });
  assert.equal(relativeTo("/Users/me/repo/docs/a.md", R), "docs/a.md");
  assert.equal(relativeTo("/x/y", "/"), "x/y");
});
