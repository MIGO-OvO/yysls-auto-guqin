#!/usr/bin/env bash
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || "$(uname)" != Darwin ]]; then
  echo 'Run this harness only in an isolated GitHub Actions macOS runner.' >&2
  exit 1
fi
app="$1"
expected_version="$2"
mkdir -p artifacts
binary=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Contents/Info.plist")
version=$(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Contents/Info.plist")
test "$version" = "$expected_version"
architecture=$(lipo -archs "$app/Contents/MacOS/$binary")
test "$architecture" = "$(uname -m)"
codesign --verify --deep --strict "$app"
codesign -d --verbose=2 "$app" 2> artifacts/macos-codesign.log
workspace="$HOME/Library/Application Support/io.github.migo-ovo.yysls-auto-guqin/workspace.json"
if [[ -e "$workspace" ]]; then
  echo 'A fresh CI application profile is required.' >&2
  exit 1
fi
"$app/Contents/MacOS/$binary" > artifacts/macos-app.stdout.log 2> artifacts/macos-app.stderr.log &
app_pid=$!
cleanup() {
  kill "$app_pid" 2>/dev/null || true
  wait "$app_pid" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in {1..60}; do
  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat artifacts/macos-app.stderr.log >&2
    echo 'Packaged macOS application exited during startup.' >&2
    exit 1
  fi
  if [[ -f "$workspace" ]]; then break; fi
  sleep 0.5
done
python3 - "$workspace" "$version" "$architecture" <<'PY'
import json, pathlib, sys
data = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert data['version'] == 1 and data['scores']
assert any(score['notes'] for score in data['scores'])
assert any(score['id'] == data['activeId'] for score in data['scores'])
result = {'version': sys.argv[2], 'architecture': sys.argv[3], 'codeSignatureVerified': True, 'nativeStartup': True, 'webviewRustPersistence': True, 'scores': len(data['scores'])}
pathlib.Path('artifacts/macos-native.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
PY
GUQIN_NATIVE_TARGET_PID="$app_pid" cargo test --manifest-path src-tauri/Cargo.toml --locked --test macos_input -- --ignored --nocapture
cargo run --manifest-path src-tauri/Cargo.toml --locked --example verify_release --features tauri/custom-protocol
python3 - "$expected_version" <<'PY'
import json, pathlib, sys
report = json.loads(pathlib.Path('artifacts/update-verification.json').read_text())
assert report['signatureVerified'] and report['version'] == sys.argv[1]
assert report['installed'] is False
PY
kill -0 "$app_pid"
