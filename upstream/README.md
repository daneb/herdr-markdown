# upstream

Herdr's shipped `files` mod, exactly as app 0.1.15 shipped it
(`~/.config/herdr-app/mods/files/`). Apache-2.0, from herdrdev/herdr-app
(`defaults/mods/files`). Kept unchanged so `mods/files-md/` can be diffed
against it:

    diff -u upstream/files-0.1.15/main.js mods/files-md/main.js

After a Herdr update, compare the shipped mod with this copy (QUALITY.md,
"Regression").
