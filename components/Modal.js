'use client';

import { useEffect, useState } from 'react';

export default function Modal({ open, onClose, children, size = 'sheet' }) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let t;
    if (open) {
      setMounted(true);
      t = setTimeout(() => setVisible(true), 10);
    } else {
      setVisible(false);
      t = setTimeout(() => setMounted(false), 220);
    }
    return () => clearTimeout(t);
  }, [open]);

  if (!mounted) return null;

  return (
    <div className={`modal-overlay ${visible ? 'is-visible' : ''}`} onClick={onClose}>
      <div className={`modal-card modal-${size} ${visible ? 'is-visible' : ''}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
