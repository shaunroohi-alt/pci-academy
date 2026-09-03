import { TODAY_PRACTICE } from '../../state/data';
import type { ScreenProps } from '../types';

export function TodayLedger({ s, derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 24px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--color-accent)', fontFeatureSettings: "'tnum'" }}>
        <span>Week 6</span><span>{TODAY_PRACTICE.chapter}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 16 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(72px, 24vw, 112px)', lineHeight: .85, fontFeatureSettings: "'tnum'" }}>{derived.dayNo}</div>
        <div style={{ paddingBottom: 8 }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 22, lineHeight: 1.1 }}>Tuesday</div>
          <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>2 September · Good morning, {derived.name}</div>
        </div>
      </div>

      <table className="table" style={{ marginTop: 22, fontFeatureSettings: "'tnum'" }}>
        <thead>
          <tr><th style={{ width: 44 }}>Day</th><th>Practice</th><th style={{ textAlign: 'right' }}>Min</th><th style={{ width: 28 }}></th></tr>
        </thead>
        <tbody>
          <tr style={{ color: 'var(--color-neutral-500)' }}><td>36</td><td>The list of small debts</td><td style={{ textAlign: 'right' }}>10</td><td style={{ color: 'var(--color-accent)' }}>✓</td></tr>
          <tr style={{ color: 'var(--color-neutral-500)' }}><td>37</td><td>Three breaths before speech</td><td style={{ textAlign: 'right' }}>8</td><td style={{ color: 'var(--color-accent)' }}>✓</td></tr>
          <tr style={{ boxShadow: 'inset 3px 0 0 var(--color-accent)' }}>
            <td style={{ fontFamily: 'var(--font-heading)', fontSize: 18 }}>{derived.dayNo}</td>
            <td>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 18, fontWeight: 600 }}>{TODAY_PRACTICE.title}</span><br />
              <span style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>Sit with one object for sixty seconds.</span>
            </td>
            <td style={{ textAlign: 'right' }}>{TODAY_PRACTICE.minutes}</td>
            <td style={{ color: 'var(--color-accent)' }}>{s.practiceDone ? '✓' : ''}</td>
          </tr>
          <tr style={{ color: 'var(--color-neutral-400)' }}><td>39</td><td>—</td><td style={{ textAlign: 'right' }}>·</td><td></td></tr>
          <tr style={{ color: 'var(--color-neutral-400)' }}><td>40</td><td>—</td><td style={{ textAlign: 'right' }}>·</td><td></td></tr>
        </tbody>
      </table>

      {s.practiceDone ? (
        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--color-accent-700)' }}>Completed at {s.doneAt} — well done.</div>
      ) : (
        <button className="btn btn-primary" onClick={actions.toPractice} style={{ minHeight: 48, width: '100%', marginTop: 20, fontSize: 16 }}>Begin day {derived.dayNo}</button>
      )}

      <div style={{ marginTop: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h4 style={{ margin: 0, fontSize: 20 }}>Reflection</h4><span style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>one sentence</span>
        </div>
        <textarea
          className="input pci"
          value={s.reflection}
          onChange={(e) => actions.setReflection(e.target.value)}
          placeholder="What did the object turn out to be?"
          rows={1}
          style={{
            marginTop: 12, width: '100%', border: 0, borderBottom: '1px solid var(--color-neutral-400)',
            borderRadius: 0, padding: '6px 0 10px', fontFamily: 'var(--font-heading)', fontSize: 19,
            background: 'transparent', resize: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-ghost" onClick={actions.saveReflection} disabled={!s.reflection.trim()} style={{ minHeight: 32, fontSize: 12 }}>
            {s.saved ? 'Kept in your journal' : 'Keep'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 26, display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: '1px solid var(--color-divider)' }}>
        <div style={{ padding: '14px 0' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontFeatureSettings: "'tnum'" }}>{derived.chapterDone} / 14</div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>chapter II</div>
        </div>
        <div style={{ padding: '14px 0 14px 16px', borderLeft: '1px solid var(--color-divider)' }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, fontFeatureSettings: "'tnum'" }}>{derived.entryCount}</div>
          <div style={{ fontSize: 11, color: 'var(--color-neutral-600)' }}>reflections written</div>
        </div>
      </div>
    </div>
  );
}
