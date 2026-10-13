#!/usr/bin/env bash
# GUARD — fmt.Errorf("op: %w", err) with a nil err returns a NON-nil error
# whose message is "op: %!w(<nil>)". Every success path then looks like a
# failure (this once broke password changes, MFA, and CSRF binding in prod).
# Only wrap inside `if err != nil {` — this script fails otherwise.
set -euo pipefail

fail=0
while IFS= read -r hit; do
  file="$(cut -d: -f1 <<<"$hit")"
  line="$(cut -d: -f2 <<<"$hit")"
  prev=$(sed -n "1,$((line - 1))p" "$file" | grep -v '^[[:space:]]*$' | tail -n 1)
  case "$prev" in
    *{) ;; # guarded by an if — ok
    *)
      echo "NIL-WRAP: $file:$line wraps a possibly-nil err:"
      echo "  $prev"
      sed -n "${line}p" "$file" | sed 's/^/  /'
      fail=1
      ;;
  esac
done < <(grep -rn 'return fmt\.Errorf("[^"]*: %w", err)$' \
  --include="*.go" server/services/auth 2>/dev/null || true)

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Wrap only inside 'if err != nil { ... }' so nil stays nil."
  exit 1
fi
echo "OK: no unguarded %w wraps"
