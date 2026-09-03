import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function Checkout({ s, derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ display: 'flex', flexDirection: 'column', padding: '0 24px 40px' }}>
      <BackHeader onBack={actions.toProfile} right="Membership" />
      <h2 style={{ margin: '18px 0 6px', fontWeight: 400, fontSize: 36, lineHeight: 1.05 }}>Continue the programme</h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--color-neutral-700)' }}>
        Full access to all seven chapters, weekly notes from your coach, and the complete journal.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {derived.plans.map((p) => (
          <button
            key={p.id}
            onClick={p.pick}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: 16, border: `1px solid ${p.border}`,
              borderRadius: 'var(--radius-md)', background: 'transparent', font: 'inherit', color: 'inherit',
              textAlign: 'left', cursor: 'pointer', boxShadow: p.shadow,
            }}
          >
            <span style={{ width: 16, height: 16, flexShrink: 0, borderRadius: '50%', border: `1.5px solid ${p.border}`, background: p.fill, boxShadow: p.dot }} />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 19 }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--color-neutral-600)' }}>{p.note}</span>
            </span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 22, fontFeatureSettings: "'tnum'" }}>{p.price}</span>
          </button>
        ))}
      </div>

      <div style={{ height: 1, background: 'var(--color-divider)', margin: '22px 0 18px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label>Name on card</label>
          <input className="input pci" value={derived.cardNameValue} onChange={(e) => actions.setCardName(e.target.value)} style={{ minHeight: 44 }} />
        </div>
        <div className="field">
          <label>Card number</label>
          <input
            className="input pci" value={s.cardNo} onChange={(e) => actions.setCardNo(e.target.value)}
            placeholder="0000 0000 0000 0000" inputMode="numeric"
            style={{ minHeight: 44, fontFeatureSettings: "'tnum'", borderColor: derived.cardBorder }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label>Expiry</label>
            <input className="input pci" value={s.expiry} onChange={(e) => actions.setExpiry(e.target.value)} placeholder="MM / YY" style={{ minHeight: 44 }} />
          </div>
          <div className="field">
            <label>CVC</label>
            <input className="input pci" value={s.cvc} onChange={(e) => actions.setCvc(e.target.value)} placeholder="···" style={{ minHeight: 44 }} />
          </div>
        </div>
        {s.payError && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-accent-700)' }}>
            Please complete the card details — a 16-digit number, expiry and CVC.
          </p>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingBottom: 10, borderBottom: '1px solid var(--color-divider)', fontFeatureSettings: "'tnum'" }}>
          <span>Due today</span><span>{derived.dueToday}</span>
        </div>
        <button className="btn btn-primary" onClick={actions.confirmPay} style={{ minHeight: 48, width: '100%', marginTop: 14, fontSize: 16 }}>Confirm membership</button>
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--color-neutral-600)', textAlign: 'center' }}>Renews automatically. Cancel from Settings at any time.</p>
      </div>
    </div>
  );
}
