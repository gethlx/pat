#!/bin/bash
set -euo pipefail

if [[ "$(uname -sm)" != 'Darwin arm64' ]]; then
  echo 'PAT test packaging requires an Apple Silicon macOS build runner.' >&2
  exit 1
fi

desktop=$(cd "$(dirname "$0")" && pwd)
output=${1:?Pass an empty build output directory}
mkdir -p "$output"
output=$(cd "$output" && pwd)
app="$output/PAT.app"
if [[ -e "$app" ]]; then
  echo 'The output directory already contains PAT.app.' >&2
  exit 1
fi

electron=$(cd "$desktop" && node -p 'require("electron")')
ditto "${electron%/Contents/MacOS/Electron}" "$app"
resources="$app/Contents/Resources"
mkdir -p "$resources/app" "$resources/pat-ledger"
ditto "$desktop/src" "$resources/app/src"
cp "$desktop/package.json" "$resources/app/"
cp "$desktop/../../LICENSE" "$resources/app/LICENSE"
ditto "$desktop/../ledger/src/pat_ledger" "$resources/pat-ledger/pat_ledger"

export UV_PYTHON_INSTALL_DIR="$output/uv-python"
uv python install 3.13.12
python=$(uv python find --managed-python --no-project 3.13.12)
python_root=$(dirname "$(dirname "$python")")
ditto "$python_root" "$resources/pat-ledger/python"
cat > "$resources/pat-ledger/pat-ledger" <<'EOF'
#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$root/python/bin/python3.13" -I -B "$root/run.py" "$@"
EOF
cat > "$resources/pat-ledger/run.py" <<'EOF'
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pat_ledger.cli import main

raise SystemExit(main())
EOF
chmod +x "$resources/pat-ledger/pat-ledger"
"$resources/pat-ledger/pat-ledger" --version

plist="$app/Contents/Info.plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleName PAT' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName PAT' "$plist"
/usr/libexec/PlistBuddy -c 'Set :CFBundleIdentifier org.gethlx.pat' "$plist"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
ditto -c -k --keepParent "$app" "$output/PAT-macOS-arm64.zip"
