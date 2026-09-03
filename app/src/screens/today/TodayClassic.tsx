import { Plate } from '../../components/Plate';
import { CheckIcon, ForwardIcon } from '../../components/icons';
import type { ScreenProps } from '../types';

export function TodayClassic({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent)', fontFeatureSettings: "'tnum'" }}>
        <span>{derived.dayLabel}</span><span>Day {derived.dayNo}</span>
      </div>
      <h1 style={{ margin: '14px 0 4px', fontWeight: 400, fontSize: 40, lineHeight: 1.02 }}>Good morning, {derived.name}.</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--color-neutral-700)' }}>{derived.chapterName}</p>

      <Plate caption="Today's plate — drop a photograph" />

      <div style={{ marginTop: 20, border: '1px solid var(--color-divider)', borderRadius: 'var(--radius-md)', padding: '18px 18px 16px' }}>
        <div style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
          Today's practice · {derived.practiceMinutes} min
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 600, fontSize: 24, lineHeight: 1.15, margin: '8px 0 8px' }}>{derived.practiceTitle}</div>
        <p style={{ margin: '0 0 14px', fontSize: 13.5, color: 'var(--color-neutral-700)', textAlign: 'justify', hyphens: 'auto' }}>{derived.practiceInstruction}</p>
        {derived.practiceDone ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0 4px', fontSize: 13, color: 'var(--color-accent-700)' }}>
            <CheckIcon style={{ width: 16, height: 16 }} />Completed at {derived.doneAt} — well done.
          </div>
        ) : (
          <button className="btn btn-primary" onClick={actions.toPractice} style={{ minHeight: 44, width: '100%' }}>Begin the practice</button>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h4 style={{ margin: 0, fontSize: 20 }}>Reflection</h4>
          <span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>one sentence</span>
        </div>
        <textarea
          className="input pci"
          value={derived.draft}
          onChange={(e) => actions.setDraft(e.target.value)}
          placeholder="What did today's practice turn out to be about?"
          style={{ marginTop: 10, minHeight: 84, fontSize: 15, fontFamily: 'var(--font-heading)', lineHeight: 1.4, resize: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-ghost" onClick={actions.saveReflection} disabled={derived.draftEmpty || derived.isSaved} style={{ minHeight: 40 }}>
            {derived.saveLabel}
          </button>
        </div>
      </div>

      <button className="pci-row" onClick={actions.toNote} style={{ marginTop: 8, borderTop: '1px solid var(--color-divider)', minHeight: 64 }}>
        <span>
          <span style={{ display: 'block', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Letter · Chapter {derived.chapterNum}</span>
          <span style={{ display: 'block', fontFamily: 'var(--font-heading)', fontSize: 18, marginTop: 2 }}>{derived.letterTitle}</span>
        </span>
        <ForwardIcon style={{ color: 'var(--color-neutral-500)', flexShrink: 0 }} />
      </button>

      <div style={{ paddingTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-neutral-700)', fontFeatureSettings: "'tnum'" }}>
          <span>{derived.chapterName}</span><span>{derived.chapterDone} of 14</span>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {derived.chapterDays.map((d, i) => (
            <span key={i} style={{ flex: 1, height: 2, background: d.color }} />
          ))}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--color-neutral-600)' }}>{derived.streakLine}</p>
      </div>
    </div>
  );
}
