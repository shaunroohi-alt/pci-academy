import type { CSSProperties } from 'react';
import type { Screen } from '../state/types';
import { TabHomeIcon, TabJournalIcon, TabPathIcon, TabProfileIcon } from './icons';

interface Props {
  screen: Screen;
  dark?: boolean;
  toHome: () => void;
  toPath: () => void;
  toJournal: () => void;
  toProfile: () => void;
}

export function TabBar({ screen, dark = false, toHome, toPath, toJournal, toProfile }: Props) {
  const style = dark
    ? ({
        background: '#1a1816',
        borderTop: '1px solid color-mix(in srgb, #f3f2f2 14%, transparent)',
        '--tab-color': 'var(--color-neutral-500)',
        '--tab-active': 'var(--color-accent-400)',
      } as CSSProperties)
    : undefined;
  return (
    <div className="pci-tabbar" style={style}>
      <button className="pci-tab" aria-current={screen === 'home'} onClick={toHome}>
        <TabHomeIcon />Today
      </button>
      <button className="pci-tab" aria-current={screen === 'path'} onClick={toPath}>
        <TabPathIcon />Path
      </button>
      <button className="pci-tab" aria-current={screen === 'journal'} onClick={toJournal}>
        <TabJournalIcon />Journal
      </button>
      <button className="pci-tab" aria-current={screen === 'profile'} onClick={toProfile}>
        <TabProfileIcon />Profile
      </button>
    </div>
  );
}
