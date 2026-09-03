import type { ScreenProps } from './types';

export function Journal({ derived }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent)', fontFeatureSettings: "'tnum'" }}>
        <span>Journal</span><span>{derived.entryCount} entries</span>
      </div>
      <h1 style={{ margin: '14px 0 6px', fontWeight: 400, fontSize: 40, lineHeight: 1.02 }}>One sentence a day</h1>
      <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--color-neutral-700)' }}>Read back in order. Your coach reads these before each weekly note.</p>
      {derived.journalGroups.map((g) => (
        <div key={g.label}>
          <h6 style={{ margin: '26px 0 0', color: 'var(--color-accent)' }}>{g.label}</h6>
          {g.items.map((e) => (
            <button key={e.id} className="pci-row" onClick={e.open} style={{ minHeight: 0, padding: '14px 2px', alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--color-neutral-600)', fontFeatureSettings: "'tnum'" }}>
                <span>{e.date} · {e.practice}</span><span>Day {e.day}</span>
              </span>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, lineHeight: 1.3 }}>{e.text}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
