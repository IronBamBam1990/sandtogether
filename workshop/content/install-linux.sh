#!/bin/bash
# ============================================================================
# SandTogether — Linux installer wrapper. Run: bash install-linux.sh
# No Node.js required: uses the game's own Electron binary as the runtime.
# Optional argument: path to the Sandustry game folder (for exotic setups).
# ============================================================================
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

find_game() {
  # classic install, XDG, Flatpak Steam, old symlink — plus extra libraries
  local roots=(
    "$HOME/.steam/steam"
    "$HOME/.local/share/Steam"
    "$HOME/.var/app/com.valvesoftware.Steam/.local/share/Steam"
    "$HOME/.steam/root"
  )
  local root g vdf lib
  for root in "${roots[@]}"; do
    g="$root/steamapps/common/Sandustry"
    [ -d "$g/resources" ] && { echo "$g"; return; }
    vdf="$root/steamapps/libraryfolders.vdf"
    [ -f "$vdf" ] || continue
    while IFS= read -r lib; do
      g="$lib/steamapps/common/Sandustry"
      [ -d "$g/resources" ] && { echo "$g"; return; }
    done < <(grep -o '"path"[[:space:]]*"[^"]*"' "$vdf" | sed 's/.*"path"[[:space:]]*"//; s/"$//')
  done
}

find_bin() {
  # the game executable — NOT the .so libs / crashpad helpers / chrome-sandbox
  local g="$1" f b
  for f in "$g/sandustry" "$g/Sandustry" "$g/sandustry.x86_64" "$g/Sandustry.x86_64"; do
    [ -f "$f" ] && [ -x "$f" ] && { echo "$f"; return; }
  done
  for f in "$g"/*; do
    [ -f "$f" ] && [ -x "$f" ] || continue
    b="$(basename "$f")"
    case "$b" in *.so|*.so.*|*crashpad*|chrome-sandbox|*.sh|*.dat|*.pak) continue ;; esac
    echo "$f"; return
  done
}

GAME="${1:-$(find_game)}"
if [ -z "${GAME:-}" ] || [ ! -d "$GAME/resources" ]; then
  echo "ERROR: Sandustry not found. Run with the game folder as argument:"
  echo "  bash $0 /path/to/steamapps/common/Sandustry"
  exit 1
fi

BIN="$(find_bin "$GAME")"
if [ -z "${BIN:-}" ]; then
  echo "ERROR: could not find the game executable inside: $GAME"
  echo "Send a screenshot of 'ls -l' of that folder to the mod author for help."
  exit 1
fi

echo "=== SandTogether installer (Linux) ==="
echo "Game:   $GAME"
echo "Binary: $BIN"
ELECTRON_RUN_AS_NODE=1 "$BIN" "$DIR/install.js" "$GAME"
