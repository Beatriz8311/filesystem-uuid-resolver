import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveByDir,
  createResolver,
  readByDir,
  DEFAULT_BY_UUID_DIR,
  DEFAULT_BY_LABEL_DIR,
} from '../src/core.js';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let scratch;

function makeFixture() {
  scratch = mkdtempSync(join(tmpdir(), 'fsuuid-'));
  // Create a fake device node the symlinks can point at.
  writeFileSync(join(scratch, 'sda1'), '');
  writeFileSync(join(scratch, 'sdb2'), '');
  writeFileSync(join(scratch, 'nvme0n1p1'), '');

  const byUuid = join(scratch, 'by-uuid');
  const byLabel = join(scratch, 'by-label');
  mkdirSync(byUuid);
  mkdirSync(byLabel);

  // Point at ../sda1 so resolve() produces an absolute path.
  symlinkSync('../sda1', join(byUuid, '550e8400-e29b-41d4-a716-446655440000'), 'file');
  symlinkSync('../sdb2', join(byUuid, '11111111-2222-3333-4444-555555555555'), 'file');
  symlinkSync('../nvme0n1p1', join(byLabel, 'root'), 'file');
  // A deliberately broken symlink — target does not exist.
  symlinkSync('../ghost-device', join(byUuid, 'deadbeef-0000-0000-0000-000000000000'), 'file');
  return { scratch, byUuid, byLabel };
}

test('resolveByDir returns an absolute path for a valid symlink', () => {
  const { byUuid, scratch } = makeFixture();
  try {
    const got = resolveByDir(byUuid, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(got, join(scratch, 'sda1'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('resolveByDir returns null when the identifier is absent', () => {
  const { byUuid, scratch } = makeFixture();
  try {
    assert.equal(resolveByDir(byUuid, 'does-not-exist'), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('resolveByDir returns null when the directory does not exist', () => {
  assert.equal(resolveByDir('/no/such/dir', 'whatever'), null);
});

test('resolveByDir returns null for a non-symlink entry', () => {
  const { byUuid, scratch } = makeFixture();
  try {
    writeFileSync(join(byUuid, 'plain-file'), 'not a symlink');
    assert.equal(resolveByDir(byUuid, 'plain-file'), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('resolveByDir throws TypeError on empty identifier', () => {
  assert.throws(() => resolveByDir('/dev/disk/by-uuid', ''), TypeError);
});

test('resolveByDir throws TypeError on empty dir', () => {
  assert.throws(() => resolveByDir('', 'uuid'), TypeError);
});

test('createResolver uses custom directories', () => {
  const { byUuid, byLabel, scratch } = makeFixture();
  try {
    const r = createResolver({ byUuidDir: byUuid, byLabelDir: byLabel });
    assert.equal(r.resolveUuid('550e8400-e29b-41d4-a716-446655440000'), join(scratch, 'sda1'));
    assert.equal(r.resolveLabel('root'), join(scratch, 'nvme0n1p1'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('createResolver returns null for unknown uuid and label', () => {
  const { byUuid, byLabel, scratch } = makeFixture();
  try {
    const r = createResolver({ byUuidDir: byUuid, byLabelDir: byLabel });
    assert.equal(r.resolveUuid('nope'), null);
    assert.equal(r.resolveLabel('nope'), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('createResolver.listUuids returns all valid mappings', () => {
  const { byUuid, byLabel, scratch } = makeFixture();
  try {
    const r = createResolver({ byUuidDir: byUuid, byLabelDir: byLabel });
    const uuids = r.listUuids();
    assert.equal(uuids['550e8400-e29b-41d4-a716-446655440000'], join(scratch, 'sda1'));
    assert.equal(uuids['11111111-2222-3333-4444-555555555555'], join(scratch, 'sdb2'));
    // The broken symlink is silently skipped.
    assert.equal(uuids['deadbeef-0000-0000-0000-000000000000'], undefined);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('createResolver.listLabels returns all valid mappings', () => {
  const { byUuid, byLabel, scratch } = makeFixture();
  try {
    const r = createResolver({ byUuidDir: byUuid, byLabelDir: byLabel });
    const labels = r.listLabels();
    assert.equal(labels['root'], join(scratch, 'nvme0n1p1'));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('createResolver with defaults has the right directory paths', () => {
  const r = createResolver();
  assert.equal(r.byUuidDir, DEFAULT_BY_UUID_DIR);
  assert.equal(r.byLabelDir, DEFAULT_BY_LABEL_DIR);
});

test('createResolver.listUuids returns empty object when directory is absent', () => {
  const r = createResolver({ byUuidDir: '/no/such/uuid/dir', byLabelDir: '/no/such/label/dir' });
  assert.deepEqual(r.listUuids(), {});
  assert.deepEqual(r.listLabels(), {});
});

test('readByDir returns a Map and skips broken symlinks', () => {
  const { byUuid, scratch } = makeFixture();
  try {
    const map = readByDir(byUuid);
    assert.equal(map.get('550e8400-e29b-41d4-a716-446655440000'), join(scratch, 'sda1'));
    assert.equal(map.get('11111111-2222-3333-4444-555555555555'), join(scratch, 'sdb2'));
    assert.equal(map.get('deadbeef-0000-0000-0000-000000000000'), undefined);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('readByDir returns empty Map for missing directory', () => {
  const map = readByDir('/no/such/dir/anywhere');
  assert.equal(map.size, 0);
});
