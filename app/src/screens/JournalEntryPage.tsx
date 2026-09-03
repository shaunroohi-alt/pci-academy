import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function JournalEntryPage({ derived, actions }: ScreenProps) {
  const entry = derived.entry;
  if (!entry) return null;
  return (
    <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
      <BackHeader onBack={actions.toJournal} right={`Day ${entry.day} · ${entry.date}`} />
      <div style={{ marginTop: 56 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(64px, 24vw, 96px)', lineHeight: .85, color: 'var(--color-accent-200)', fontFeatureSettings: "'tnum'" }}>
          {entry.day}
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 34, lineHeight: 1.15, marginTop: -10 }}>{entry.text}</div>
        <div style={{ height: 1, background: 'var(--color-divider)', margin: '26px 0 16px' }} />
        <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Written after</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 20, marginTop: 4 }}>{entry.practice}</div>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--color-neutral-700)' }}>{entry.chapter}</p>
      </div>
      {entry.hasCoach && (
        <div style={{ marginTop: 'auto', borderLeft: '1px solid var(--color-accent)', padding: '4px 0 4px 16px' }}>
          <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Your coach noted</div>
          <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-heading)', fontSize: 18, lineHeight: 1.3, fontStyle: 'italic' }}>{entry.coach}</p>
        </div>
      )}
    </div>
  );
}
