'use client';

import { usePathname } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { LuUser } from 'react-icons/lu';
import { db, todayISO, weekday, dayLabel } from '../lib/db';

const TITLES = {
  '/': 'DutyRoster',
  '/calendar': 'Calendar',
  '/roster': 'Roster',
  '/roster/import': 'Import roster',
  '/alarms': 'Alarms',
  '/settings': 'Settings',
};

export default function AppBar() {
  const pathname = usePathname();
  const activePerson = useLiveQuery(async () => {
    if (!db) return '';
    const row = await db.settings.get('activePersonName');
    return row ? row.value : '';
  }, [], '');

  const isHome = pathname === '/';
  const today = todayISO();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <header className="app-bar">
      <div className="app-bar-left">
        <span className="app-bar-mark">◒</span>
        <div className="app-bar-text">
          {isHome ? (
            <>
              <p className="app-bar-eyebrow">{greeting}{activePerson ? `, ${activePerson.split(' ')[0]}` : ''}</p>
              <h1 className="app-bar-title">{weekday(today)}, {dayLabel(today)}</h1>
            </>
          ) : (
            <>
              <p className="app-bar-eyebrow">DutyRoster</p>
              <h1 className="app-bar-title">{TITLES[pathname] || 'DutyRoster'}</h1>
            </>
          )}
        </div>
      </div>
      <div className="app-bar-avatar" title={activePerson || 'Set your identity in Settings'}>
        <LuUser />
      </div>
    </header>
  );
}
