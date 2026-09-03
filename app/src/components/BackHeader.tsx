import type { ReactNode } from 'react';
import { BackIcon } from './icons';

interface Props {
  onBack: () => void;
  right: ReactNode;
  /** 'accent' = small caps accent-colored label (most screens); 'muted' = plain neutral label with tabular numerals (onboarding steps). */
  tone?: 'accent' | 'muted';
}

export function BackHeader({ onBack, right, tone = 'accent' }: Props) {
  const style =
    tone === 'accent'
      ? { fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' as const, color: 'var(--color-accent)' }
      : { fontSize: 12, color: 'var(--color-neutral-600)', fontFeatureSettings: "'tnum'" };
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', ...style }}>
      <button className="btn btn-ghost pci-back" onClick={onBack}><BackIcon /></button>
      <span>{right}</span>
    </div>
  );
}
