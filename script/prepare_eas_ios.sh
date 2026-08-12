#!/usr/bin/env bash

set -euo pipefail

if [[ "${EAS_BUILD_PLATFORM:-}" != "ios" ]]; then
  exit 0
fi

pod_source="$({
  ruby -e 'spec = Gem::Specification.find_by_name("cocoapods", "1.16.2"); print File.join(spec.full_gem_path, "bin", "pod")'
})"
ruby_binary="$(command -v ruby)"
pod_target="$(ruby -e 'print File.join(Gem.bindir, "pod")')"

if [[ ! -f "$pod_source" ]]; then
  echo "CocoaPods executable was not found at $pod_source" >&2
  exit 1
fi

mkdir -p "$(dirname "$pod_target")"
rm -f "$pod_target"
tee "$pod_target" >/dev/null <<EOF
#!/usr/bin/env bash
unset BUNDLE_BIN_PATH BUNDLE_GEMFILE RUBYLIB RUBYOPT
export COCOAPODS_NO_BUNDLER=1
exec "$ruby_binary" "$pod_source" "\$@"
EOF
chmod 755 "$pod_target"
resolved_pod="$(command -v pod)"
if [[ "$resolved_pod" != "$pod_target" ]]; then
  echo "CocoaPods resolves to $resolved_pod instead of $pod_target (PATH=$PATH)" >&2
  exit 1
fi
pod --version
