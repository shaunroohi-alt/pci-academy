import { BackHeader } from '../components/BackHeader';
import type { TodayStyle } from '../state/types';
import type { ScreenProps } from './types';

const TODAY_STYLES: { id: TodayStyle; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'colophon', label: 'Colophon' },
];

export function Settings({ s, derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <BackHeader onBack={actions.toProfile} right="Settings" />
      <h2 style={{ margin: '26px 0 20px', fontWeight: 400, fontSize: 36, lineHeight: 1.05 }}>Your rhythm</h2>

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

      <div style={{ marginTop: 26 }}>
        <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Notices</h6>
        {derived.notices.map((n) => (
          <button key={n.key} className="pci-row" onClick={n.toggle}>
            <span>
              <span style={{ display: 'block', fontSize: 15 }}>{n.label}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-600)' }}>{n.sub}</span>
            </span>
            <span style={{ width: 36, height: 20, flexShrink: 0, borderRadius: 10, border: `1px solid ${n.ring}`, position: 'relative', background: n.bg }}>
              <span style={{ position: 'absolute', top: 2, left: n.knob, width: 14, height: 14, borderRadius: '50%', background: n.knobBg, transition: 'left .18s' }} />
            </span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 26 }}>
        <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Appearance</h6>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 54, padding: '0 2px', borderBottom: '1px solid var(--color-divider)' }}>
          <span style={{ fontSize: 15 }}>Today screen style</span>
          <div style={{ display: 'flex', border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {TODAY_STYLES.map((t) => {
              const on = s.todayStyle === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => actions.setTodayStyle(t.id)}
                  style={{
                    padding: '8px 10px', background: 'transparent', border: 0, borderLeft: '1px solid var(--color-divider)',
                    font: 'inherit', fontSize: 12, cursor: 'pointer',
                    color: on ? 'var(--color-accent)' : 'var(--color-text)',
                    boxShadow: on ? 'inset 0 0 0 1px var(--color-accent)' : 'none',
                  }}
                >{t.label}</button>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>You</h6>
        {/* Static rows, not buttons: nothing here is tappable, and a control
            that looks interactive but does nothing is worse than none. */}
        <div className="pci-row" style={{ cursor: 'default' }}>
          <span>Name</span><span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>{derived.name}</span>
        </div>
        <div className="pci-row" style={{ cursor: 'default' }}>
          <span>Began</span><span style={{ fontSize: 13, color: 'var(--color-neutral-600)' }}>{derived.joinedLabel.replace('Since ', '')}</span>
        </div>
        <div className="pci-row" style={{ cursor: 'default' }}>
          <span>Day</span><span style={{ fontSize: 13, color: 'var(--color-neutral-600)', fontFeatureSettings: "'tnum'" }}>{derived.dayNo} of 98</span>
        </div>
      </div>

      <button className="btn btn-ghost" onClick={actions.signOut} style={{ marginTop: 24, minHeight: 44, color: 'var(--color-neutral-700)' }}>Sign out</button>
    </div>
  );
}
