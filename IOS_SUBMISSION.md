# PCI Academy — iOS submission notes

The web app is wrapped in a native iOS shell with Capacitor. The Xcode project
lives at `app/ios/App/App.xcodeproj` and is committed, so it can be opened and
archived directly.

Read the **Before you submit** section. Nothing there fails review outright
any more, but two items need your decision first.

**v1 ships with no paywall.** The Checkout and Confirmation screens, the
membership card on Profile and the membership row in Settings are gone, along
with all payment state. Nothing in the app takes money, which puts Guideline
3.1.1 out of scope entirely. See *Restoring the paywall* at the foot of this
file for the 1.1 path.

---

## What you need

| | |
|---|---|
| A Mac | Xcode only runs on macOS. There is no way around this. |
| Xcode 15 or later | Free from the Mac App Store. |
| Apple Developer Program | 99 USD a year. Required to upload at all. |

Capacitor 8 uses Swift Package Manager, so there is **no CocoaPods step**.

---

## Build and upload

```bash
cd app
npm install
npm run ios:sync      # builds the web app and copies it into the iOS project
npm run ios:open      # opens Xcode
```

In Xcode:

1. Select the **App** target → **Signing & Capabilities**.
2. Set **Team** to your Apple Developer team. Leave *Automatically manage
   signing* on.
3. The bundle identifier is `com.pciacademy.app`. Change it if you own a
   different one, and register the same value in App Store Connect.
4. Set the run destination to **Any iOS Device (arm64)**.
5. **Product → Archive**, then **Distribute App → App Store Connect**.

Re-run `npm run ios:sync` after any change to the web app, or Xcode will
package the previous build.

### Version numbers

`MARKETING_VERSION` (1.0) and `CURRENT_PROJECT_VERSION` (1) are set in the
Xcode project. Every upload needs a build number higher than the last one
under the same version, or App Store Connect rejects the binary.

---

## Before you submit

### 1. The programme copy is mine, not the Academy's

`app/src/state/programme.ts` holds ninety-eight practices and seven chapter
letters. I wrote them so the app has a complete, coherent programme to run on
rather than stopping partway through chapter one.

They are placeholder. This is the Academy's actual course material and their
intellectual property, and the app is only as good as what is in that file.
Replace the copy before launch. The shapes the app depends on are the
`Practice` and `Letter` types; the words are yours to change freely.

### 2. The reminder toggles do not yet send anything

Settings offers a daily practice reminder, a chapter-letter notice and an
evening nudge. They persist a preference and nothing more, because no
notifications are scheduled anywhere in the app.

That makes them controls that appear to do something and do not, which is
worth fixing before launch and is arguably a completeness problem under
Guideline 2.1. Wiring it needs `@capacitor/local-notifications`: request
permission after onboarding, then schedule a repeating daily notification at
the chosen hour. I did not add it here because it cannot be tested without a
device, and shipping untested native code is worse than a known gap. Either
wire and test it on a device, or remove the Notices section for v1.

### 3. Required App Store Connect metadata

None of this is in the repo; it is entered on the web.

- **Privacy policy URL.** Mandatory for every app. Must be live before review.
- **Support URL.**
- **Screenshots** for the iPhone sizes App Store Connect currently asks for.
  Check the exact required sizes there, since Apple changes them.
- **Age rating** questionnaire.
- **Privacy nutrition labels.** The app collects nothing and sends nothing,
  so this is *Data Not Collected* — which is a genuinely nice position to be in.
- **Pricing** is Free. With no purchase of any kind in the binary, you do not
  need paid-app agreements or banking details in place to submit.
- **Export compliance** is already answered in `Info.plist`
  (`ITSAppUsesNonExemptEncryption` = false), so it will not prompt each upload.

---

## What is already handled

- **App icon** — 1024×1024, fully opaque, no alpha channel and no pre-rounded
  corners. An icon with transparency is rejected at upload time.
- **Launch screen** — cream ground matching the Welcome screen, so the launch
  dissolves into the app rather than flashing white or black.
- **Typefaces bundled.** Cormorant Garamond and Lora are self-hosted in
  `src/assets/fonts`. The app previously fetched them from Google's CDN, which
  meant fallback system fonts on first launch and permanently offline.
  Verified: the running app makes **zero external network requests**.
- **Safe areas.** `viewport-fit=cover` is set, and the layout respects
  `env(safe-area-inset-*)` so content clears the Dynamic Island and the home
  indicator.
- **Portrait only**, iPhone only. That also means no iPad screenshots are
  required.
- **Light appearance pinned.** The palette is a single committed light theme;
  without pinning, iOS in dark mode draws the status bar white on cream.
- **State persists** across launches in `localStorage`, and a returning user
  opens on Today.
- **Sign out** clears stored state.
- **No prototype data.** The programme runs off the enrolment date recorded
  when onboarding completes. The day number, the date line, chapter progress
  and the streak are all derived from that and the device clock. A fresh
  install opens on day one of chapter one with an empty journal and zeroed
  statistics, so a reviewer sees a real first run.
- **No false claims.** Nothing leaves the device, so the app no longer says a
  coach reads your entries; the weekly note is now a letter that opens with
  each chapter, and the sign-in affordance is gone because there are no
  accounts.

### Worth knowing

State lives in `localStorage`, which iOS may evict under storage pressure. For
journal entries someone has kept for months that is a real risk. The durable
fix is `@capacitor/preferences` (native `UserDefaults`) or a backend with
accounts, which is also what you need for the coach to actually read entries.

---

## Restoring the paywall in 1.1

The paywall was deleted rather than hidden behind a flag, deliberately:
shipping disabled purchase code invites Guideline 2.3.1, and git history is a
better record than dead code.

To bring it back, recover the deleted files and their wiring:

```bash
git log --oneline --diff-filter=D -- app/src/screens/Checkout.tsx
git show <sha>^:app/src/screens/Checkout.tsx > app/src/screens/Checkout.tsx
git show <sha>^:app/src/screens/Confirmation.tsx > app/src/screens/Confirmation.tsx
```

The same commit's diff shows every other edit to reverse: the `checkout` and
`done` entries in the `Screen` union, the payment fields on `AppState`, the
`plans` and `planLabel` derived values, the card actions on the state hook,
`PRICES` in `data.ts`, the membership card on Profile, and the membership row
in Settings.

Do not restore the card form itself. Replace it with StoreKit through a
purchase plugin, driven by an auto-renewable subscription configured in App
Store Connect. The recovered screens are useful as layout, not as a payment
path.
