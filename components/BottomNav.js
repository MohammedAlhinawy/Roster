'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LuHouse, LuCalendarDays, LuClipboardList, LuAlarmClock, LuSettings } from 'react-icons/lu';

const TABS = [
  { href: '/', label: 'Home', icon: LuHouse },
  { href: '/calendar', label: 'Calendar', icon: LuCalendarDays },
  { href: '/roster', label: 'Roster', icon: LuClipboardList },
  { href: '/alarms', label: 'Alarms', icon: LuAlarmClock },
  { href: '/settings', label: 'Settings', icon: LuSettings },
];

function activeIndex(pathname) {
  if (pathname.startsWith('/roster')) return 2;
  const i = TABS.findIndex((t) => t.href === pathname);
  return i === -1 ? 0 : i;
}

export default function BottomNav() {
  const pathname = usePathname();
  const idx = activeIndex(pathname);

  return (
    <nav className="bottom-nav" style={{ '--tab-count': TABS.length }}>
      <span className="bottom-nav-pill" style={{ transform: `translateX(${idx * 100}%)` }} />
      {TABS.map((tab, i) => (
        <Link key={tab.href} href={tab.href} className={`bottom-nav-tab ${i === idx ? 'is-active' : ''}`}>
          <span className="bn-icon"><tab.icon /></span>
          <span className="bn-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
