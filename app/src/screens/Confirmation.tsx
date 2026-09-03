import type { ScreenProps } from './types';

export function Confirmation({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
      <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Membership confirmed</div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(84px, 32vw, 130px)', lineHeight: .9, color: 'var(--color-accent-200)', fontFeatureSettings: "'tnum'" }}>II</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(30px, 10vw, 44px)', lineHeight: 1, marginTop: -18 }}>
          Welcome to the<br />full programme, {derived.name}.
        </div>
        <div style={{ height: 1, background: 'var(--color-divider)', margin: '24px 0 16px' }} />
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-neutral-700)', textAlign: 'justify' }}>
          Your {derived.planLabelLower} membership begins today. Chapter III opens when Chapter II is complete — no sooner. A receipt is in your inbox.
        </p>
      </div>
      <button className="btn btn-primary" onClick={actions.toHome} style={{ minHeight: 48, marginTop: 34, fontSize: 16 }}>Return to today</button>
    </div>
  );
}
