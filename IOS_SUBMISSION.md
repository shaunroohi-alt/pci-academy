# PCI Academy — iOS submission notes

The web app is wrapped in a native iOS shell with Capacitor. The Xcode project
lives at `app/ios/App/App.xcodeproj` and is committed, so it can be opened and
archived directly.

Read the **Blockers** section before you submit. Two items there will fail
review as the app currently stands.

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

## Blockers

### 1. The card form will be rejected — Guideline 3.1.1

The Checkout screen takes a card number directly to unlock a membership. Apple
requires digital content and subscriptions consumed inside the app to go
through In-App Purchase. A card form for this is a straightforward rejection,
and it is the single most likely reason a first submission comes back.

There is a narrow carve-out (3.1.3, person-to-person experiences) for services
delivered live and one-to-one. A 98-day programme with a weekly written note
almost certainly does not qualify, and Apple makes that call, not you.

Three ways forward:

- **Ship v1 with no paywall.** Fastest route to approval. Remove the Checkout
  and membership screens, add them back once IAP is in place.
- **Implement StoreKit.** Configure an auto-renewable subscription in App
  Store Connect and drive it from a purchase plugin. Apple takes 15–30%.
- **Submit as-is** and expect a rejection with the guideline cited.

I would ship v1 without the paywall. It gets you a live app and a real review
history, and the subscription can land in 1.1.

### 2. The app opens with someone else's data — Guideline 2.1

A brand-new install currently shows Day 38 of the programme, a journal holding
six entries written by "Eleanor", and a weekly note from a coach. Dates are
hardcoded to "Tuesday · 2 Sept".

That is correct behaviour for the design prototype it came from, and wrong for
a shipping app. A reviewer opening it fresh sees content the user did not
write, which reads as demo scaffolding, and a genuine first user gets an
incoherent experience.

Needs, before submitting:

- Day count derived from the install or enrolment date, not fixed at 38.
- Real dates from the device clock.
- An empty journal for a new user, with a first-run empty state.
- Chapter progress starting at zero.

### 3. Required App Store Connect metadata

None of this is in the repo; it is entered on the web.

- **Privacy policy URL.** Mandatory for every app. Must be live before review.
- **Support URL.**
- **Screenshots** for the iPhone sizes App Store Connect currently asks for.
  Check the exact required sizes there, since Apple changes them.
- **Age rating** questionnaire.
- **Privacy nutrition labels.** The app collects nothing and sends nothing,
  so this is *Data Not Collected* — which is a genuinely nice position to be in.
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
  opens on Today. Card details are deliberately never written to disk.
- **Sign out** clears stored state.

### Worth knowing

State lives in `localStorage`, which iOS may evict under storage pressure. For
journal entries someone has kept for months that is a real risk. The durable
fix is `@capacitor/preferences` (native `UserDefaults`) or a backend with
accounts, which is also what you need for the coach to actually read entries.
