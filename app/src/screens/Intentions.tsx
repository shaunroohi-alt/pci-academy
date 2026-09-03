import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function Intentions({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
      <BackHeader tone="muted" onBack={actions.toWelcome} right="I · III" />
      <h2 style={{ margin: '26px 0 8px', fontWeight: 400, fontSize: 38, lineHeight: 1.05 }}>What brings you here?</h2>
      <p style={{ margin: '0 0 22px', fontSize: 14, color: 'var(--color-neutral-700)' }}>
        Choose as many as are true. The programme is arranged around them.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {derived.intents.map((it) => (
          <button key={it.key} className="pci-row" onClick={it.toggle}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: it.weight, color: it.color }}>{it.label}</span>
            <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${it.ring}`, background: it.fill, boxShadow: it.shadow }} />
          </button>
        ))}
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', textAlign: 'center' }}>{derived.intentCount} chosen</div>
        <button className="btn btn-primary" onClick={actions.toName} disabled={derived.noIntent} style={{ minHeight: 48, fontSize: 16 }}>Continue</button>
      </div>
    </div>
  );
}
