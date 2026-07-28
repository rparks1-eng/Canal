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

get_booted_simulator_udid() {
  xcrun simctl list devices booted -j |
    node -e '
      let input = "";
      process.stdin.on("data", (chunk) => {
        input += chunk;
      });
      process.stdin.on("end", () => {
        const devices =
          Object.values(JSON.parse(input).devices)
            .flat()
            .filter((device) => device.state === "Booted");
        if (devices[0]?.udid) {
          process.stdout.write(devices[0].udid);
        }
      });
    '
}

prepare_ios_simulator() {
  require_macos
  open -a Simulator

  local simulator_udid
  simulator_udid="$(get_booted_simulator_udid)"

  if [[ -z "$simulator_udid" ]]; then
    simulator_udid="$(
      defaults read com.apple.iphonesimulator CurrentDeviceUDID 2>/dev/null ||
        true
    )"

    if [[ -n "$simulator_udid" ]]; then
      xcrun simctl boot "$simulator_udid" 2>/dev/null ||
        true
    fi
  fi

  local attempt
  for attempt in {1..20}; do
    simulator_udid="$(get_booted_simulator_udid)"

    if [[ -n "$simulator_udid" ]]; then
      break
    fi

    sleep 0.5
  done

  if [[ -z "$simulator_udid" ]]; then
    echo "No iOS Simulator could be booted." >&2
    echo "Open Xcode, install an iOS runtime, and open one iPhone Simulator." >&2
    exit 1
  fi

  xcrun simctl bootstatus "$simulator_udid" -b >&2
  printf '%s' "$simulator_udid"
}

ensure_canal_is_installed() {
  local simulator_udid="$1"

  if xcrun simctl get_app_container \
    "$simulator_udid" \
    com.raishawnparks.canal \
    app >/dev/null 2>&1; then
    return
  fi

  echo "Canal is not installed in this Simulator. Building it once now."
  "${EXPO_CMD[@]}" run:ios \
    --no-bundler \
    --device "$simulator_udid"
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
    validate_public_env
    simulator_udid="$(prepare_ios_simulator)"
    ensure_canal_is_installed "$simulator_udid"
    exec "${EXPO_CMD[@]}" start --dev-client --localhost --ios
    ;;
  --ios-clean|ios-clean)
    validate_public_env
    simulator_udid="$(prepare_ios_simulator)"
    ensure_canal_is_installed "$simulator_udid"
    exec "${EXPO_CMD[@]}" start --dev-client --localhost --clear --ios
    ;;
  --build-ios|build-ios)
    validate_public_env
    simulator_udid="$(prepare_ios_simulator)"
    "${EXPO_CMD[@]}" run:ios \
      --no-bundler \
      --device "$simulator_udid"
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
    exec "${EXPO_CMD[@]}" export --platform web
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
