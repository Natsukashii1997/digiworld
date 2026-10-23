#!/bin/bash
# A login may start the notes app before its local workbench server.
set -eu
base_url="http://127.0.0.1:5178"
while ! /usr/bin/curl --silent --fail --max-time 2 --header 'X-Workbench-Client: 1' "$base_url/api/session" --output /dev/null; do
  /bin/sleep 2
done
exec '/Users/nat/Applications/随手记.app/Contents/MacOS/FloatingNotes' --base-url "$base_url/" --state-dir '/Users/nat/Applications/FloatingNotesState'
