<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="P-Planner">
</p>

<h1 align="center">P-Planner</h1>

<p align="center">
  Browser extension to track working hours per project.<br>
  Per-project timers, manual adjustments and cross-device sync through Brave/Chrome Sync.
</p>

---

## Features

- **Projects**: create, rename and delete projects from the toolbar popup.
- **Per-project timer**: Start / Stop. Several projects can run at the same time.
- **Timestamp based**: time keeps counting even if the popup or the browser is closed.
- **Manual adjustment**: add or subtract hours/minutes on any date to fix forgotten time.
- **Breakdown**: total, today, current week (Monday–Sunday) and recent days.
- **Sync**: data lives in `chrome.storage.sync`; a timer started on one device shows as running on the other.
- **Badge**: the toolbar icon shows how many timers are running.
- **Backup**: full JSON export and restore.
- Automatic light/dark mode. No dependencies, no servers, no telemetry.

## Installation (Brave / Chrome)

### From a release (recommended)

1. Download `P-Planner-vX.Y.Z.zip` from the [latest release](https://github.com/creep33/P-Planner/releases/latest).
2. Unzip it into a permanent folder (don't delete it: the browser loads the extension from there).
3. Open `brave://extensions` (or `chrome://extensions`) and enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).
5. Pin the icon to the toolbar.

To update: unzip the new version over the same folder and click ⟳ on the extension card.
Your data is kept because the extension ID does not change.

### From source

1. Clone the repository:
   ```bash
   git clone https://github.com/creep33/P-Planner.git
   ```
2. In `brave://extensions`, with **Developer mode** on, click **Load unpacked** and select `extension/`.

The `manifest.json` includes a public key (`key`) that pins the extension ID to
`gbdmogficigldmeiigigomjamocipnej` on every device. This is required: `storage.sync` ties data to the ID, so every
device must load this same build without changing the key.

## Syncing across devices

1. On each device, go to Brave **Settings → Sync** and join the same sync chain.
2. Under *Manage your synced data*, enable **Extensions**.
3. Install the extension on each device as described above (same ID).

Changes usually propagate within seconds. If sync does not work with the unpacked extension, use **Backup JSON** on
one device and **Import** on the other.

### `storage.sync` limits

| Limit | Value | How it is handled |
| --- | --- | --- |
| Total | 100 KB | Hundreds of projects with years of history fit comfortably |
| Per item | 8 KB | Old daily history is folded into monthly buckets automatically (totals stay exact) |
| Writes | 120/min, 1800/h | Writes only happen on user actions (start, stop, adjustments) |

If two devices edit the same project at the same time while offline, the last write wins.

## Usage

| Action | How |
| --- | --- |
| Create a project | Type the name and click **Add** (or press Enter) |
| Start / stop | ▶ / ■ button in the list, or **Start / Stop** in the detail view |
| Open details | Click the project |
| Rename | Click the name in the detail view |
| Add / subtract time | **Manual adjustment**: sign, hours, minutes and date |
| Delete a project | **Delete project**, then click again to confirm |
| Backup | **Backup JSON** in the list |
| Restore | **Import** (opens a tab; replaces all data) |

## Data model

One key per project in `chrome.storage.sync` to minimise conflicts between devices:

```text
p:<id>  →  { id, name, createdAt, runningSince }      project and timer state
d:<id>  →  { "2026-10-14": ms, "2025-03": ms, ... }   closed time per day (or per month after compaction)
```

When a timer is stopped, a session that crosses midnight is split across local days.

## Development

Node.js ≥ 22.2 is only needed for tests and to regenerate icons; the extension has no build step.

```bash
npm test         # time and storage logic tests (node:test)
npm run icons    # regenerates extension/icons/*.png
```

```text
extension/
  manifest.json   Manifest V3
  store.js        Storage + time logic (shared)
  popup.html/css/js
  background.js   Toolbar badge
  icons/
scripts/
  make-icons.mjs  Generates the PNG icons with no dependencies
tests/
  store.test.mjs
```

After editing files, click ⟳ on the extension card in `brave://extensions`.

### Publishing a version

Create a GitHub release with a tag like `v1.0` or `v1.0.1`. The
[`release.yml`](.github/workflows/release.yml) workflow runs the tests, stamps the tag version into `manifest.json`,
packages `extension/` as `P-Planner-vX.Y.Z.zip` (plus a `.sha256`) and attaches it to the release.

```bash
gh release create v1.0.0 --generate-notes
```

## License

[MIT](LICENSE)
