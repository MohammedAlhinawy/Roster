import { db, ensureSeeded, getSetting, setSetting } from './db.js';
import { rescheduleAll, requestPermission } from './notify.js';
import { renderDashboard } from './render/dashboard.js';
import { renderCalendar } from './render/calendar.js';
import { renderRoster, wireGlobalModals } from './render/roster.js';
import { renderAlarms } from './render/alarms.js';
import { renderImport } from './render/importpage.js';
import { renderSettings } from './render/settings.js';

const root = document.getElementById('view');
const routes = {
  '/': renderDashboard,
  '/calendar': renderCalendar,
  '/roster': renderRoster,
  '/alarms': renderAlarms,
  '/import': renderImport,
  '/settings': renderSettings
};

function currentPath() {
  const hash = location.hash.replace('#', '');
  return routes[hash] ? hash : '/';
}

async function router() {
  const path = currentPath();
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === `#${path}`);
  });
  await routes[path](root);
  root.scrollTop = 0;
}

window.addEventListener('hashchange', router);

async function boot() {
  await ensureSeeded();
  wireGlobalModals();
  const onboarded = await getSetting('onboarded');
  if (!onboarded) await runOnboarding();
  await rescheduleAll();
  await router();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Re-check schedule whenever the tab regains focus (covers the tab having
  // been asleep/throttled, which browsers do aggressively in background).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rescheduleAll();
  });
  setInterval(() => rescheduleAll(), 30 * 60 * 1000);
}

async function runOnboarding() {
  const modal = document.getElementById('onboard-modal');
  modal.classList.remove('hidden');
  await new Promise((resolve) => {
    modal.querySelector('#ob-start').onclick = async () => {
      const name = modal.querySelector('#ob-name').value.trim();
      if (name) await setSetting('userName', name);
      await setSetting('onboarded', true);
      await requestPermission();
      modal.classList.add('hidden');
      resolve();
    };
    modal.querySelector('#ob-skip').onclick = async () => {
      await setSetting('onboarded', true);
      modal.classList.add('hidden');
      resolve();
    };
  });
}

document.getElementById('alarm-modal')?.querySelector('.dismiss-btn')?.addEventListener('click', () => {
  document.getElementById('alarm-modal').classList.add('hidden');
});

boot();
