import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

export function Practice({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar" style={{ display: 'flex', flexDirection: 'column', padding: '0 28px 44px' }}>
      <BackHeader onBack={actions.leavePractice} right={`Day ${derived.dayNo} · Practice`} />
      <div style={{ marginTop: 'auto', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 400, fontSize: 'clamp(84px, 30vw, 132px)', lineHeight: .9, fontFeatureSettings: "'tnum'", color: derived.timerColor }}>
          {derived.timerText}
        </div>
        <div style={{ height: 1, background: 'var(--color-divider)', margin: '28px 0 20px' }} />
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: 26, lineHeight: 1.15 }}>The unhurried minute</div>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: 'var(--color-neutral-700)', textAlign: 'justify', hyphens: 'auto' }}>{derived.practiceLine}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 38 }}>
        {derived.timerIdle && <button className="btn btn-primary" onClick={actions.startTimer} style={{ minHeight: 48, fontSize: 16 }}>Start the minute</button>}
        {derived.timerRunning && <button className="btn btn-secondary" onClick={actions.pauseTimer} style={{ minHeight: 48, fontSize: 16 }}>Pause</button>}
        {derived.timerPaused && <button className="btn btn-primary" onClick={actions.startTimer} style={{ minHeight: 48, fontSize: 16 }}>Resume</button>}
        {derived.timerEnded && <button className="btn btn-primary" onClick={actions.finishPractice} style={{ minHeight: 48, fontSize: 16 }}>Mark complete</button>}
        {derived.timerNotEnded && <button className="btn btn-ghost" onClick={actions.finishPractice} style={{ minHeight: 44, color: 'var(--color-neutral-700)' }}>I've done this already</button>}
      </div>
    </div>
  );
}
