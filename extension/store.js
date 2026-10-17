// Storage layer + time logic shared by popup and background.
// Data lives in chrome.storage.sync so Brave/Chrome Sync carries it across devices.
//   p:<id> -> { id, name, createdAt, runningSince, folderId }   project + running state
//   d:<id> -> { "YYYY-MM-DD": ms, "YYYY-MM": ms }               closed time per day (month buckets after compaction)
//   f:<id> -> { id, name, createdAt, parentId }                  folder (nested via parentId, null = root)

const P = 'p:';
const D = 'd:';
const F = 'f:';
const ITEM_SOFT_LIMIT = 7000; // storage.sync hard limit is 8192 bytes per item
const area = () => chrome.storage.sync;
const isOurKey = (k) => k.startsWith(P) || k.startsWith(D) || k.startsWith(F);
const newId = () => crypto.randomUUID().slice(0, 8);
const cleanName = (name) => name.trim().slice(0, 60);
const newestFirst = (a, b) => b.createdAt - a.createdAt;

const pad = (n) => String(n).padStart(2, '0');

export function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function mondayKey(ts) {
  const d = new Date(ts);
  const offset = (d.getDay() + 6) % 7;
  return dateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime());
}

// Split [start, end) into per-local-day chunks: { "YYYY-MM-DD": ms }.
export function splitByDay(start, end) {
  const out = {};
  let t = start;
  while (t < end) {
    const d = new Date(t);
    const nextMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(nextMidnight, end);
    const k = dateKey(t);
    out[k] = (out[k] || 0) + (stop - t);
    t = stop;
  }
  return out;
}

function addInto(days, extra) {
  for (const [k, ms] of Object.entries(extra)) days[k] = (days[k] || 0) + ms;
  return days;
}

// Fold the oldest months of daily entries into "YYYY-MM" buckets until the item fits.
export function compact(days, now = Date.now()) {
  const out = { ...days };
  const currentMonth = dateKey(now).slice(0, 7);
  while (JSON.stringify(out).length > ITEM_SOFT_LIMIT) {
    const oldest = Object.keys(out)
      .filter((k) => k.length === 10 && k.slice(0, 7) < currentMonth)
      .sort()[0];
    if (!oldest) break;
    const month = oldest.slice(0, 7);
    for (const k of Object.keys(out)) {
      if (k.length === 10 && k.startsWith(month)) {
        out[month] = (out[month] || 0) + out[k];
        delete out[k];
      }
    }
  }
  return out;
}

// Totals including the live part of a running timer.
export function totals(project, days = {}, now = Date.now()) {
  const merged = { ...days };
  if (project.runningSince) addInto(merged, splitByDay(project.runningSince, now));
  const today = dateKey(now);
  const monday = mondayKey(now);
  let total = 0;
  let week = 0;
  for (const [k, ms] of Object.entries(merged)) {
    total += ms;
    if (k.length === 10 && k >= monday && k <= today) week += ms;
  }
  return { total, today: merged[today] || 0, week, days: merged };
}

export function fmtShort(ms) {
  const min = Math.floor(Math.max(0, ms) / 60000);
  return `${Math.floor(min / 60)}h ${pad(min % 60)}m`;
}

export function fmtClock(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}

// ---- folders (pure) ----

export function childFolders(folders, parentId) {
  return folders.filter((f) => (f.parentId ?? null) === parentId);
}

// The folder plus everything nested under it. Set-based, so bad data with cycles can't loop forever.
export function descendantFolderIds(folders, id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (!ids.has(f.id) && ids.has(f.parentId)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function folderPath(folders, id) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const names = [];
  const seen = new Set();
  for (let f = byId.get(id); f && !seen.has(f.id); f = byId.get(f.parentId)) {
    seen.add(f.id);
    names.unshift(f.name);
  }
  return names.join(' / ');
}

// Sum of every project inside the folder, subfolders included.
export function folderTotals(folderId, projects, folders, now = Date.now()) {
  const ids = descendantFolderIds(folders, folderId);
  const out = { total: 0, today: 0, week: 0, running: 0 };
  for (const p of projects) {
    if (!ids.has(p.folderId)) continue;
    const t = totals(p, p.days, now);
    out.total += t.total;
    out.today += t.today;
    out.week += t.week;
    if (p.runningSince) out.running++;
  }
  return out;
}

// Links to folders that no longer exist (e.g. deleted on another device) and parent cycles fall back to root.
function normalize(projects, folders) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const f of folders) if (!byId.has(f.parentId)) f.parentId = null;
  for (const f of folders) {
    const seen = new Set([f.id]);
    for (let up = byId.get(f.parentId); up; up = byId.get(up.parentId)) {
      if (seen.has(up.id)) {
        f.parentId = null;
        break;
      }
      seen.add(up.id);
    }
  }
  for (const p of projects) if (!byId.has(p.folderId)) p.folderId = null;
}

// ---- storage ----

export async function loadAll() {
  const all = await area().get(null);
  const projects = [];
  const folders = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(P)) projects.push({ ...v, days: all[D + v.id] || {} });
    else if (k.startsWith(F)) folders.push({ ...v });
  }
  normalize(projects, folders);
  return { projects: projects.sort(newestFirst), folders: folders.sort(newestFirst) };
}

async function getProject(id) {
  const res = await area().get([P + id, D + id]);
  if (!res[P + id]) throw new Error('Project no longer exists');
  return { project: res[P + id], days: res[D + id] || {} };
}

async function getFolder(id) {
  const res = await area().get(F + id);
  if (!res[F + id]) throw new Error('Folder no longer exists');
  return res[F + id];
}

export async function createProject(name, folderId = null) {
  const project = { id: newId(), name: cleanName(name), createdAt: Date.now(), runningSince: null, folderId: folderId || null };
  await area().set({ [P + project.id]: project });
  return project;
}

export async function renameProject(id, name) {
  const { project } = await getProject(id);
  await area().set({ [P + id]: { ...project, name: cleanName(name) } });
}

export async function moveProject(id, folderId) {
  const { project } = await getProject(id);
  await area().set({ [P + id]: { ...project, folderId: folderId || null } });
}

export async function createFolder(name, parentId = null) {
  const folder = { id: newId(), name: cleanName(name), createdAt: Date.now(), parentId: parentId || null };
  await area().set({ [F + folder.id]: folder });
  return folder;
}

export async function renameFolder(id, name) {
  const folder = await getFolder(id);
  await area().set({ [F + id]: { ...folder, name: cleanName(name) } });
}

export async function moveFolder(id, parentId) {
  const target = parentId || null;
  const { folders } = await loadAll();
  if (target && descendantFolderIds(folders, id).has(target)) throw new Error("A folder can't go inside itself");
  const folder = await getFolder(id);
  await area().set({ [F + id]: { ...folder, parentId: target } });
}

// Deletes the folder, its subfolders and every project (and logged time) inside them.
export async function deleteFolder(id) {
  const { projects, folders } = await loadAll();
  const ids = descendantFolderIds(folders, id);
  const keys = [...ids].map((f) => F + f);
  for (const p of projects) if (ids.has(p.folderId)) keys.push(P + p.id, D + p.id);
  await area().remove(keys);
}

export async function deleteProject(id) {
  await area().remove([P + id, D + id]);
}

export async function start(id) {
  const { project } = await getProject(id);
  if (project.runningSince) return;
  await area().set({ [P + id]: { ...project, runningSince: Date.now() } });
}

export async function stop(id) {
  const { project, days } = await getProject(id);
  if (!project.runningSince) return;
  const now = Date.now();
  const merged = compact(addInto({ ...days }, splitByDay(project.runningSince, now)), now);
  await area().set({ [P + id]: { ...project, runningSince: null }, [D + id]: merged });
}

// ms may be negative to correct mistakes; a day never drops below zero.
export async function addManual(id, ms, date) {
  const { days } = await getProject(id);
  const next = { ...days };
  const value = Math.max(0, (next[date] || 0) + ms);
  if (value) next[date] = value;
  else delete next[date];
  await area().set({ [D + id]: compact(next) });
}

export function onChange(cb) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && Object.keys(changes).some(isOurKey)) cb(changes);
  });
}

// ---- backup / restore ----

export function toJSON({ projects, folders }) {
  return JSON.stringify(
    {
      app: 'p-planner',
      version: 2,
      exportedAt: new Date().toISOString(),
      folders: folders.map(({ id, name, createdAt, parentId }) => ({ id, name, createdAt, parentId })),
      projects: projects.map(({ id, name, createdAt, runningSince, folderId, days }) => ({ id, name, createdAt, runningSince, folderId, days })),
    },
    null,
    2,
  );
}

// Replaces all current data with the backup's contents. Accepts v1 backups (no folders) too.
export async function importData(data) {
  if (!data || !Array.isArray(data.projects)) throw new Error('Invalid file');
  const validId = (id) => typeof id === 'string' && id.length > 0;
  const items = {};
  for (const f of Array.isArray(data.folders) ? data.folders : []) {
    if (!validId(f.id) || typeof f.name !== 'string') throw new Error('Invalid folder in file');
    items[F + f.id] = {
      id: f.id,
      name: cleanName(f.name) || 'Untitled',
      createdAt: Number.isFinite(f.createdAt) ? f.createdAt : Date.now(),
      parentId: validId(f.parentId) ? f.parentId : null,
    };
  }
  const isFolder = (id) => validId(id) && F + id in items;
  for (const k of Object.keys(items)) if (!isFolder(items[k].parentId)) items[k].parentId = null;
  for (const p of data.projects) {
    if (!validId(p.id) || typeof p.name !== 'string') throw new Error('Invalid project in file');
    const days = {};
    for (const [k, v] of Object.entries(p.days || {})) {
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(k) && Number.isFinite(v) && v > 0) days[k] = Math.round(v);
    }
    items[P + p.id] = {
      id: p.id,
      name: cleanName(p.name) || 'Untitled',
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
      runningSince: Number.isFinite(p.runningSince) ? p.runningSince : null,
      folderId: isFolder(p.folderId) ? p.folderId : null,
    };
    if (Object.keys(days).length) items[D + p.id] = compact(days);
  }
  const old = Object.keys(await area().get(null)).filter(isOurKey);
  await area().set(items);
  const stale = old.filter((k) => !(k in items));
  if (stale.length) await area().remove(stale);
}
