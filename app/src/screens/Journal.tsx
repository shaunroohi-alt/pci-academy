import type { ScreenProps } from './types';

export function Journal({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent)', fontFeatureSettings: "'tnum'" }}>
        <span>Journal</span>
        <span>{derived.entryCount} {derived.entryCount === 1 ? 'entry' : 'entries'}</span>
      </div>
      <h1 style={{ margin: '14px 0 6px', fontWeight: 400, fontSize: 40, lineHeight: 1.02 }}>One sentence a day</h1>

      {derived.hasEntries ? (
        <>
          <p style={{ margin: '0 0 6px', fontSize: 14, color: 'var(--color-neutral-700)' }}>
            Read back in order. Everything you write stays on this device.
          </p>
          {derived.journalGroups.map((g) => (
            <div key={g.label}>
              <h6 style={{ margin: '26px 0 0', color: 'var(--color-accent)' }}>{g.label}</h6>
              {g.items.map((e) => (
                <button key={e.day} className="pci-row" onClick={e.open} style={{ minHeight: 0, padding: '14px 2px', alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--color-neutral-600)', fontFeatureSettings: "'tnum'" }}>
                    <span>{e.dateLabel} · {e.practice}</span><span>Day {e.day}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, lineHeight: 1.3 }}>{e.text}</span>
                </button>
              ))}
            </div>
          ))}
        </>
      ) : (
        <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ width: 40, height: 1, background: 'var(--color-accent)' }} />
          <p style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 22, lineHeight: 1.3, color: 'var(--color-neutral-700)' }}>
            Nothing written yet.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-600)' }}>
            After each practice, write one honest sentence about it. They collect here, in order,
            and they stay on this device.
          </p>
          <button className="btn btn-primary" onClick={actions.toHome} style={{ minHeight: 44, marginTop: 4 }}>
            Go to today's practice
          </button>
        </div>
      )}
    </div>
  );
}
