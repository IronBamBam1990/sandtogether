#!/bin/bash
# ============================================================================
# SandTogether — macOS launcher. Double-click to start the modded game.
# If Steam restored app.asar (update/verify), re-runs the installer first so
# the game never silently starts unmodded. Then launches through Steam so the
# overlay and friend invites (+connect_lobby) keep working.
# ============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

GAME="$HOME/Library/Application Support/Steam/steamapps/common/Sandustry/Sandustry.app"
if [ ! -x "$GAME/Contents/MacOS/Sandustry" ]; then
  echo "Sandustry.app not in the default Steam library - run install.command with the path first."
  read -r -p "Press Enter to close"; exit 1
fi

if [ -e "$GAME/Contents/Resources/app.asar" ]; then
  echo "Steam restored app.asar - reinstalling the mod so it matches the current build..."
  ELECTRON_RUN_AS_NODE=1 "$GAME/Contents/MacOS/Sandustry" "$DIR/install.js" "$GAME"
fi

open "steam://run/2764460"
