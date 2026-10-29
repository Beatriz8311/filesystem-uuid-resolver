import { readdirSync, readlinkSync, lstatSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

export const DEFAULT_BY_UUID_DIR = '/dev/disk/by-uuid';
export const DEFAULT_BY_LABEL_DIR = '/dev/disk/by-label';

/**
 * Read a directory and return a Map from entry name → canonical device path.
 *
 * Each entry in a by-xxx directory is a symlink whose name is the identifier
 * (UUID or label) and whose target is the real device node, e.g.
 *   /dev/disk/by-uuid/550e8400-e29b-41d4-a716-446655440000 -> ../../sda1
 * We resolve the symlink relative to the directory so the caller gets an
 * absolute path like /dev/sda1 rather than a fragile relative one.
 *
 * If the directory does not exist (common in containers and CI), we return
 * an empty Map instead of throwing. This lets callers fall back to other
 * strategies without a try/catch around every lookup.
 */
export function readByDir(dir) {
  const map = new Map();
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return map;
  }
  for (const ent of entries) {
    if (ent.isSymbolicLink()) {
      try {
        const linkTarget = readlinkSync(join(dir, ent.name));
        const resolved = resolve(dir, linkTarget);
        if (existsSync(resolved)) {
          map.set(ent.name, resolved);
        }
      } catch (_err) {
        // A broken symlink is skipped rather than fatal. The device may
        // have been removed between readdir and readlink.
      }
    }
  }
  return map;
}

/**
 * Look up a single identifier in a by-xxx directory.
 *
 * Returns the canonical absolute device path, or null if the identifier is
 * not found or the directory is absent. A real device path always starts
 * with /, so null is unambiguous.
 */
export function resolveByDir(dir, identifier) {
  if (typeof dir !== 'string' || dir.length === 0) {
    throw new TypeError('dir must be a non-empty string');
  }
  if (typeof identifier !== 'string' || identifier.length === 0) {
    throw new TypeError('identifier must be a non-empty string');
  }
  let st;
  try {
    st = lstatSync(join(dir, identifier));
  } catch (_err) {
    return null;
  }
  if (!st.isSymbolicLink()) {
    return null;
  }
  const linkTarget = readlinkSync(join(dir, identifier));
  const resolved = resolve(dir, linkTarget);
  if (!existsSync(resolved)) {
    return null;
  }
  return resolved;
}

/**
 * Factory that binds the two default directories and exposes focused helpers.
 *
 * We bind the paths at construction time so callers can point at a fixture
 * directory in tests while production code uses the real /dev/disk paths.
 * The resolver never caches — device topology can change at runtime and a
 * stale cache would return a path to a device that was replaced.
 */
export function createResolver(opts = {}) {
  const byUuidDir = opts.byUuidDir ?? DEFAULT_BY_UUID_DIR;
  const byLabelDir = opts.byLabelDir ?? DEFAULT_BY_LABEL_DIR;

  return {
    /**
     * Resolve a filesystem UUID to /dev/sdXN (or whatever the symlink points at).
     * Returns null when the UUID is unknown.
     */
    resolveUuid(uuid) {
      return resolveByDir(byUuidDir, uuid);
    },

    /**
     * Resolve a filesystem label to its device path.
     * Returns null when the label is unknown.
     */
    resolveLabel(label) {
      return resolveByDir(byLabelDir, label);
    },

    /**
     * Return every UUID → device-path mapping currently visible.
     * Returns an empty object when the by-uuid directory is absent.
     */
    listUuids() {
      return Object.fromEntries(readByDir(byUuidDir));
    },

    /**
     * Return every label → device-path mapping currently visible.
     * Returns an empty object when the by-label directory is absent.
     */
    listLabels() {
      return Object.fromEntries(readByDir(byLabelDir));
    },

    /** The directory this resolver reads for UUIDs. Exposed for debugging. */
    get byUuidDir() {
      return byUuidDir;
    },

    /** The directory this resolver reads for labels. Exposed for debugging. */
    get byLabelDir() {
      return byLabelDir;
    },
  };
}
