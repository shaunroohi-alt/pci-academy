import { GearIcon } from '../components/icons';
import type { ScreenProps } from './types';

export function Profile({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', border: '1px solid var(--color-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 28, color: 'var(--color-accent)' }}>
            {derived.initial}
          </div>
          <div>
            <h2 style={{ margin: 0, fontWeight: 400, fontSize: 32, lineHeight: 1.05 }}>{derived.name}</h2>
            <div style={{ fontSize: 12, color: 'var(--color-neutral-600)', marginTop: 2 }}>{derived.joinedLabel}</div>
          </div>
        </div>
        <button className="btn btn-ghost" onClick={actions.toSettings} style={{ minHeight: 44, minWidth: 44, padding: 8, color: 'var(--color-neutral-700)' }}>
          <GearIcon />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 26, borderTop: '1px solid var(--color-divider)', borderBottom: '1px solid var(--color-divider)' }}>
        <div style={{ padding: '14px 0' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{derived.daysPractised}</div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 4 }}>days practised</div>
        </div>
        <div style={{ padding: '14px 0 14px 16px', borderLeft: '1px solid var(--color-divider)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{derived.entryCount}</div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 4 }}>reflections</div>
        </div>
        <div style={{ padding: '14px 0 14px 16px', borderLeft: '1px solid var(--color-divider)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 30, lineHeight: 1, fontFeatureSettings: "'tnum'" }}>{derived.chapterNum}</div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-600)', marginTop: 4 }}>chapter</div>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <h6 style={{ margin: '0 0 6px', color: 'var(--color-accent)' }}>Your intentions</h6>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {derived.chosenIntents.map((c) => <span key={c} className="tag tag-outline">{c}</span>)}
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h6 style={{ margin: 0, color: 'var(--color-accent)' }}>Recent reflections</h6>
          {derived.hasEntries && (
            <button className="btn btn-ghost" onClick={actions.toJournal} style={{ minHeight: 32, fontSize: 13 }}>All entries</button>
          )}
        </div>
        {derived.hasEntries ? derived.recentEntries.map((e) => (
          <button key={e.day} className="pci-row" onClick={e.open} style={{ minHeight: 0, padding: '14px 2px', alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
            <span style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--color-neutral-600)', fontFeatureSettings: "'tnum'" }}>
              <span>{e.dateLabel}</span><span>Day {e.day}</span>
            </span>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, lineHeight: 1.3 }}>{e.text}</span>
          </button>
        )) : (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--color-neutral-600)' }}>
            Your first sentence will appear here once you have written it.
          </p>
        )}
      </div>

    </div>
  );
}
