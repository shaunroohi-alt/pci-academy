import type { ScreenProps } from './types';

export function Welcome({ actions }: ScreenProps) {
  return (
    <div
      className="pci-screen pci-topbar"
      style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}
    >
      <div style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-accent)', fontFeatureSettings: "'tnum'" }}>
        Psycho Creative Intelligence Academy
      </div>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(44px, 15vw, 64px)', lineHeight: .98, letterSpacing: '-.02em' }}>
          A practice<br />for every<br />day.
        </div>
        <div style={{ height: 1, background: 'var(--color-divider)', margin: '26px 0 18px' }} />
        <p style={{ margin: 0, fontSize: 15, color: 'var(--color-neutral-700)', textAlign: 'justify', hyphens: 'auto' }}>
          One exercise, one reflection, one honest sentence about your day. The Academy's programme, carried in your pocket and read at your own pace.
        </p>
      </div>
      {/* No sign-in affordance: the programme lives on this device and there
          are no accounts to have. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 34 }}>
        <button className="btn btn-primary" onClick={actions.toIntent} style={{ minHeight: 48, fontSize: 16 }}>Begin</button>
      </div>
    </div>
  );
}
