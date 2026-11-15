#!/bin/sh
# Screenshots of files-md showing each fixture, for review and the release record.
# Runs on the Mac with Herdr open (CI cannot run the app). It brings Herdr to the
# front, because Herdr draws only while its window is visible, then for each fixture
# opens a files-md pane beside the focused terminal, zooms it, saves a shot to
# docs/shots/<theme>/<fixture>.png and closes the pane. Your panes are left as they were.
# Usage: scripts/shots.sh [theme-label]   (default: the appearance Herdr reports)
set -eu

here=$(cd "$(dirname "$0")/.." && pwd)
fixtures="showcase basics tables tasks code mermaid architecture images links frontmatter"

json() { python3 -c "import json,sys; print(json.load(sys.stdin)$1)"; }

label=${1:-}
if [ -z "$label" ]; then
  # settings().dark is the appearance now; herdr-app status has no theme, so ask the user's settings file.
  label=$(python3 -c "import json,os; s=json.load(open(os.path.expanduser('~/.config/herdr-app/settings.json'))); print(s.get('appearance','current'))")
fi
out="$here/docs/shots/$label"
mkdir -p "$out"

case "$(herdr-app status 2>/dev/null | json "['layout']" 2>/dev/null || true)" in
  "") echo "Herdr is not running." >&2; exit 1 ;;
esac

# The pane opens beside the focused terminal, in that terminal's folder: it must be this repo.
open -a Herdr
sleep 1

for name in $fixtures; do
  pane=$(herdr-app do pane.split "{\"direction\":\"right\",\"mod\":\"files-md\",\"props\":{\"file\":\"fixtures/$name.md\"}}" | json "['pane']")
  herdr-app do pane.zoom "{\"pane\":\"$pane\"}" >/dev/null
  sleep 3   # read, draw diagrams, copy images
  herdr-app shot "$out/$name.png" >/dev/null
  herdr-app do pane.zoom "{\"pane\":\"$pane\"}" >/dev/null
  herdr-app do pane.close "{\"pane\":\"$pane\"}" >/dev/null
  echo "$out/$name.png"
done
