import { db, getSetting, setSetting } from '../db.js';
import { rescheduleAll, requestPermission, getRecentNotifications } from '../notify.js';

export async function renderAlarms(root) {
  const shiftTypes = await db.shiftTypes.toArray();
  const rules = await db.alarmRules.toArray();
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  const backupEnabled = await getSetting('backupAlarmEnabled');
  const backupMinutes = await getSetting('backupAlarmMinutes');
  const recent = await getRecentNotifications(10);

  root.innerHTML = `
    <section class="page">
      <header class="page-head"><h1>Alarms &amp; notifications</h1></header>

      <div class="perm-banner ${perm === 'granted' ? 'ok' : ''}">
        <p>Browser notifications: <strong>${perm}</strong></p>
        ${perm !== 'granted' ? `<button class="btn btn-primary" id="perm-btn">Enable notifications</button>` : ''}
        <p class="muted-note">For alarms to fire while your phone is idle, install DutyRoster to your home screen (see Settings → Install app) and keep the tab open when possible. Browser alarms are best-effort — see the note on the Settings page.</p>
      </div>

      ${shiftTypes.filter(s => s.start).map(st => `
        <div class="panel">
          <h2>${st.icon} ${st.name}</h2>
          <div class="rule-list" data-shift="${st.code}">
            ${rules.filter(r => r.shiftCode === st.code).map(r => `
              <div class="rule-row" data-id="${r.id}">
                <span class="rule-icon">${r.type === 'alarm' ? '⏰' : '🔔'}</span>
                <input class="rule-label" value="${r.label}">
                <input class="rule-minutes" type="number" min="0" value="${r.minutesBefore}"> min before
                <label class="switch"><input type="checkbox" class="rule-enabled" ${r.enabled ? 'checked' : ''}><span></span></label>
                <button class="rr-del rule-del" title="Remove">✕</button>
              </div>
            `).join('')}
          </div>
          <button class="btn add-rule" data-shift="${st.code}">+ Add reminder</button>
        </div>
      `).join('')}

      <div class="panel">
        <h2>Backup alarm</h2>
        <label class="row-check"><input type="checkbox" id="backup-enabled" ${backupEnabled ? 'checked' : ''}> Repeat wake-up alarm if not dismissed</label>
        <label>Repeat every <input type="number" id="backup-minutes" value="${backupMinutes}" min="1" style="width:4rem"> minutes</label>
      </div>

      <div class="panel">
        <h2>Recent notifications</h2>
        ${recent.length === 0 ? `<p class="empty-note">Nothing sent yet.</p>` : `
          <ul class="notif-log">
            ${recent.map(n => `<li><strong>${n.title}</strong><span>${n.body}</span><time>${new Date(n.sentAt).toLocaleString()}</time></li>`).join('')}
          </ul>`}
      </div>
    </section>
  `;

  root.querySelector('#perm-btn')?.addEventListener('click', async () => { await requestPermission(); renderAlarms(root); });

  root.querySelectorAll('.add-rule').forEach(btn => btn.onclick = async () => {
    await db.alarmRules.add({ shiftCode: btn.dataset.shift, label: 'Reminder', minutesBefore: 60, type: 'notification', enabled: true });
    renderAlarms(root);
  });

  root.querySelectorAll('.rule-row').forEach(rowEl => {
    const id = Number(rowEl.dataset.id);
    const save = async () => {
      await db.alarmRules.update(id, {
        label: rowEl.querySelector('.rule-label').value,
        minutesBefore: Number(rowEl.querySelector('.rule-minutes').value),
        enabled: rowEl.querySelector('.rule-enabled').checked
      });
      await rescheduleAll();
    };
    rowEl.querySelector('.rule-label').onchange = save;
    rowEl.querySelector('.rule-minutes').onchange = save;
    rowEl.querySelector('.rule-enabled').onchange = save;
    rowEl.querySelector('.rule-del').onclick = async () => { await db.alarmRules.delete(id); renderAlarms(root); };
  });

  root.querySelector('#backup-enabled').onchange = async (e) => { await setSetting('backupAlarmEnabled', e.target.checked); };
  root.querySelector('#backup-minutes').onchange = async (e) => { await setSetting('backupAlarmMinutes', Number(e.target.value)); };
}
