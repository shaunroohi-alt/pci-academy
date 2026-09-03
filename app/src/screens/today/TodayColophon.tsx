import { useState } from 'react';
import type { ScreenProps } from '../types';

export function TodayColophon({ derived, actions }: ScreenProps) {
  const [showReflection, setShowReflection] = useState(false);

  return (
    <div
      className="pci-screen pci-topbar"
      style={{
        display: 'flex', flexDirection: 'column', padding: '0 28px 40px',
        background: '#1a1816', color: 'var(--color-neutral-200)', position: 'relative', overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute', right: -18, top: 40, fontFamily: 'var(--font-heading)', fontWeight: 400,
          fontSize: 'clamp(220px, 80vw, 340px)', lineHeight: 1, color: 'var(--color-accent)', opacity: .14,
          fontFeatureSettings: "'tnum'", pointerEvents: 'none',
        }}
      >{derived.dayNo}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--color-accent-400)', fontFeatureSettings: "'tnum'", position: 'relative' }}>
        <span>Chapter {derived.chapterNum}</span><span>Day {derived.dayNo} · {derived.weekdayLabel}</span>
      </div>

      <div style={{ marginTop: 'auto', position: 'relative' }}>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-400)', marginBottom: 14 }}>Good morning, {derived.name}.</div>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(38px, 12vw, 56px)', lineHeight: .98, letterSpacing: '-.015em', color: '#f3f2f2' }}>
          {derived.practiceTitle}
        </div>
        <div style={{ height: 1, background: 'color-mix(in srgb, var(--color-accent) 50%, transparent)', margin: '24px 0 18px' }} />
        <p style={{ margin: 0, fontSize: 15, color: 'var(--color-neutral-400)', textAlign: 'justify', hyphens: 'auto' }}>{derived.practiceInstruction}</p>
        <div style={{ display: 'flex', gap: 18, marginTop: 18, fontSize: 12, color: 'var(--color-neutral-500)', fontFeatureSettings: "'tnum'" }}>
          <span>{derived.practiceMinutes} minutes</span><span>·</span><span>{derived.chapterDone} of 14 in this chapter</span>
        </div>

        {showReflection && (
          <div style={{ marginTop: 20 }}>
            <textarea
              className="pci"
              value={derived.draft}
              onChange={(e) => actions.setDraft(e.target.value)}
              placeholder="What did today's practice turn out to be about?"
              style={{
                width: '100%', minHeight: 64, background: 'transparent', color: '#f3f2f2',
                border: '1px solid color-mix(in srgb, #f3f2f2 20%, transparent)', borderRadius: 'var(--radius-md)',
                padding: '10px 12px', fontFamily: 'var(--font-heading)', fontSize: 16, resize: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                className="btn btn-ghost"
                onClick={actions.saveReflection}
                disabled={derived.draftEmpty || derived.isSaved}
                style={{ minHeight: 36, color: 'var(--color-accent-400)' }}
              >{derived.saveLabel}</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 34, position: 'relative' }}>
        {derived.practiceDone ? (
          <div style={{ fontSize: 13, color: 'var(--color-accent-400)', textAlign: 'center' }}>Completed at {derived.doneAt} — well done.</div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={actions.toPractice}
            style={{ minHeight: 48, fontSize: 16, color: 'var(--color-accent-400)', borderColor: 'var(--color-accent-400)' }}
          >Begin</button>
        )}
        <button className="btn btn-ghost" onClick={() => setShowReflection((v) => !v)} style={{ minHeight: 44, color: 'var(--color-neutral-400)' }}>
          {showReflection ? 'Hide reflection' : "Write today's reflection"}
        </button>
      </div>
    </div>
  );
}
