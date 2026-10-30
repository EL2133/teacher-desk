#!/bin/sh
set -eu
rm -rf public
mkdir -p public/css public/js public/assets public/wake-game
cp index.html public/index.html
cp admin.html public/admin.html
cp -r css/. public/css/
cp -r js/. public/js/
cp -r assets/. public/assets/
cp -r wake-game/. public/wake-game/
python3 -c 'import json, os; open("public/js/config.js", "w", encoding="utf-8").write("window.TD_API=" + json.dumps(os.environ.get("TD_API") or os.environ.get("MKPC_API", "")) + ";\n")'
