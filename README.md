# filesystem-uuid-resolver

Resolves filesystem UUIDs and labels to canonical device paths by reading the symlinks under `/dev/disk/by-uuid` and `/dev/disk/by-label`.

```js
import { createResolver } from 'filesystem-uuid-resolver';

const r = createResolver();

r.resolveUuid('550e8400-e29b-41d4-a716-446655440000'); // → "/dev/sda1"
r.resolveLabel('root');                              // → "/dev/sda1"
r.listUuids();  // → { "550e8400-…": "/dev/sda1", … }
r.listLabels(); // → { "root": "/dev/sda1", … }
```

The lower-level `resolveByDir(dir, identifier)` and `readByDir(dir)` functions are also exported for callers that want to probe a non-standard directory without constructing a resolver.

## Why this exists

On Linux, `/dev/disk/by-uuid` and `/dev/disk/by-label` are maintained by udev and provide a stable, human-meaningful handle for a filesystem regardless of the order devices were probed at boot. Parsing `blkid` output or shelling out to `lsblk` is fragile across distributions and locales. Reading the symlinks directly is the simplest approach that needs no privileges and no external binaries.

The trade-off: this library only works on systems where udev populates those directories. It does not fall back to `blkid`. If the directories are absent — common in minimal containers — every lookup returns `null` and `listUuids()` / `listLabels()` return `{}`. That is intentional and silent: a missing directory is the normal state in CI, not an error worth throwing over.

## The awkward edge

A broken symlink (the device was removed but udev has not cleaned up yet) is silently skipped by `readByDir` and causes `resolveByDir` to return `null`. This matches `ls /dev/disk/by-uuid` behaviour, where the entry appears but cannot be followed. If you need to distinguish "UUID never existed" from "device was hot-removed", this library does not expose that distinction — both yield `null`.

The directories and identifiers are treated as case-sensitive opaque strings. No validation is performed on UUID format, because labels have no format and udev does not enforce casing rules on UUIDs either.
