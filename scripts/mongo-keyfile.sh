#!/bin/sh
# Generate the shared secret MongoDB replica-set members authenticate to each
# other with. Run once, before the first `docker compose up`.
#
# A replica set will not start with --auth unless its members can prove their
# identity to one another, which is what this key is for. It is not a user
# password and is never typed by anyone — it just has to exist, be random, and
# be readable only by the mongod user (permissions are enforced by mongod
# itself, which refuses to start if the file is group- or world-readable).
set -e

OUT="$(dirname "$0")/../secrets/mongo-keyfile"
mkdir -p "$(dirname "$OUT")"

if [ -f "$OUT" ]; then
  echo "✓ Key file already exists at $OUT — leaving it alone."
  echo "  (Replacing it would stop the existing replica set from starting.)"
  exit 0
fi

openssl rand -base64 756 > "$OUT"
chmod 400 "$OUT"

# Inside the container the file must be owned by the mongodb user (uid 999).
# chown needs root on the host; if it isn't available the compose file still
# works because the bind mount is read-only and mongod only needs to read it.
chown 999:999 "$OUT" 2>/dev/null || true

echo "✓ Wrote $OUT"
echo "  Keep it out of version control (it is already in .gitignore) and back it"
echo "  up with the database — losing it means the replica set cannot restart."
