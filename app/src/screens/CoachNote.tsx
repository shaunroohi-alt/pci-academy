import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function CoachNote({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 28px 44px' }}>
      <BackHeader onBack={actions.toHome} right="Weekly note · Week 6" />
      <h2 style={{ margin: '28px 0 10px', fontWeight: 400, fontSize: 36, lineHeight: 1.05 }}>On the difference between looking and seeing</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--color-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 16, color: 'var(--color-accent)' }}>M</div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>Maren Holt, your coach · Monday</div>
      </div>
      <p style={{ fontSize: 15, textAlign: 'justify', hyphens: 'auto' }}>
        {derived.name} — this week's practices all circle one idea: we mostly look, and rarely see. Looking is what the eye does on its own. Seeing is a decision.
      </p>
      <p style={{ fontSize: 15, textAlign: 'justify', hyphens: 'auto' }}>
        Your reflections from days 35 to 37 tell me you already suspect this. The walk without the phone was "shorter than I feared" — that is what it feels like when attention returns to the body.
      </p>
      <p style={{ fontSize: 15, textAlign: 'justify', hyphens: 'auto' }}>
        So for the unhurried minute, do not try to be interesting about the object. Sit with the dull one. Boredom is the doorway; the other side of it is where seeing begins.
      </p>
      <div style={{ height: 1, background: 'var(--color-divider)', margin: '8px 0 16px' }} />
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-600)', fontStyle: 'italic' }}>Next note arrives Monday, after I've read your week.</p>
    </div>
  );
}
