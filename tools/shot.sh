#!/bin/sh
# usage: shot.sh page.html out.png W H
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --virtual-time-budget=4000 --screenshot="$(cygpath -w "$2")" --window-size=$3,$4 "file:///$(cygpath -m "$1")" 2>/dev/null
