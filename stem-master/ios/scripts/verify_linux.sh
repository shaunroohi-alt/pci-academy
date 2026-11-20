#!/usr/bin/env bash
# Checks the iOS sources on a machine without Xcode (Linux CI, containers).
#
#   1. Typechecks, together, every app source file whose imports are limited to
#      Foundation / FoundationNetworking / Observation (models, pure logic, networking,
#      persistence, AppModel).
#   2. Parses every other Swift file (SwiftUI, AVFoundation, UIKit, Security): syntax only.
#   3. Builds the files from step 1 as a SwiftPM module named StemMaster and runs the whole
#      StemMasterTests suite against it with XCTest, using the contract fixture.
#
# It cannot compile SwiftUI/AVFoundation code; the macOS CI build does that.
#
# Usage: scripts/verify_linux.sh [path/to/job_completed.json]
#        (default: ../contract/job_completed.json, written by the server test-suite)
set -euo pipefail

ios_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
contract="${1:-$ios_dir/../contract/job_completed.json}"
swiftc_bin="${SWIFTC:-swiftc}"
swift_bin="${SWIFT:-swift}"
work="$(mktemp -d "${TMPDIR:-/tmp}/stem-master-ios-check.XXXXXX")"
trap 'rm -rf "$work"' EXIT

portable=()
platform=()
while IFS= read -r file; do
    imports="$(grep -E '^[[:space:]]*(@testable[[:space:]]+)?import[[:space:]]' "$file" | awk '{print $NF}' | sort -u)"
    only_foundation=1
    for module in $imports; do
        case "$module" in
            Foundation|FoundationNetworking|Observation) ;;
            *) only_foundation=0 ;;
        esac
    done
    if [[ $only_foundation -eq 1 ]]; then portable+=("$file"); else platform+=("$file"); fi
done < <(find "$ios_dir/StemMaster" -name '*.swift' | sort)

echo "== 1. typecheck ${#portable[@]} Foundation-only files (Swift 5 mode)"
printf '   %s\n' "${portable[@]#"$ios_dir/"}"
"$swiftc_bin" -typecheck -swift-version 5 "${portable[@]}"
echo "   OK"

echo "== 2. parse ${#platform[@]} platform files (syntax only)"
for file in "${platform[@]}"; do
    "$swiftc_bin" -parse "$file"
    echo "   ${file#"$ios_dir/"}"
done
for file in "$ios_dir"/StemMasterTests/*.swift; do
    "$swiftc_bin" -parse "$file"
done
echo "   OK"

echo "== 3. build + run StemMasterTests (SwiftPM, XCTest)"
mkdir -p "$work/Sources/StemMaster" "$work/Tests/StemMasterTests"
cp "${portable[@]}" "$work/Sources/StemMaster/"
cp "$ios_dir"/StemMasterTests/*.swift "$work/Tests/StemMasterTests/"
if [[ -f "$contract" ]]; then
    cp "$contract" "$work/Tests/StemMasterTests/job_completed.json"
    echo "   contract: $contract"
else
    echo "   WARNING: $contract not found; the contract tests will fail with an explanation." >&2
    echo '{}' > "$work/Tests/StemMasterTests/placeholder.json"
fi
resources='.copy("job_completed.json")'
[[ -f "$contract" ]] || resources='.copy("placeholder.json")'
cat > "$work/Package.swift" <<EOF
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "StemMasterLinuxCheck",
    targets: [
        .target(name: "StemMaster", path: "Sources/StemMaster"),
        .testTarget(
            name: "StemMasterTests",
            dependencies: ["StemMaster"],
            path: "Tests/StemMasterTests",
            resources: [$resources]
        ),
    ]
)
EOF
(cd "$work" && "$swift_bin" build --build-tests -Xswiftc -warnings-as-errors 2>&1 | tail -n 5)
set +e
(cd "$work" && "$swift_bin" test --skip-build >"$work/test.log" 2>&1)
status=$?
set -e
grep -E ': error: |^Test Suite .(All tests|Debug).*(passed|failed)|Executed [0-9]+ tests' "$work/test.log" | tail -n 40
if [[ $status -ne 0 ]]; then
    echo "== StemMasterTests FAILED (exit $status)" >&2
    exit "$status"
fi
echo "== all checks passed"
