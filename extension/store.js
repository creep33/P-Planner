// Storage layer + time logic shared by popup and background.
// Data lives in chrome.storage.sync so Brave/Chrome Sync carries it across devices.
//   p:<id> -> { id, name, createdAt, runningSince }   project + running state
//   d:<id> -> { "YYYY-MM-DD": ms, "YYYY-MM": ms }     closed time per day (month buckets after compaction)

const P = 'p:';
const D = 'd:';
const ITEM_SOFT_LIMIT = 7000; // storage.sync hard limit is 8192 bytes per item
const area = () => chrome.storage.sync;
const isOurKey = (k) => k.startsWith(P) || k.startsWith(D);

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

// ---- storage ----

export async function loadAll() {
  const all = await area().get(null);
  const projects = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(P)) projects.push({ ...v, days: all[D + v.id] || {} });
  }
  return projects.sort((a, b) => a.createdAt - b.createdAt);
}

async function getProject(id) {
  const res = await area().get([P + id, D + id]);
  if (!res[P + id]) throw new Error('Project no longer exists');
  return { project: res[P + id], days: res[D + id] || {} };
}

export async function createProject(name) {
  const id = crypto.randomUUID().slice(0, 8);
  const project = { id, name: name.trim().slice(0, 60), createdAt: Date.now(), runningSince: null };
  await area().set({ [P + id]: project });
  return project;
}

export async function renameProject(id, name) {
  const { project } = await getProject(id);
  await area().set({ [P + id]: { ...project, name: name.trim().slice(0, 60) } });
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

export function toJSON(projects) {
  return JSON.stringify(
    {
      app: 'p-planner',
      version: 1,
      exportedAt: new Date().toISOString(),
      projects: projects.map(({ id, name, createdAt, runningSince, days }) => ({ id, name, createdAt, runningSince, days })),
    },
    null,
    2,
  );
}

// Replaces all current data with the backup's contents.
export async function importData(data) {
  if (!data || !Array.isArray(data.projects)) throw new Error('Invalid file');
  const items = {};
  for (const p of data.projects) {
    if (typeof p.id !== 'string' || !p.id || typeof p.name !== 'string') throw new Error('Invalid project in file');
    const days = {};
    for (const [k, v] of Object.entries(p.days || {})) {
      if (/^\d{4}-\d{2}(-\d{2})?$/.test(k) && Number.isFinite(v) && v > 0) days[k] = Math.round(v);
    }
    items[P + p.id] = {
      id: p.id,
      name: p.name.trim().slice(0, 60) || 'Untitled',
      createdAt: Number.isFinite(p.createdAt) ? p.createdAt : Date.now(),
      runningSince: Number.isFinite(p.runningSince) ? p.runningSince : null,
    };
    if (Object.keys(days).length) items[D + p.id] = compact(days);
  }
  const old = Object.keys(await area().get(null)).filter(isOurKey);
  await area().set(items);
  const stale = old.filter((k) => !(k in items));
  if (stale.length) await area().remove(stale);
}
