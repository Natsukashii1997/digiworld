# Native Runtime Provenance

Two Apple Silicon binaries are reused from the user's existing `/Applications/看看收藏.app/Contents/Resources` installation. They are not claimed to be reproducible builds of the ZIP commit. Only macOS system frameworks are linked; no installer, launch agent or global configuration is added.

| File | SHA256 |
| --- | --- |
| kankan-video-analyzer | e9c925caa0d485466debb87e772dcb27a639cf1778c64b85b8de8f88a76a62e5 |
| kankan-sensevoice | 08f91e91cb521f71b2c7ef92ce2220db5c3741bc0dbfcdb14156bc35c09c4984 |

The imported application source remains under AGPL-3.0-or-later. Native model/runtime notices accompany these files. Video transcription first uses macOS speech recognition. On unsupported system engines, SenseVoice may download its pinned model assets (about 256 MB); downloads are SHA256-verified and remain in the collection data directory. Inputs stay local. Processes have bounded output and a job deadline, with process-group termination on timeout.

## Local recycle mover

`recycle-move` is our local build of the adjacent `recycle-move.c`, not imported from KanKan. Build: `/usr/bin/xcrun clang -O2 -Wall -Wextra -Werror server/collection/native/recycle-move.c -o server/collection/native/recycle-move`. SHA256: `7dea7fac0ca7bb17e6d700eeb57483562634cc9b2ab72ed4ff9176cf98c2a07b`. It opens canonical parent directories component-by-component without following links, checks supplied directory identities, and calls macOS `renameatx_np(..., RENAME_EXCL)` to reject even a concurrently created empty destination. No shell, dependency, installer, persistent process, network, or global configuration. Unsupported systems/filesystems fail closed; no ordinary overwrite-capable rename fallback. The service verifies the binary hash before each invocation and bounds runtime/output.

Primary reference: [Apple exclusive-renaming capability](https://developer.apple.com/documentation/foundation/urlresourcevalues/volumesupportsexclusiverenaming) and the installed macOS SDK `sys/stdio.h` declarations.

