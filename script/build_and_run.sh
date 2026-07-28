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

read_public_env() {
  local key="$1"
  local shell_value="${!key:-}"

  if [[ -n "$shell_value" ]]; then
    printf '%s' "$shell_value"
    return
  fi

  local env_file
  for env_file in "$ROOT_DIR/.env.local" "$ROOT_DIR/.env"; do
    if [[ -f "$env_file" ]]; then
      awk -v key="$key" '
        index($0, key "=") == 1 {
          value = substr($0, length(key) + 2)
          sub(/\r$/, "", value)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
          if (
            (substr(value, 1, 1) == "\"" && substr(value, length(value), 1) == "\"") ||
            (substr(value, 1, 1) == "\047" && substr(value, length(value), 1) == "\047")
          ) {
            value = substr(value, 2, length(value) - 2)
          }
          print value
          exit
        }
      ' "$env_file"
      return
    fi
  done
}

validate_supabase_env() {
  local supabase_url
  local supabase_key

  supabase_url="$(read_public_env EXPO_PUBLIC_SUPABASE_URL)"
  supabase_key="$(read_public_env EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)"

  if [[ "$supabase_url" != https://*.supabase.co ]]; then
    echo "Canal configuration is incomplete." >&2
    echo "Set EXPO_PUBLIC_SUPABASE_URL in $ROOT_DIR/.env.local." >&2
    exit 1
  fi

  if [[ "$supabase_key" != sb_publishable_* && "$supabase_key" != eyJ* ]]; then
    echo "Canal configuration is incomplete." >&2
    echo "Set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in $ROOT_DIR/.env.local." >&2
    echo "Use a publishable or legacy anon key, never a secret or service-role key." >&2
    exit 1
  fi
}

run_doctor() {
  npx expo-doctor
}

resolve_expo_cmd

case "$MODE" in
  start|run)
    validate_supabase_env
    exec "${EXPO_CMD[@]}" start
    ;;
  --ios|ios)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "Run iOS requires macOS with Xcode and Apple Simulator installed." >&2
      echo "Use './script/build_and_run.sh --web' in this environment." >&2
      exit 1
    fi
    validate_supabase_env
    exec "${EXPO_CMD[@]}" start --ios
    ;;
  --ios-clean|ios-clean)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "Run iOS requires macOS with Xcode and Apple Simulator installed." >&2
      echo "Use './script/build_and_run.sh --web' in this environment." >&2
      exit 1
    fi
    validate_supabase_env
    exec "${EXPO_CMD[@]}" start --clear --ios
    ;;
  --build-ios|build-ios)
    if [[ "$(uname -s)" != "Darwin" ]]; then
      echo "Build iOS Simulator requires macOS with Xcode and Apple Simulator installed." >&2
      exit 1
    fi
    validate_supabase_env
    exec "${EXPO_CMD[@]}" run:ios
    ;;
  --android|android)
    validate_supabase_env
    exec "${EXPO_CMD[@]}" start --android
    ;;
  --web|web)
    validate_supabase_env
    exec "${EXPO_CMD[@]}" start --web
    ;;
  --dev-client|dev-client)
    validate_supabase_env
    exec "${EXPO_CMD[@]}" start --dev-client
    ;;
  --tunnel|tunnel)
    validate_supabase_env
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
