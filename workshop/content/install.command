#!/bin/bash
# ============================================================================
# SandTogether — macOS installer wrapper. Double-click to run.
# No Node.js required: uses the game's own Electron binary as the runtime.
# Optional argument: path to Sandustry.app (for non-default Steam libraries).
# ============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

find_game() {
  local steam="$HOME/Library/Application Support/Steam"
  local c="$steam/steamapps/common/Sandustry/Sandustry.app"
  [ -x "$c/Contents/MacOS/Sandustry" ] && { echo "$c"; return; }
  # extra Steam libraries
  local vdf="$steam/steamapps/libraryfolders.vdf"
  if [ -f "$vdf" ]; then
    grep -o '"path"[[:space:]]*"[^"]*"' "$vdf" | sed 's/.*"path"[[:space:]]*"//; s/"$//' | while read -r lib; do
      local g="$lib/steamapps/common/Sandustry/Sandustry.app"
      [ -x "$g/Contents/MacOS/Sandustry" ] && { echo "$g"; return; }
    done
  fi
}

GAME="${1:-$(find_game)}"
if [ -z "${GAME:-}" ] || [ ! -x "$GAME/Contents/MacOS/Sandustry" ]; then
  echo "ERROR: Sandustry.app not found. Run with the path as argument:"
  echo "  $0 /path/to/Sandustry.app"
  read -r -p "Press Enter to close"; exit 1
fi

echo "=== SandTogether installer (macOS) ==="
ELECTRON_RUN_AS_NODE=1 "$GAME/Contents/MacOS/Sandustry" "$DIR/install.js" "$GAME"
read -r -p "Press Enter to close"
