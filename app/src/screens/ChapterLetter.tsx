import { BackHeader } from '../components/BackHeader';
import type { ScreenProps } from './types';

/**
 * The letter that opens each chapter. It is programme material, the same for
 * every reader — deliberately not framed as a reply from a coach, because
 * nothing leaves the device and nobody is reading these entries.
 */
export function ChapterLetter({ derived, actions }: ScreenProps) {
  return (
    <div className="pci-screen pci-topbar scrolls" style={{ padding: '0 28px 44px' }}>
      <BackHeader onBack={actions.toHome} right={`Letter · Chapter ${derived.chapterNum}`} />
      <h2 style={{ margin: '28px 0 10px', fontWeight: 400, fontSize: 36, lineHeight: 1.05 }}>{derived.letterTitle}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--color-accent)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-heading)', fontSize: 15, color: 'var(--color-accent)' }}>
          {derived.chapterNum}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-neutral-600)' }}>
          From the Academy · opens with {derived.chapterName}
        </div>
      </div>
      {derived.letterParagraphs.map((p, i) => (
        <p key={i} style={{ fontSize: 15, textAlign: 'justify', hyphens: 'auto' }}>{p}</p>
      ))}
      <div style={{ height: 1, background: 'var(--color-divider)', margin: '8px 0 16px' }} />
      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-neutral-600)', fontStyle: 'italic' }}>
        The next letter opens with the next chapter.
      </p>
    </div>
  );
}
