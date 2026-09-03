import { TabBar } from './components/TabBar';
import { useAppState } from './state/useAppState';
import { CoachNote } from './screens/CoachNote';
import { Checkout } from './screens/Checkout';
import { Confirmation } from './screens/Confirmation';
import { Intentions } from './screens/Intentions';
import { Journal } from './screens/Journal';
import { JournalEntryPage } from './screens/JournalEntryPage';
import { NameRhythm } from './screens/NameRhythm';
import { Path } from './screens/Path';
import { Practice } from './screens/Practice';
import { Profile } from './screens/Profile';
import { Settings } from './screens/Settings';
import { Today } from './screens/today/Today';
import { Welcome } from './screens/Welcome';

function App() {
  const ctx = useAppState();
  const { s, derived, actions } = ctx;

  return (
    <div className="pci-app">
      {s.screen === 'welcome' && <Welcome {...ctx} />}
      {s.screen === 'intent' && <Intentions {...ctx} />}
      {s.screen === 'name' && <NameRhythm {...ctx} />}
      {s.screen === 'home' && <Today {...ctx} />}
      {s.screen === 'practice' && <Practice {...ctx} />}
      {s.screen === 'path' && <Path {...ctx} />}
      {s.screen === 'journal' && <Journal {...ctx} />}
      {s.screen === 'entry' && <JournalEntryPage {...ctx} />}
      {s.screen === 'note' && <CoachNote {...ctx} />}
      {s.screen === 'profile' && <Profile {...ctx} />}
      {s.screen === 'settings' && <Settings {...ctx} />}
      {s.screen === 'checkout' && <Checkout {...ctx} />}
      {s.screen === 'done' && <Confirmation {...ctx} />}

      {derived.showTabs && (
        <TabBar
          screen={s.screen}
          dark={s.screen === 'home' && s.todayStyle === 'colophon'}
          toHome={actions.toHome} toPath={actions.toPath} toJournal={actions.toJournal} toProfile={actions.toProfile}
        />
      )}
    </div>
  );
}

export default App;
