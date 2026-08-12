#!/usr/bin/env bash

set -euo pipefail

if [[ "${EAS_BUILD_PLATFORM:-}" != "ios" ]]; then
  exit 0
fi

pod_source="$({
  ruby -e 'spec = Gem::Specification.find_by_name("cocoapods", "1.16.2"); print File.join(spec.full_gem_path, "bin", "pod")'
})"
ruby_binary="$(command -v ruby)"

if [[ ! -f "$pod_source" ]]; then
  echo "CocoaPods executable was not found at $pod_source" >&2
  exit 1
fi

sudo mkdir -p /usr/local/bin
sudo tee /usr/local/bin/pod >/dev/null <<EOF
#!/usr/bin/env bash
unset BUNDLE_BIN_PATH BUNDLE_GEMFILE RUBYLIB RUBYOPT
export COCOAPODS_NO_BUNDLER=1
exec "$ruby_binary" "$pod_source" "\$@"
EOF
sudo chmod 755 /usr/local/bin/pod
/usr/local/bin/pod --version
