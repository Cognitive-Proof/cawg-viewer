#!/usr/bin/env bash
# Copies the conformance rubrics, their evaluator and its tests from
# contentauth/c2pa-conformance-tool (Apache-2.0) at a given commit:
#
#   web/scripts/sync-rubrics.sh <commit>
#
# Files land at the same relative paths as upstream (src/lib/rubrics,
# public/rubrics), unmodified, so a re-sync is a plain diff to review.
set -euo pipefail

ref=${1:?usage: sync-rubrics.sh <commit>}
web=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

git -C "$tmp" init -q
git -C "$tmp" fetch -q --depth 1 https://github.com/contentauth/c2pa-conformance-tool.git "$ref"
git -C "$tmp" checkout -q FETCH_HEAD

rm -rf "$web/src/lib/rubrics" "$web/public/rubrics"
mkdir -p "$web/src/lib" "$web/public"
cp -R "$tmp/src/lib/rubrics" "$web/src/lib/rubrics"
cp -R "$tmp/public/rubrics" "$web/public/rubrics"
cp "$tmp/LICENSE" "$web/src/lib/rubrics/LICENSE"
echo "$(git -C "$tmp" rev-parse HEAD)" > "$web/src/lib/rubrics/UPSTREAM_COMMIT"

echo "Synced rubrics from c2pa-conformance-tool@$(cat "$web/src/lib/rubrics/UPSTREAM_COMMIT")"
