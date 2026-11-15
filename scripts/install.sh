#!/bin/sh
# Copies mods/files-md into the Herdr app's config folder and checks it.
# Never overwrites a files-md folder that this repo did not install (no .files-md-install marker).
# It does not touch keys.json: merging the suggested key is the person's choice (see README).
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
home=${HERDR_APP_HOME:-"$HOME/.config/herdr-app"}
dest="$home/mods/files-md"

if [ ! -d "$home/mods" ]; then
  echo "No Herdr app config at $home (set HERDR_APP_HOME?)" >&2
  exit 1
fi
if [ -d "$dest" ] && [ ! -f "$dest/.files-md-install" ]; then
  echo "$dest exists and was not installed by this script; not overwriting it." >&2
  echo "Move it aside first if it is a copy you no longer need." >&2
  exit 1
fi

mkdir -p "$dest"
# Copy, never symlink: Herdr does not hot-reload through links.
for f in "$here"/mods/files-md/*; do
  case "$(basename "$f")" in gpui-kit.d.ts) continue ;; esac
  cp "$f" "$dest/"
done
# Files this repo no longer ships go too, so a rename does not leave a stale module behind.
for f in "$dest"/*; do
  name=$(basename "$f")
  case "$name" in gpui-kit.d.ts|jsconfig.json) continue ;; esac
  [ -e "$here/mods/files-md/$name" ] || rm -f "$f"
done
date -u +%Y-%m-%dT%H:%M:%SZ > "$dest/.files-md-install"

if command -v herdr-app >/dev/null 2>&1; then
  herdr-app check "$dest"
else
  echo "Installed to $dest. herdr-app not on PATH: run 'herdr-app check $dest' yourself."
fi
