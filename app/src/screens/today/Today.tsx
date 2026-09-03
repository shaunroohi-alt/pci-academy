import type { ScreenProps } from '../types';
import { TodayClassic } from './TodayClassic';
import { TodayLedger } from './TodayLedger';
import { TodayColophon } from './TodayColophon';

export function Today(props: ScreenProps) {
  switch (props.s.todayStyle) {
    case 'ledger': return <TodayLedger {...props} />;
    case 'colophon': return <TodayColophon {...props} />;
    default: return <TodayClassic {...props} />;
  }
}
