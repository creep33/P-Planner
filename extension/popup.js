import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const isTab = new URLSearchParams(location.search).has('tab');
if (isTab) document.body.classList.add('tab');

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>';
const ICON_FOLDER = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" fill="currentColor"/></svg>';
const ICON_CHEVRON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let projects = [];
let folders = [];
let currentFolder = null; // folder shown in the list view, null = root
let currentId = null; // project shown in the detail view
let settingsOpen = false; // folder settings panel
let ticker = null;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), isError ? 4000 : 2000);
}

async function run(fn) {
  try {
    await fn();
  } catch (err) {
    console.error(err);
    const quota = /quota/i.test(err?.message || '');
    toast(quota ? 'Sync limit reached, wait a moment' : err?.message || 'Error', true);
  }
}

async function refresh() {
  ({ projects, folders } = await store.loadAll());
  render();
}

const current = () => projects.find((p) => p.id === currentId);
const folderById = (id) => folders.find((f) => f.id === id);

// Remembered per device only, so it never touches sync quota.
function saveLocation() {
  try {
    chrome.storage.local.set({ lastFolder: currentFolder }).catch(() => {});
  } catch {}
}

function openFolder(id) {
  currentFolder = id;
  currentId = null;
  settingsOpen = false;
  saveLocation();
  render();
}

// <option>s for every folder by path, optionally leaving out a subtree.
function fillFolderSelect(select, selected, { exclude = new Set(), none = 'No folder' } = {}) {
  const options = folders
    .filter((f) => !exclude.has(f.id))
    .map((f) => ({ id: f.id, path: store.folderPath(folders, f.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));
  select.replaceChildren(
    el('option', { value: '', textContent: none }),
    ...options.map((o) => el('option', { value: o.id, textContent: o.path })),
  );
  select.value = selected || '';
}

// ---- rendering ----

function render() {
  if (currentId && !current()) currentId = null; // deleted (maybe from another device)
  if (currentFolder && !folderById(currentFolder)) currentFolder = null;
  $('list-view').hidden = !!currentId;
  $('detail-view').hidden = !currentId;
  if (currentId) renderDetail();
  else renderList();
  updateTimes();
  const anyRunning = projects.some((p) => p.runningSince);
  if (anyRunning && !ticker) ticker = setInterval(updateTimes, 1000);
  if (!anyRunning && ticker) ticker = clearInterval(ticker);
}

function renderList() {
  const folder = folderById(currentFolder);
  const subFolders = store.childFolders(folders, currentFolder);
  const here = projects.filter((p) => p.folderId === currentFolder);

  $('up').hidden = !folder;
  const title = $('l-title'); // null while the rename input is open
  if (title) {
    title.textContent = folder ? folder.name : 'P-Planner';
    title.classList.toggle('editable', !!folder);
    title.title = folder ? `${store.folderPath(folders, folder.id)} · click to rename` : '';
  }
  $('folder-info').hidden = !folder;
  $('f-settings-btn').hidden = !folder;
  $('f-settings-btn').classList.toggle('active', settingsOpen);
  $('f-settings-btn').setAttribute('aria-expanded', String(settingsOpen));
  $('f-settings').hidden = !folder || !settingsOpen;
  if (folder) {
    fillFolderSelect($('f-parent'), folder.parentId, { exclude: store.descendantFolderIds(folders, folder.id), none: 'Top level' });
  }
  $('new-form').hidden = !!folder; // projects and folders are only created at the top level
  $('root-foot').hidden = !!folder;
  $('folder-foot').hidden = !folder;

  const running = projects.filter((p) => p.runningSince).length;
  $('running-pill').hidden = !running || !!folder;
  $('running-pill').textContent = `${running} running`;

  $('empty').hidden = subFolders.length + here.length > 0;
  $('empty').textContent = folder
    ? 'Empty folder. Move projects here from their detail view.'
    : 'No projects yet. Create one above.';

  const folderRows = subFolders.map((f) => {
    const t = store.folderTotals(f.id, projects, folders);
    const li = el(
      'li',
      { className: t.running ? 'proj folder running' : 'proj folder' },
      el('span', { className: 'folder-icon', innerHTML: ICON_FOLDER }),
      el('div', { className: 'info' }, el('span', { className: 'name', textContent: f.name, title: f.name }), el('span', { className: 'sub' })),
      el('span', { className: 'total' }),
      el('span', { className: 'chev', innerHTML: ICON_CHEVRON }),
    );
    li.dataset.folder = f.id;
    return li;
  });

  const projectRows = here.map((p) => {
    const play = el('button', {
      className: 'play',
      type: 'button',
      title: p.runningSince ? 'Stop' : 'Start',
      innerHTML: p.runningSince ? ICON_STOP : ICON_PLAY,
    });
    play.dataset.act = 'toggle';
    const li = el(
      'li',
      { className: p.runningSince ? 'proj running' : 'proj' },
      el('div', { className: 'info' }, el('span', { className: 'name', textContent: p.name, title: p.name }), el('span', { className: 'sub' })),
      el('span', { className: 'total' }),
      play,
    );
    li.dataset.id = p.id;
    return li;
  });

  $('projects').replaceChildren(...folderRows, ...projectRows);
}

function renderDetail() {
  const p = current();
  $('detail-view').classList.toggle('running', !!p.runningSince);
  $('d-toggle').textContent = p.runningSince ? 'Stop' : 'Start';
  fillFolderSelect($('d-folder'), p.folderId);
  const h1 = $('d-name'); // null while the rename input is open
  if (h1) {
    h1.textContent = p.name;
    h1.title = `${p.name} · click to rename`;
  }
}

function dayLabel(key) {
  if (key.length === 7) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Only touches text so clicks and inputs are never disturbed by the 1s tick.
function updateTimes() {
  const now = Date.now();
  if (!currentId) {
    for (const li of $('projects').children) {
      if (li.dataset.folder) {
        const t = store.folderTotals(li.dataset.folder, projects, folders, now);
        li.querySelector('.total').textContent = store.fmtShort(t.total);
        li.querySelector('.sub').textContent = `${t.running ? `${t.running} running · ` : ''}Today ${store.fmtShort(t.today)}`;
        continue;
      }
      const p = projects.find((x) => x.id === li.dataset.id);
      if (!p) continue;
      const t = store.totals(p, p.days, now);
      li.querySelector('.total').textContent = store.fmtShort(t.total);
      li.querySelector('.sub').textContent = `Today ${store.fmtShort(t.today)}`;
    }
    if (currentFolder) {
      const t = store.folderTotals(currentFolder, projects, folders, now);
      $('f-total').textContent = store.fmtShort(t.total);
      $('f-today').textContent = store.fmtShort(t.today);
      $('f-week').textContent = store.fmtShort(t.week);
    }
    return;
  }
  const p = current();
  const t = store.totals(p, p.days, now);
  $('d-clock').textContent = store.fmtClock(t.total);
  $('d-today').textContent = store.fmtShort(t.today);
  $('d-week').textContent = store.fmtShort(t.week);
  const keys = Object.keys(t.days).filter((k) => t.days[k] > 0).sort().reverse().slice(0, 14);
  $('d-days').replaceChildren(
    ...(keys.length
      ? keys.map((k) => el('li', {}, el('span', { textContent: dayLabel(k) }), el('strong', { textContent: store.fmtShort(t.days[k]) })))
      : [el('li', {}, el('span', { className: 'muted', textContent: 'No time logged' }))]),
  );
}

function openDetail(id) {
  currentId = id;
  $('manual-form').reset();
  $('m-date').value = store.dateKey(Date.now());
  render();
}

// Swaps a heading for an input; Enter or blur saves, Escape cancels.
function inlineRename(h1, save) {
  const input = el('input', { className: 'rename', value: h1.textContent, maxLength: 60 });
  h1.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (ok) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.replaceWith(h1);
    if (ok && name && name !== h1.textContent) {
      h1.textContent = name;
      run(async () => {
        await save(name);
        await refresh();
      });
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

// Two-step confirm (native dialogs are unreliable inside extension popups).
function confirmClick(btn, armedLabel, action) {
  const label = btn.textContent;
  let timer = null;
  const disarm = () => {
    clearTimeout(timer);
    timer = null;
    btn.textContent = label;
    btn.classList.remove('armed');
  };
  btn.addEventListener('click', () => {
    if (!timer) {
      btn.textContent = armedLabel;
      btn.classList.add('armed');
      timer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    action();
  });
}

// ---- list view ----

function newName() {
  const name = $('new-name').value.trim();
  if (!name) {
    $('new-name').focus();
    toast('Type a name first', true);
  }
  return name;
}

$('new-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = newName();
  if (!name) return;
  run(async () => {
    await store.createProject(name);
    $('new-name').value = '';
    await refresh();
  });
});

$('new-folder').addEventListener('click', () => {
  const name = newName();
  if (!name) return;
  run(async () => {
    await store.createFolder(name);
    $('new-name').value = '';
    await refresh();
  });
});

$('projects').addEventListener('click', (e) => {
  const li = e.target.closest('li.proj');
  if (!li) return;
  if (li.dataset.folder) return openFolder(li.dataset.folder);
  const p = projects.find((x) => x.id === li.dataset.id);
  if (!p) return;
  if (e.target.closest('[data-act="toggle"]')) {
    run(async () => {
      await (p.runningSince ? store.stop(p.id) : store.start(p.id));
      await refresh();
    });
  } else {
    openDetail(p.id);
  }
});

$('up').addEventListener('click', () => openFolder(folderById(currentFolder)?.parentId ?? null));

$('l-title').addEventListener('click', () => {
  if (!currentFolder) return;
  const id = currentFolder;
  inlineRename($('l-title'), (name) => store.renameFolder(id, name));
});

$('f-settings-btn').addEventListener('click', () => {
  settingsOpen = !settingsOpen;
  render();
});

$('f-parent').addEventListener('change', (e) => {
  const id = currentFolder;
  const parent = e.target.value || null;
  run(async () => {
    await store.moveFolder(id, parent);
    settingsOpen = false;
    await refresh();
    toast(`Moved to ${parent ? store.folderPath(folders, parent) : 'top level'}`);
  });
});

confirmClick($('f-delete'), 'Delete everything inside? Click again', () => {
  const id = currentFolder;
  const parent = folderById(id)?.parentId ?? null;
  run(async () => {
    await store.deleteFolder(id);
    currentFolder = parent;
    saveLocation();
    await refresh();
  });
});

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('export-json').addEventListener('click', () => {
  download(`p-planner-backup-${store.dateKey(Date.now())}.json`, store.toJSON({ projects, folders }), 'application/json');
});

// The file picker steals focus and closes the popup, so import runs from a full tab.
$('import-json').addEventListener('click', () => {
  if (isTab) $('import-file').click();
  else chrome.tabs.create({ url: chrome.runtime.getURL('popup.html?tab') });
});

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm('Import replaces ALL current projects and folders with the ones in the file. Continue?')) return;
  await run(async () => {
    await store.importData(JSON.parse(await file.text()));
    currentFolder = null;
    saveLocation();
    await refresh();
    toast('Backup imported');
  });
});

// ---- detail view ----

$('back').addEventListener('click', () => {
  const p = current();
  if (p) currentFolder = p.folderId; // the project may have been moved while open
  currentId = null;
  saveLocation();
  render();
});

$('d-toggle').addEventListener('click', () => {
  const p = current();
  run(async () => {
    await (p.runningSince ? store.stop(p.id) : store.start(p.id));
    await refresh();
  });
});

$('d-name').addEventListener('click', () => {
  const id = currentId;
  inlineRename($('d-name'), (name) => store.renameProject(id, name));
});

$('d-folder').addEventListener('change', (e) => {
  const id = currentId;
  run(async () => {
    await store.moveProject(id, e.target.value || null);
    await refresh();
  });
});

$('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const h = Math.max(0, Number($('m-h').value) || 0);
  const m = Math.max(0, Number($('m-m').value) || 0);
  const sign = Number($('m-sign').value);
  const ms = (h * 60 + m) * 60000 * sign;
  if (!ms) return toast('Enter hours or minutes', true);
  const date = $('m-date').value || store.dateKey(Date.now());
  run(async () => {
    await store.addManual(currentId, ms, date);
    $('m-h').value = '';
    $('m-m').value = '';
    await refresh();
    toast(`${sign > 0 ? 'Added' : 'Subtracted'} ${store.fmtShort(Math.abs(ms))} on ${dayLabel(date)}`);
  });
});

confirmClick($('d-delete'), 'Sure? Click again', () =>
  run(async () => {
    await store.deleteProject(currentId);
    currentId = null;
    await refresh();
  }),
);

// ---- boot ----

async function boot() {
  try {
    currentFolder = (await chrome.storage.local.get('lastFolder')).lastFolder || null;
  } catch {}
  await refresh();
}

store.onChange(() => run(refresh));
run(boot);
