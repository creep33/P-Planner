// Renders Chrome Web Store images and the README preview from the real popup code,
// using a headless Chromium browser and mock data.
// Usage: npm run store-assets   (set BROWSER=/path/to/chrome to override detection)
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXT = join(ROOT, 'extension');
const read = (f) => readFileSync(join(EXT, f), 'utf8');

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const BROWSER = BROWSERS.find((b) => b && existsSync(b));
if (!BROWSER) throw new Error('No Chromium browser found; set BROWSER=/path/to/chrome');

// ---- popup with mock data ----

const MOCK = `
const H = 3600000, M = 60000, DAY = 86400000, now = Date.now();
const dk = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
let data = {
  'p:a1': { id: 'a1', name: 'Website redesign', createdAt: 1, runningSince: now - (1 * H + 12 * M) },
  'd:a1': { [dk(now)]: 2 * H, [dk(now - DAY)]: 6.5 * H, [dk(now - 2 * DAY)]: 4 * H, [dk(now - 3 * DAY)]: 5.25 * H, [dk(now - 6 * DAY)]: 3 * H },
  'p:b2': { id: 'b2', name: 'Mobile app', createdAt: 2, runningSince: null },
  'd:b2': { [dk(now)]: 1.5 * H, [dk(now - DAY)]: 2 * H, [dk(now - 4 * DAY)]: 7 * H },
  'p:c3': { id: 'c3', name: 'Client support', createdAt: 3, runningSince: now - 25 * M },
  'd:c3': { [dk(now)]: 0.75 * H, [dk(now - 2 * DAY)]: 3 * H },
  'p:d4': { id: 'd4', name: 'Research', createdAt: 4, runningSince: null },
  'd:d4': { [dk(now - 3 * DAY)]: 2 * H },
};
const listeners = [];
window.chrome = {
  storage: {
    sync: {
      async get(k) { if (k === null) return structuredClone(data); return Object.fromEntries([].concat(k).filter((x) => x in data).map((x) => [x, structuredClone(data[x])])); },
      async set(items) { Object.assign(data, structuredClone(items)); listeners.forEach((cb) => cb(items, 'sync')); },
      async remove(keys) { [].concat(keys).forEach((k) => delete data[k]); },
    },
    onChanged: { addListener: (cb) => listeners.push(cb) },
  },
  tabs: { create() {} },
  runtime: { getURL: (x) => x },
};`;

const storeSrc = read('store.js');
const exportsList = [...storeSrc.matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
const storeIIFE = `const store = (() => {\n${storeSrc.replace(/^export /gm, '')}\nreturn { ${exportsList.join(', ')} };\n})();`;
const popupSrc = read('popup.js').replace(/^import .*$/m, '');

function popupDoc({ view = 'list', dark = false }) {
  const css =
    read('popup.css').replace('@media (prefers-color-scheme: dark) {', dark ? '@media all {' : '@media not all {') +
    `:root { color-scheme: ${dark ? 'dark' : 'light'}; }`;
  const open = view === 'list' ? '' : `setTimeout(() => openDetail(${JSON.stringify(view)}), 50);`;
  return read('popup.html')
    .replace('<link rel="stylesheet" href="popup.css">', `<style>${css}</style>`)
    .replace('<script type="module" src="popup.js"></script>', `<script>${MOCK}\n${storeIIFE}\n${popupSrc}\n${open}</script>`);
}

const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// A scaled popup "window"; its height is fitted to the content after render.
function popup(opts, scale) {
  return `<div class="shot" data-scale="${scale}" style="width:${340 * scale}px">
    <div class="frame" style="transform:scale(${scale})"><iframe srcdoc="${attr(popupDoc(opts))}"></iframe></div>
  </div>`;
}

const ICON = `data:image/png;base64,${readFileSync(join(EXT, 'icons', 'icon128.png')).toString('base64')}`;

function page(w, h, body, css = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; }
    body {
      display: flex; align-items: center; justify-content: center; gap: 56px;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #1e1b4b;
      background: linear-gradient(135deg, #eef0ff 0%, #e0e7ff 50%, #f5f3ff 100%);
    }
    .shot { flex: none; }
    .frame { width: 340px; transform-origin: top left; border-radius: 12px; overflow: hidden;
      box-shadow: 0 30px 70px rgb(30 27 75 / .25), 0 0 0 1px rgb(30 27 75 / .08); }
    .frame iframe { display: block; width: 340px; height: 400px; border: 0; }
    .copy { width: 420px; }
    .copy img { width: 64px; height: 64px; }
    .copy h1 { margin: 18px 0 12px; font-size: 46px; line-height: 1.1; letter-spacing: -.02em; }
    .copy p { margin: 0; font-size: 21px; line-height: 1.5; color: #4338ca; }
    .row { display: flex; gap: 28px; align-items: flex-start; }
    ${css}
  </style></head><body>${body}
  <script>
    setTimeout(() => {
      for (const shot of document.querySelectorAll('.shot')) {
        const iframe = shot.querySelector('iframe');
        const h = Math.ceil(iframe.contentDocument.body.getBoundingClientRect().height);
        iframe.style.height = h + 'px';
        shot.style.height = h * Number(shot.dataset.scale) + 'px';
      }
    }, 400);
  </script></body></html>`;
}

const copy = (title, text) => `<div class="copy"><img src="${ICON}" alt=""><h1>${title}</h1><p>${text}</p></div>`;

const TARGETS = [
  {
    out: 'store/assets/screenshot-1-projects.png',
    size: [1280, 800],
    html: page(1280, 800, copy('Track hours per project', 'Start and stop timers from your toolbar. Run several at once.') + popup({ view: 'list' }, 1.55)),
  },
  {
    out: 'store/assets/screenshot-2-detail.png',
    size: [1280, 800],
    html: page(1280, 800, copy('Fix time by hand', 'Add or subtract time on any date. See today, this week and recent days.') + popup({ view: 'a1' }, 1.2)),
  },
  {
    out: 'store/assets/screenshot-3-sync.png',
    size: [1280, 800],
    html: page(
      1280,
      800,
      copy('Synced across your devices', 'Stored in your browser’s sync storage. No accounts, no servers. Light and dark mode.') +
        `<div class="row">${popup({ view: 'list', dark: true }, 1.05)}${popup({ view: 'a1', dark: true }, 1.05)}</div>`,
      '.copy { width: 340px; } .copy h1 { font-size: 40px; } body { gap: 44px; }',
    ),
  },
  {
    out: 'store/assets/promo-small-440x280.png',
    size: [440, 280],
    html: page(
      440,
      280,
      `<div class="promo"><div class="tile"><img src="${ICON}" alt=""></div><h1>P-Planner</h1><p>Track hours per project</p></div>`,
      `body { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #fff; }
       .promo { text-align: center; }
       .tile { display: inline-grid; place-items: center; width: 84px; height: 84px; border-radius: 20px; background: #fff; box-shadow: 0 10px 30px rgb(0 0 0 / .2); }
       .tile img { width: 64px; height: 64px; }
       h1 { margin: 16px 0 4px; font-size: 34px; letter-spacing: -.02em; }
       p { margin: 0; font-size: 17px; opacity: .9; }`,
    ),
  },
  {
    out: 'store/assets/promo-marquee-1400x560.png',
    size: [1400, 560],
    html: page(
      1400,
      560,
      `<div class="copy"><div class="tile"><img src="${ICON}" alt=""></div><h1>P-Planner</h1><p>Track hours per project. Timers, manual adjustments and sync across your devices.</p></div>` +
        popup({ view: 'list' }, 1.2),
      `body { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); gap: 90px; }
       .copy { color: #fff; width: 520px; } .copy p { color: #e0e7ff; }
       .tile { display: inline-grid; place-items: center; width: 84px; height: 84px; border-radius: 20px; background: #fff; }
       .copy h1 { font-size: 56px; }`,
    ),
  },
  {
    out: 'docs/preview.png',
    size: [820, 700],
    scale: 2,
    html: page(820, 700, `<div class="row">${popup({ view: 'list' }, 1)}${popup({ view: 'a1' }, 1)}</div>`, 'body { background: #eef0f5; } .row { gap: 40px; }'),
  },
];

const work = mkdtempSync(join(tmpdir(), 'p-planner-assets-'));
try {
  for (const t of TARGETS) {
    const htmlPath = join(work, 'page.html');
    writeFileSync(htmlPath, t.html);
    const out = join(ROOT, t.out);
    mkdirSync(dirname(out), { recursive: true });
    execFileSync(BROWSER, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--allow-file-access-from-files',
      `--user-data-dir=${join(work, 'profile')}`,
      `--force-device-scale-factor=${t.scale || 1}`,
      `--window-size=${t.size[0]},${t.size[1]}`,
      '--virtual-time-budget=2000',
      `--screenshot=${out}`,
      pathToFileURL(htmlPath).href,
    ], { stdio: 'ignore' });
    console.log(t.out);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
