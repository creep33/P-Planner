// Run: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal in-memory chrome.storage.sync mock.
let data = {};
const listeners = [];
globalThis.chrome = {
  storage: {
    sync: {
      async get(keys) {
        if (keys === null) return structuredClone(data);
        return Object.fromEntries([].concat(keys).filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
      },
      async set(items) {
        for (const [k, v] of Object.entries(items)) {
          if (JSON.stringify(v).length > 8192) throw new Error('QUOTA_BYTES_PER_ITEM quota exceeded');
          data[k] = structuredClone(v);
        }
        listeners.forEach((cb) => cb(items, 'sync'));
      },
      async remove(keys) {
        for (const k of [].concat(keys)) delete data[k];
      },
    },
    onChanged: { addListener: (cb) => listeners.push(cb) },
  },
};

const store = await import('../extension/store.js');
const H = 3600000;
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

beforeEach(() => {
  data = {};
});

test('splitByDay cuts sessions at local midnight', () => {
  const parts = store.splitByDay(at(2026, 10, 13, 22), at(2026, 10, 14, 1, 30));
  assert.deepEqual(parts, { '2026-10-13': 2 * H, '2026-10-14': 1.5 * H });
});

test('mondayKey starts the week on Monday', () => {
  assert.equal(store.mondayKey(at(2026, 10, 14)), '2026-10-12'); // Wednesday
  assert.equal(store.mondayKey(at(2026, 10, 18)), '2026-10-12'); // Sunday
  assert.equal(store.mondayKey(at(2026, 10, 12)), '2026-10-12'); // Monday
});

test('totals include the live part of a running timer', () => {
  const now = at(2026, 10, 14, 12);
  const p = { runningSince: at(2026, 10, 14, 10) };
  const t = store.totals(p, { '2026-10-14': H, '2026-10-12': H, '2026-10-01': H, '2026-09': 5 * H }, now);
  assert.equal(t.today, 3 * H);
  assert.equal(t.week, 4 * H);
  assert.equal(t.total, 10 * H);
});

test('start/stop persists closed time per day', async () => {
  const p = await store.createProject('  Cliente A  ');
  assert.equal(p.name, 'Cliente A');
  await store.start(p.id);
  const [running] = await store.loadAll();
  assert.ok(running.runningSince);
  data[`p:${p.id}`].runningSince = Date.now() - 90 * 60000; // pretend it ran 90 minutes
  await store.stop(p.id);
  const [stopped] = await store.loadAll();
  assert.equal(stopped.runningSince, null);
  const total = Object.values(stopped.days).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 90 * 60000) < 1000);
});

test('manual adjustments add, subtract and never go below zero', async () => {
  const p = await store.createProject('B');
  await store.addManual(p.id, 2 * H, '2026-10-14');
  await store.addManual(p.id, -0.5 * H, '2026-10-14');
  assert.equal(data[`d:${p.id}`]['2026-10-14'], 1.5 * H);
  await store.addManual(p.id, -5 * H, '2026-10-14');
  assert.equal(data[`d:${p.id}`]['2026-10-14'], undefined);
});

test('compact folds old months so the item stays under the per-item quota', () => {
  const days = {};
  for (let i = 0; i < 400; i++) days[store.dateKey(at(2025, 1, 1) + i * 86400000)] = H;
  const out = store.compact(days, at(2026, 10, 14));
  assert.ok(JSON.stringify(out).length <= 7000);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.equal(sum(out), sum(days));
  assert.ok(Object.keys(out).some((k) => k.length === 7));
});

test('rename and delete', async () => {
  const p = await store.createProject('Viejo');
  await store.addManual(p.id, H, '2026-10-14');
  await store.renameProject(p.id, 'Nuevo');
  assert.equal((await store.loadAll())[0].name, 'Nuevo');
  await store.deleteProject(p.id);
  assert.deepEqual(data, {});
});

test('JSON export/import round trip replaces existing data', async () => {
  const a = await store.createProject('A');
  await store.addManual(a.id, H, '2026-10-14');
  const backup = JSON.parse(store.toJSON(await store.loadAll()));
  await store.createProject('Sobra');
  await store.importData(backup);
  const all = await store.loadAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].name, 'A');
  assert.deepEqual(all[0].days, { '2026-10-14': H });
  await assert.rejects(store.importData({ nope: true }));
});

test('CSV uses semicolons, decimal comma and neutralises formulas', () => {
  const csv = store.toCSV([{ name: '=SUM(A1)', runningSince: null, days: { '2026-10-14': 1.5 * H } }]);
  assert.equal(csv, "﻿Proyecto;Fecha;Minutos;Horas\r\n'=SUM(A1);2026-10-14;90;1,50");
});

test('formatters', () => {
  assert.equal(store.fmtShort(3 * H + 5 * 60000), '3h 05m');
  assert.equal(store.fmtClock(25 * H + 61000), '25:01:01');
});
