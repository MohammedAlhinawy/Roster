import { db, getSetting, setSetting } from '../db.js';
import { rescheduleAll } from '../notify.js';

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.dispatchEvent(new CustomEvent('dr-install-available'));
});

export async function renderSettings(root) {
  const shiftTypes = await db.shiftTypes.toArray();
  const userName = await getSetting('userName');
  const timezone = await getSetting('timezone');
  const weeklySummary = await getSetting('weeklySummary');
  const offDayNotify = await getSetting('offDayNotify');
  const prep = await getSetting('defaultPrep');
  const travel = await getSetting('defaultTravel');
  const buffer = await getSetting('defaultBuffer');

  root.innerHTML = `
    <section class="page">
      <header class="page-head"><h1>Settings</h1></header>

      <div class="panel">
        <h2>Install DutyRoster</h2>
        <p class="muted-note">Add DutyRoster to your home screen so it opens full-screen like a native app and can keep working offline.</p>
        <button class="btn btn-primary" id="install-btn" disabled>Install app</button>
        <p class="muted-note" id="install-hint">On iPhone: open in Safari, tap Share → Add to Home Screen. On Android/Chrome: use the Install button once it's enabled, or the browser menu → Install app.</p>
      </div>

      <div class="panel">
        <h2>Profile</h2>
        <label>Name <input id="s-name" value="${userName || ''}"></label>
        <label>Timezone <input id="s-tz" value="${timezone}"></label>
      </div>

      <div class="panel">
        <h2>Shift types</h2>
        <div class="shift-editor">
          ${shiftTypes.map(s => `
            <div class="shift-edit-row" data-code="${s.code}">
              <input class="se-icon" value="${s.icon}" style="width:2.4rem">
              <input class="se-name" value="${s.name}">
              <input class="se-start" type="time" value="${s.start || ''}" ${s.start === null ? 'disabled' : ''}>
              <input class="se-end" type="time" value="${s.end || ''}" ${s.end === null ? 'disabled' : ''}>
              <input class="se-color" type="color" value="${s.color}">
              <span class="se-code">${s.code}</span>
            </div>`).join('')}
        </div>
        <button class="btn" id="add-shift">+ Add custom shift code</button>
      </div>

      <div class="panel">
        <h2>Smart alarm calculation (defaults)</h2>
        <label>Preparation time (min) <input type="number" id="s-prep" value="${prep}"></label>
        <label>Travel time (min) <input type="number" id="s-travel" value="${travel}"></label>
        <label>Safety buffer (min) <input type="number" id="s-buffer" value="${buffer}"></label>
        <p class="muted-note">Suggested wake-up = shift start − (prep + travel + buffer). Apply per shift under Alarms.</p>
      </div>

      <div class="panel">
        <h2>Notifications</h2>
        <label class="row-check"><input type="checkbox" id="s-weekly" ${weeklySummary ? 'checked' : ''}> Sunday evening — send me next week's roster</label>
        <label class="row-check"><input type="checkbox" id="s-offday" ${offDayNotify ? 'checked' : ''}> Tell me about off days too</label>
      </div>

      <div class="panel">
        <h2>Backup &amp; data</h2>
        <p class="muted-note">Everything is stored only on this device (IndexedDB). Export a backup regularly, especially before clearing browser data.</p>
        <div class="head-actions">
          <button class="btn" id="export-btn">Export backup (.json)</button>
          <label class="btn file-btn">Import backup<input type="file" id="import-file" accept="application/json" hidden></label>
        </div>
        <button class="btn btn-danger" id="wipe-btn">Erase all data</button>
      </div>

      <p class="version-note">DutyRoster · runs entirely on this device · v1.0</p>
    </section>
  `;

  // profile
  root.querySelector('#s-name').onchange = e => setSetting('userName', e.target.value);
  root.querySelector('#s-tz').onchange = e => setSetting('timezone', e.target.value);
  root.querySelector('#s-weekly').onchange = e => setSetting('weeklySummary', e.target.checked);
  root.querySelector('#s-offday').onchange = e => setSetting('offDayNotify', e.target.checked);
  root.querySelector('#s-prep').onchange = e => setSetting('defaultPrep', Number(e.target.value));
  root.querySelector('#s-travel').onchange = e => setSetting('defaultTravel', Number(e.target.value));
  root.querySelector('#s-buffer').onchange = e => setSetting('defaultBuffer', Number(e.target.value));

  // shift editor
  root.querySelectorAll('.shift-edit-row').forEach(rowEl => {
    const code = rowEl.dataset.code;
    const save = async () => {
      await db.shiftTypes.update(code, {
        icon: rowEl.querySelector('.se-icon').value,
        name: rowEl.querySelector('.se-name').value,
        start: rowEl.querySelector('.se-start').value || null,
        end: rowEl.querySelector('.se-end').value || null,
        color: rowEl.querySelector('.se-color').value
      });
      await rescheduleAll();
    };
    rowEl.querySelectorAll('input').forEach(inp => inp.onchange = save);
  });
  root.querySelector('#add-shift').onclick = async () => {
    const code = prompt('New one-letter (or short) code, e.g. "T" for training:');
    if (!code) return;
    const exists = await db.shiftTypes.get(code.toUpperCase());
    if (exists) return alert('That code already exists.');
    await db.shiftTypes.put({ code: code.toUpperCase(), name: 'New shift', start: '08:00', end: '17:00', crossesMidnight: false, color: '#8A8F9C', icon: '●', system: false });
    renderSettings(root);
  };

  // backup
  root.querySelector('#export-btn').onclick = async () => {
    const data = {
      shiftTypes: await db.shiftTypes.toArray(),
      roster: await db.roster.toArray(),
      alarmRules: await db.alarmRules.toArray(),
      settings: await db.settings.toArray(),
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `dutyroster-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  root.querySelector('#import-file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    if (!confirm('Import will merge into your current data (matching dates/codes are overwritten). Continue?')) return;
    if (data.shiftTypes) await db.shiftTypes.bulkPut(data.shiftTypes);
    if (data.alarmRules) await db.alarmRules.bulkPut(data.alarmRules.map(r => ({ ...r, id: undefined })));
    if (data.roster) for (const r of data.roster) {
      const existing = await db.roster.where('date').equals(r.date).first();
      const row = { ...r, id: undefined };
      if (existing) await db.roster.update(existing.id, row); else await db.roster.add(row);
    }
    if (data.settings) await db.settings.bulkPut(data.settings);
    await rescheduleAll();
    alert('Backup imported.');
    renderSettings(root);
  };
  root.querySelector('#wipe-btn').onclick = async () => {
    if (!confirm('This deletes ALL roster data, alarms and settings from this device. This cannot be undone. Continue?')) return;
    await db.delete();
    location.reload();
  };

  // install
  const installBtn = root.querySelector('#install-btn');
  const installHint = root.querySelector('#install-hint');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isStandalone) {
    installBtn.textContent = 'Already installed';
    installHint.textContent = "You're using the installed app.";
  } else if (deferredInstallPrompt) {
    installBtn.disabled = false;
  }
  installBtn.onclick = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.disabled = true;
    installBtn.textContent = 'Installed';
  };
  document.addEventListener('dr-install-available', () => { installBtn.disabled = false; });
}
