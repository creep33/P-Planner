// Keeps the toolbar badge in sync with how many timers are running (on any device).
import { loadAll, onChange } from './store.js';

async function updateBadge() {
  const running = (await loadAll()).filter((p) => p.runningSince);
  await chrome.action.setBadgeBackgroundColor({ color: '#16a34a' });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setBadgeText({ text: running.length ? String(running.length) : '' });
  await chrome.action.setTitle({
    title: running.length ? `P-Planner · en marcha: ${running.map((p) => p.name).join(', ')}` : 'P-Planner',
  });
}

chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);
onChange(updateBadge);
