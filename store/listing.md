# Chrome Web Store listing

Copy these values into the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).

## Package

Upload `P-Planner-vX.Y.Z-webstore.zip` from the [latest release](https://github.com/creep33/P-Planner/releases/latest).
It is the same build as the regular zip, without the `key` field in the manifest (the store assigns its own ID).

## Store listing

| Field | Value |
| --- | --- |
| Name | P-Planner (taken from the manifest) |
| Summary | Per-project hour tracker with manual adjustments, synced across devices via Brave/Chrome Sync. (taken from the manifest) |
| Category | Productivity → Workflow & Planning |
| Language | English |
| Store icon | `assets/store-icon-128.png` |
| Screenshots (1280×800) | `assets/screenshot-1-projects.png`, `assets/screenshot-2-detail.png`, `assets/screenshot-3-sync.png` |
| Small promo tile (440×280) | `assets/promo-small-440x280.png` |
| Marquee promo tile (1400×560) | `assets/promo-marquee-1400x560.png` |
| Homepage URL | https://github.com/creep33/P-Planner |
| Support URL | https://github.com/creep33/P-Planner/issues |

### Description

```text
P-Planner is a simple time tracker for the projects you work on, right in your toolbar.

• Create projects and start or stop a timer for each one
• Run several timers at once
• Timers keep counting even when the popup or the browser is closed
• Add or subtract time manually on any date to fix forgotten hours
• See the total, today, this week and recent days for every project
• The toolbar badge shows how many timers are running
• Synced across your devices through your browser's sync (Chrome Sync or Brave Sync)
• Export and import a JSON backup
• Light and dark mode

Private by design: no accounts, no servers, no analytics. Your data stays in your browser's own sync storage.
```

## Privacy practices

| Field | Value |
| --- | --- |
| Single purpose | Track the time the user spends on their own projects with start/stop timers and manual adjustments. |
| `storage` justification | Saves the user's projects and tracked time with chrome.storage.sync so they persist and sync across the user's own devices through browser sync. |
| Remote code | No, I am not using remote code. |
| Data usage | Check none of the data types: the extension does not collect or transmit user data. |
| Certifications | Check all three: no sale to third parties, no use unrelated to the single purpose, no use for creditworthiness or lending. |
| Privacy policy URL | https://github.com/creep33/P-Planner/blob/main/PRIVACY.md |

## Distribution

- **Visibility**: *Unlisted* to install it only through the direct link, or *Public* to show it in search.
- **Regions**: all.

## Regenerating the images

```bash
npm run icons          # extension icons + store icon
npm run store-assets   # screenshots, promo tiles and docs/preview.png (needs Chrome, Brave or Edge)
```
