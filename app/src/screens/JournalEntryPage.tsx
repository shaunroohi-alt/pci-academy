import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function JournalEntryPage({ derived, actions }: ScreenProps) {
  const entry = derived.entry;
  if (!entry) {
    // Reachable only if an entry is opened and then removed; send the reader back.
    return (
      <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
        <BackHeader onBack={actions.toJournal} right="Journal" />
        <p style={{ marginTop: 40, fontSize: 15, color: 'var(--color-neutral-700)' }}>That entry is no longer here.</p>
      </div>
    );
  }

  return (
    <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
      <BackHeader onBack={actions.toJournal} right={`Day ${entry.day} · ${entry.dateLabel}`} />
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
    </div>
  );
}
