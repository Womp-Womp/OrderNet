#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-all}"
INSTALL_CLI="${INSTALL_CLI:-0}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "$SKIP_INSTALL" != "1" ]]; then
  echo "[setup] Installing workspace dependencies..."
  npm install
fi

if [[ "$SKIP_BUILD" != "1" ]]; then
  echo "[setup] Building target: $TARGET"
  case "$TARGET" in
    all) npm run build ;;
    cli) npm run build --workspace @ordernet/cli ;;
    web) npm run build --workspace @ordernet/web ;;
    *)
      echo "Unknown target '$TARGET'. Use: all|cli|web"
      exit 1
      ;;
  esac
fi

if [[ "$INSTALL_CLI" == "1" ]]; then
  echo "[setup] Linking ordernet CLI globally..."
  npm run build --workspace @ordernet/cli
  npm link --workspace @ordernet/cli
fi

echo "[setup] Done."
echo "[setup] Start web:  npm run start --workspace @ordernet/web -- --http-port 3000"
echo "[setup] Start cli:  npm run start --workspace @ordernet/cli"
