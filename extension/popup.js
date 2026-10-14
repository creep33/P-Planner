import * as store from './store.js';

const $ = (id) => document.getElementById(id);
const isTab = new URLSearchParams(location.search).has('tab');
if (isTab) document.body.classList.add('tab');

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
const ICON_STOP = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/></svg>';

let projects = [];
let currentId = null;
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
    toast(quota ? 'Límite de sincronización alcanzado, espera un momento' : err?.message || 'Error', true);
  }
}

async function refresh() {
  projects = await store.loadAll();
  render();
}

const current = () => projects.find((p) => p.id === currentId);

// ---- rendering ----

function render() {
  if (currentId && !current()) currentId = null; // deleted (maybe from another device)
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
  $('empty').hidden = projects.length > 0;
  $('projects').replaceChildren(
    ...projects.map((p) => {
      const play = el('button', {
        className: 'play',
        type: 'button',
        title: p.runningSince ? 'Parar' : 'Empezar',
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
    }),
  );
  const running = projects.filter((p) => p.runningSince).length;
  $('running-pill').hidden = !running;
  $('running-pill').textContent = `${running} en marcha`;
}

function renderDetail() {
  const p = current();
  $('detail-view').classList.toggle('running', !!p.runningSince);
  $('d-toggle').textContent = p.runningSince ? 'Stop' : 'Start';
  const h1 = $('d-name'); // null while the rename input is open
  if (h1) {
    h1.textContent = p.name;
    h1.title = `${p.name} · click para renombrar`;
  }
}

function dayLabel(key) {
  if (key.length === 7) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Only touches text so clicks and inputs are never disturbed by the 1s tick.
function updateTimes() {
  const now = Date.now();
  if (!currentId) {
    for (const li of $('projects').children) {
      const p = projects.find((x) => x.id === li.dataset.id);
      if (!p) continue;
      const t = store.totals(p, p.days, now);
      li.querySelector('.total').textContent = store.fmtShort(t.total);
      li.querySelector('.sub').textContent = `Hoy ${store.fmtShort(t.today)}`;
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
      : [el('li', {}, el('span', { className: 'muted', textContent: 'Sin tiempo registrado' }))]),
  );
}

function openDetail(id) {
  currentId = id;
  $('manual-form').reset();
  $('m-date').value = store.dateKey(Date.now());
  render();
}

// ---- list view ----

$('new-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('new-name').value.trim();
  if (!name) return;
  run(async () => {
    await store.createProject(name);
    $('new-name').value = '';
    await refresh();
  });
});

$('projects').addEventListener('click', (e) => {
  const li = e.target.closest('li.proj');
  if (!li) return;
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

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => store.dateKey(Date.now());

$('export-csv').addEventListener('click', () => {
  download(`p-planner-${stamp()}.csv`, store.toCSV(projects), 'text/csv;charset=utf-8');
});

$('export-json').addEventListener('click', () => {
  download(`p-planner-backup-${stamp()}.json`, store.toJSON(projects), 'application/json');
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
  if (!confirm('Importar reemplaza TODOS los proyectos actuales por los del archivo. ¿Continuar?')) return;
  await run(async () => {
    await store.importData(JSON.parse(await file.text()));
    await refresh();
    toast('Backup importado');
  });
});

// ---- detail view ----

$('back').addEventListener('click', () => {
  currentId = null;
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
  const h1 = $('d-name');
  const input = el('input', { className: 'rename', value: h1.textContent, maxLength: 60 });
  h1.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    input.replaceWith(h1);
    if (save && name && name !== h1.textContent) {
      h1.textContent = name;
      run(async () => {
        await store.renameProject(currentId, name);
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
});

$('manual-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const h = Math.max(0, Number($('m-h').value) || 0);
  const m = Math.max(0, Number($('m-m').value) || 0);
  const sign = Number($('m-sign').value);
  const ms = (h * 60 + m) * 60000 * sign;
  if (!ms) return toast('Indica horas o minutos', true);
  const date = $('m-date').value || store.dateKey(Date.now());
  run(async () => {
    await store.addManual(currentId, ms, date);
    $('m-h').value = '';
    $('m-m').value = '';
    await refresh();
    toast(`${sign > 0 ? 'Añadido' : 'Restado'} ${store.fmtShort(Math.abs(ms))} el ${dayLabel(date)}`);
  });
});

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

confirmClick($('d-delete'), '¿Seguro? Pulsa otra vez', () =>
  run(async () => {
    await store.deleteProject(currentId);
    currentId = null;
    await refresh();
  }),
);

// ---- boot ----

store.onChange(() => run(refresh));
run(refresh);
