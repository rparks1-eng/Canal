#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${TMPDIR:-/tmp}/canal-expo-runtime"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME_DIR/expo-home" "$RUNTIME_DIR/npm-cache"

export EXPO_NO_TELEMETRY=1
export EXPO_HOME="$RUNTIME_DIR/expo-home"
export npm_config_cache="$RUNTIME_DIR/npm-cache"

show_usage() {
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run        Start the Expo dev server
  --ios, ios        Start Expo and open the iOS Simulator
  --android, android
                    Start Expo and open Android
  --web, web        Start Expo for web
  --dev-client, dev-client
                    Start Expo in development-client mode
  --tunnel, tunnel  Start Expo using tunnel transport
  --export-web, export-web
                    Export the web build locally
  --doctor, doctor  Run Expo diagnostics
  --help, help      Show this help
USAGE
}

resolve_expo_cmd() {
  if [[ -n "${EXPO_CLI:-}" ]]; then
    # shellcheck disable=SC2206
    EXPO_CMD=(${EXPO_CLI})
  else
    EXPO_CMD=(npx expo)
  fi
}

run_doctor() {
  npx expo-doctor
}

resolve_expo_cmd

case "$MODE" in
  start|run)
    exec "${EXPO_CMD[@]}" start
    ;;
  --ios|ios)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "Run iOS requires macOS with Xcode and Apple Simulator installed." >&2
      echo "Use './script/build_and_run.sh --web' in this environment." >&2
      exit 1
    fi
    exec "${EXPO_CMD[@]}" start --ios
    ;;
  --android|android)
    exec "${EXPO_CMD[@]}" start --android
    ;;
  --web|web)
    exec "${EXPO_CMD[@]}" start --web
    ;;
  --dev-client|dev-client)
    exec "${EXPO_CMD[@]}" start --dev-client
    ;;
  --tunnel|tunnel)
    exec "${EXPO_CMD[@]}" start --tunnel
    ;;
  --export-web|export-web)
    exec "${EXPO_CMD[@]}" export --platform web
    ;;
  --doctor|doctor)
    run_doctor
    ;;
  --help|help)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
