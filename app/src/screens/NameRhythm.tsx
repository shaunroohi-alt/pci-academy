import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function NameRhythm({ s, derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
      <BackHeader tone="muted" onBack={actions.toIntent} right="II · III" />
      <h2 style={{ margin: '26px 0 8px', fontWeight: 400, fontSize: 38, lineHeight: 1.05 }}>How shall we address you?</h2>
      <p style={{ margin: '0 0 26px', fontSize: 14, color: 'var(--color-neutral-700)' }}>
        Your coach will use this name. Then set the hour your practice arrives.
      </p>
      <div className="field" style={{ marginBottom: 26 }}>
        <label>Name</label>
        <input
          className="input pci"
          value={s.name}
          onChange={(e) => actions.setName(e.target.value)}
          placeholder="e.g. Eleanor"
          style={{ minHeight: 48, fontSize: 17, fontFamily: 'var(--font-heading)' }}
        />
      </div>
      <div className="field">
        <label>Daily practice arrives</label>
        <div style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {derived.hours.map((h) => (
            <button
              key={h.label}
              onClick={h.pick}
              style={{ flex: 1, minHeight: 46, background: 'transparent', border: 0, borderLeft: '1px solid var(--color-divider)', font: 'inherit', fontSize: 13, cursor: 'pointer', color: h.color, boxShadow: h.shadow }}
            >{h.label}</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16 }}>
        <button className="btn btn-primary" onClick={actions.toHome} style={{ minHeight: 48, fontSize: 16 }}>Open today's practice</button>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--color-neutral-600)', textAlign: 'center' }}>You can change the hour at any time in Settings.</p>
      </div>
    </div>
  );
}
