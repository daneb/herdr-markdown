// files-md's render cache: drawn diagrams and copied images, in one folder under the app's home,
// because image() draws only from there. Files are named by content. The runtime's fs has no stat,
// so index.json records each file's size and when it was last used; pruning goes by it.
// No herdr imports: fs is passed in, so `node --test` runs it against a temporary folder.

export const CAP = 100 * 1024 * 1024;
const INDEX = "index.json";
// Only names this cache makes: a hash, then a known extension. Nothing else is ever deleted.
const OURS = /^[0-9a-z]+\.(svg|png|jpeg|gif|webp|bmp)$/;

export function createCache({ fs, dir, cap = CAP, now = () => Date.now() }) {
  let entries = {};
  const total = () => Object.values(entries).reduce((n, e) => n + e.bytes, 0);
  const save = () => fs.writeFile(`${dir}/${INDEX}`, JSON.stringify(entries));

  async function prune() {
    const names = Object.keys(entries).sort((a, b) => entries[a].used - entries[b].used);
    let size = total();
    while (size > cap && names.length) {
      const name = names.shift();
      size -= entries[name].bytes;
      delete entries[name];
      await fs.unlink(`${dir}/${name}`).catch(() => {});
    }
  }

  return {
    dir,
    /** Reads the index, drops files it does not list, and prunes to the cap. */
    async load() {
      await fs.mkdir(dir, { recursive: true });
      try {
        const parsed = JSON.parse(await fs.readFile(`${dir}/${INDEX}`, "utf8"));
        entries = Object.fromEntries(Object.entries(parsed).filter(([name, e]) =>
          OURS.test(name) && Number.isFinite(e?.bytes) && Number.isFinite(e?.used)));
      } catch { entries = {}; }
      for (const name of await fs.readdir(dir).catch(() => []))
        if (OURS.test(name) && !entries[name]) await fs.unlink(`${dir}/${name}`).catch(() => {});
      for (const name of Object.keys(entries))
        if (!(await fs.exists(`${dir}/${name}`))) delete entries[name];
      await prune();
      await save();
    },
    /** The entry for a name, if its file is still there; marks it used. */
    async get(name) {
      const e = entries[name];
      if (!e) return null;
      if (!(await fs.exists(`${dir}/${name}`))) { delete entries[name]; return null; }
      e.used = now();
      return e;
    },
    /** Writes a file and records it, with any facts to keep (a diagram's size). */
    async put(name, data, meta = {}) {
      if (!OURS.test(name)) throw new Error(`not a cache name: ${name}`);
      await fs.writeFile(`${dir}/${name}`, data);
      // A string's length is close enough for SVG, which is nearly all ASCII.
      const bytes = data.length;
      entries[name] = { ...meta, bytes, used: now() };
      await prune();
      await save();
      return entries[name];
    },
    /** Saves when-used times after cache hits. */
    save,
    size: total,
  };
}
