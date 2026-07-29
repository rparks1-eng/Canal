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
  --ios-clean, ios-clean
                    Clear the Metro cache, then open the iOS Simulator
  --build-ios, build-ios
                    Build and install Canal in the iOS Simulator
  --android, android
                    Start Expo and open Android
  --web, web        Start Expo for web
  --dev-client, dev-client
                    Start Expo in development-client mode
  --tunnel, tunnel  Start Expo using tunnel transport
  --export-web, export-web
                    Export the web build locally
  --release-ballot-smoke, release-ballot-smoke
                    Run the isolated Release Ballot iOS Simulator smoke lane
  --check-config, check-config
                    Validate Canal's public local configuration
  --recover-spotify-config, recover-spotify-config
                    Recover the public Spotify client ID from an older local Canal folder
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

validate_public_env() {
  node "$ROOT_DIR/script/validate_public_env.cjs" "$ROOT_DIR"
}

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "Run iOS requires macOS with Xcode and Apple Simulator installed." >&2
    echo "Use './script/build_and_run.sh --web' in this environment." >&2
    exit 1
  fi
}

run_doctor() {
  npx expo-doctor
}

resolve_expo_cmd

case "$MODE" in
  start|run)
    validate_public_env
    exec "${EXPO_CMD[@]}" start
    ;;
  --ios|ios)
    require_macos
    validate_public_env
    exec "${EXPO_CMD[@]}" start --dev-client --localhost --ios
    ;;
  --ios-clean|ios-clean)
    require_macos
    validate_public_env
    exec "${EXPO_CMD[@]}" start --dev-client --localhost --clear --ios
    ;;
  --build-ios|build-ios)
    require_macos
    validate_public_env
    "${EXPO_CMD[@]}" run:ios \
      --no-bundler
    exec "${EXPO_CMD[@]}" start --dev-client --localhost --ios
    ;;
  --android|android)
    validate_public_env
    exec "${EXPO_CMD[@]}" start --android
    ;;
  --web|web)
    validate_public_env
    exec "${EXPO_CMD[@]}" start --web
    ;;
  --dev-client|dev-client)
    validate_public_env
    exec "${EXPO_CMD[@]}" start --dev-client
    ;;
  --tunnel|tunnel)
    validate_public_env
    exec "${EXPO_CMD[@]}" start --tunnel
    ;;
  --export-web|export-web)
    validate_public_env
    exec "${EXPO_CMD[@]}" export --platform web
    ;;
  --release-ballot-smoke|release-ballot-smoke)
    require_macos
    exec node "$ROOT_DIR/script/release_ballot_smoke.cjs" "${@:2}"
    ;;
  --doctor|doctor)
    run_doctor
    ;;
  --check-config|check-config)
    validate_public_env
    ;;
  --recover-spotify-config|recover-spotify-config)
    node "$ROOT_DIR/script/recover_spotify_client_id.cjs" "$ROOT_DIR"
    validate_public_env
    ;;
  --help|help)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
