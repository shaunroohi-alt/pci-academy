import type { ScreenProps } from './types';

export function Path({ derived }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent)', fontFeatureSettings: "'tnum'" }}>
        The programme · 98 days
      </div>
      <h1 style={{ margin: '14px 0 6px', fontWeight: 400, fontSize: 40, lineHeight: 1.02 }}>Your path</h1>
      <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--color-neutral-700)', textAlign: 'justify' }}>
        Seven chapters of fourteen days. Each opens only when the one before is complete — the order is the method.
      </p>
      {derived.chapters.map((ch) => (
        <div key={ch.num} style={{ display: 'grid', gridTemplateColumns: '44px 1fr', gap: 12, padding: '16px 0', borderBottom: '1px solid var(--color-divider)', opacity: ch.opacity }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1, fontFeatureSettings: "'tnum'", color: ch.numColor }}>{ch.num}</div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 21, lineHeight: 1.1 }}>{ch.title}</div>
              <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', fontFeatureSettings: "'tnum'" }}>{ch.status}</div>
            </div>
            <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--color-neutral-700)' }}>{ch.blurb}</p>
            <div style={{ height: 1, background: 'var(--color-neutral-300)', position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, height: 1, background: 'var(--color-accent)', width: ch.pct }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
