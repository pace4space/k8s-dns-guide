import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function Accordion({ title, subtitle, children, defaultOpen = false, accent }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      background: 'var(--bg2)', border: `1px solid ${open && accent ? accent + '44' : 'var(--border)'}`,
      borderRadius: 12, marginBottom: 10, overflow: 'hidden',
      transition: 'border-color .2s',
    }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', background: 'transparent', border: 'none',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.2 }}
          style={{ fontSize: 12, color: 'var(--text3)', minWidth: 12 }}>▶</motion.span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
          {subtitle && !open && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{subtitle}</div>}
        </div>
        {accent && <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)' }}>
              <div style={{ paddingTop: 14 }}>{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
