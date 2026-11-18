# Personal YouTube subscriptions

## 3.1.1 — Text-only YouTube collaborations

YouTube's current collaboration cards put channel names in metadata text and often omit channel links entirely. The reader now resolves those names through the signed-in subscriptions sidebar and saved channel records. This keeps collaboration uploads in the feed and lets them join channel and custom-group stacks. Tested against the text-only structure observed in Vivaldi on October 6, 2026. Reload the extension and YouTube tab to activate the update.

## 3.1.0 — Collaboration-aware stacks

A video listing multiple YouTube collaborators now belongs to each linked collaborator for stacking. A collaboration joins another upload when they share any channel, or when any collaborator belongs to the same custom group. The group filter includes collaborations through every matching collaborator. If YouTube shows a collaborator as plain byline text, the extension matches it against known subscribed channel names. Existing selection, regular-video priority, premiere exclusion, and native playback continue to apply.

A collaboration connects only stacks whose videos fit in the 24 hours before the newest upload. Older collaborations cannot merge otherwise separate current stacks. YouTube's visible card markup still determines which collaborators can be detected; a video with no channel link or recognizable byline name cannot be assigned to an unseen collaborator.

Reload the extension and YouTube so the currently loaded cards are recaptured with collaborator information. `npm run package` rebuilds the ZIP and extracts the current version into `dist/subspace-extension`.

## 3.0.1 — Single-video playback

One selected video opens a normal YouTube watch URL. Playlists are used only for multiple distinct selected videos, including when a larger stack is reduced to one selection.

## 3.0.0 — Native YouTube cards

The subscriptions page now keeps YouTube's own cards, grid, navigation and scrolling. The iframe replacement is removed. A compact `+ N videos` control appears immediately after the upload-age text; click it to choose or temporarily hide videos. Thumbnail/title links open the selected stack as a native YouTube temporary playlist. Regular videos lead Shorts and detected premieres are excluded.

Stacks retain the 24-hour anchor rule. The toolbar offers the overall time range, group filter, Play selected, selection, hidden-video restoration, and Groups & settings. Groups & settings opens the extension's configuration in a separate tab. Turning off subscription replacement or leaving the feed restores the original cards and links.

Only recognized cards loaded on the subscriptions page participate in native stacks. The extension rechecks as YouTube loads more cards and saves their metadata automatically, without opening an import tab. RSS still refreshes the cache independently. The standalone dashboard remains available for configuration and the local preview, but it no longer replaces YouTube's feed. Reload the extension and the YouTube tab to activate this version.

Verification: DOM fixture tests cover native link replacement, inline count placement, premiere exclusion, Shorts priority, lazy-loaded cards, deselection, duplicate prevention and cleanup. Live verification in the installed browser remains outstanding.

## 2.2.0 — Premiere filtering and video priority

Premieres (including completed uploads labeled “Premiered”) are excluded from cards and playback. Regular videos appear before Shorts in each stack and in Play selected, newest first within each type. The 24-hour stack boundary still uses the newest upload, even when it is a Short. Shorts-only stacks remain playable.

Reload the extension and YouTube, then sync subscriptions once to classify previously cached cards. Classification uses YouTube’s visible premiere labels and Shorts links/badges, not duration guesses. RSS preserves known classifications but does not identify premiere/Shorts status for uploads only seen through RSS.

## 2.1.0 — 24-hour stacks inside YouTube

Each channel or group is split into stacks spanning at most 24 hours from that stack’s newest upload. Older uploads start another card, even in the 48-hour or 7-day view. The boundary includes exactly 24 hours and never chains consecutive uploads into a longer stack. Page-derived dates remain approximate until RSS supplies exact timestamps.

With Replace YouTube Subscriptions enabled, the cards replace the feed inside `youtube.com/feed/subscriptions` (also recognized at `/subscriptions`). YouTube’s surrounding navigation stays available. Leaving the page or disabling replacement restores its native content. Home replacement and the extension icon lead to this embedded feed. Imports still use the native feed and switch back after saving.

Reload **Subscriptions** on your browser’s Extensions page, then reload YouTube. The installed `dist/subspace-extension` copy has also been updated.

## 2.0.1 import fix

Sync now remembers its tab in extension session storage before opening YouTube, and latches import mode before YouTube removes URL query parameters. The dashboard redirect cannot interrupt a pending import. The parser also accepts modern `/channel/UC…` links, retains cards across DOM recycling, and reports unreadable dates instead of returning an empty success.

If you loaded `dist/subspace-extension`, that extracted copy has been updated too. In your browser's Extensions page, reload **Subscriptions**, then click **Read YouTube subscriptions** in its dashboard. Existing groups and settings remain in place.


A minimal, dark, cards-only Chrome extension. No sidebar, branding, backend, API key, or custom video player.

## Install or update

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select the project's `extension` folder. Alternatively, extract `dist/subspace-extension.zip` and select the extracted folder containing `manifest.json`.
3. If you already loaded this folder, click the extension's **Reload** button instead. Reload any open YouTube tabs too.
4. Click the extension icon, then the refresh icon in the dashboard. It opens your signed-in YouTube subscriptions page, reads the rendered video cards, loads further rows as needed, then returns to the dashboard.

The import panel also offers **Use loaded videos** and **Cancel**. Sign in to YouTube in the **same browser profile as the installed extension**. The Codex in-app browser and your regular Chrome/Vivaldi profile can have different sign-ins and extension storage.

## Cards and controls

- Dark mode by default; an optional light mode lives in Settings.
- Three columns at normal desktop widths, two on smaller screens, one on phones.
- One card per 24-hour stack within a channel or group, with the latest visible thumbnail, avatar, title, duration, channel name, view count, and upload age. A watch-progress line is shown only if present in the source data.
- The black **+ N more videos in this stack** strip expands individual video selection and hide controls.
- Stack checkboxes appear on hover/focus and are always visible on touch screens. Deselecting does not hide a card.
- The three-dot menu provides playback, selection, hiding, and group management.
- Hidden videos stay out of queues for 24 hours; restore them from Settings → Hidden videos.
- Groups combine multiple channels into shared 24-hour stacks and queues. Manage them from Settings.
- Default time window: the last 24 hours. The small time-range control also offers 48 hours and 7 days. It never silently widens the window or falsifies dates to fill an empty feed.

## Native YouTube playback

Clicking a card opens its selected videos at YouTube's `watch_videos?video_ids=…` URL. YouTube turns that into its own temporary playlist, displayed beside its native player with next, previous, loop, and shuffle controls. **Play selected** does this for all selected, non-hidden videos in the current feed/group.

There is no extension player, extension queue panel, local saved-playlist feature, or `subspace_queue` URL parameter in the new flow. Existing v1 local playlist records are left untouched in storage, but are no longer presented as YouTube playlists.

**These are temporary YouTube playlists, not automatically saved playlists in your account's Library.** No permanent playlist is created or published. This matches a play queue, not an authenticated YouTube Data API playlist-creation operation.

In live verification on September 27, 2026, a 60-video request produced a 50-video native list. The dashboard therefore offers explicit batches for selections over 50 instead of silently losing the remainder. This YouTube endpoint is not a documented stable API and could change.

## Source data

The primary importer reads rendered cards on your actual signed-in subscriptions page. It supports the current `yt-lockup-view-model` structure as well as older rich-grid video cards. This gives it thumbnails, avatars, durations, view counts, relative upload ages, and visible watch progress. It never reads cookies or exports authentication credentials.

- Only channels/video cards loaded in the subscriptions feed are captured. This is not a complete export of channels that have no visible uploads.
- Relative ages are marked approximate. “1 day ago” is conservatively excluded from the strict last-24-hours view. Unrecognized dates and upcoming videos are excluded rather than invented.
- Reimporting does not reset an older approximate upload time to make it look newer.
- Up to seven days of cached videos are retained. Groups, hidden state, and deselections persist.
- A periodic RSS refresh runs every 30 minutes while Chrome is running. It can resolve imported handles to channel IDs, correct exact publication dates, and add uploads between manual page imports. Existing thumbnail, duration, and view metadata are preserved.
- RSS can expose only a channel's latest approximately 15 uploads. The page importer avoids that per-feed limit for cards visible on YouTube. Refreshing RSS alone still cannot guarantee exhaustive coverage of very busy channels.
- Failed RSS refreshes keep existing videos and offer a page resync.
- Layout/localization changes on YouTube may require importer adjustments. Unknown labels do not become fake dates.

## Preview and real imported data

Run `npm run dev` and open `http://127.0.0.1:5173`. The web preview starts empty and has no fabricated demo channels. In this session the signed-in in-app browser's subscription cards were imported into the preview's local storage: **SUKA. and Secular Talk**, with **40 cached videos inside seven days**. Their latest uploads were labeled “1 day ago,” so the preview was explicitly switched to **Last 7 days**. The extension still defaults to 24 hours for a new install.

The personal capture stays in that local browser origin. It is not bundled into the extension or committed as a dataset. The extension reads whichever YouTube account is signed in to its own browser profile when you sync.

## Development and checks

```sh
npm install
npm run dev
npm run check
npm test
npm run test:browser
npm run test:extension
npm run package
```

Every update must finish with `npm run package`. This rebuilds `dist/subspace-extension.zip` and automatically extracts it into `dist/subspace-extension`, keeping the unpacked installation updated.

The extension itself has no runtime package dependencies and needs no compilation. Chrome-based regression scripts use `/usr/bin/google-chrome` (override with `CHROME_PATH`) and isolated test profiles.

Earlier UI verification (before the 2.1.0 embedding change):

- Core tests covering cutoff dates, grouping, selection, hiding, cache merge, relative dates, input/image sanitization, preserved metadata, and native queue URLs.
- Live signed-in subscription inspection and import through the in-app browser.
- Live YouTube native list verification, including the observed 50-video limit.
- Real-data UI checks for stack expansion, deselection, hiding, restoration, and reload persistence.

The browser/extension regression scripts have been updated for the new UI and importer; run them for repeatable fixture checks. The installed-extension importer still needs a live run in the browser profile where you load this updated version.

## Privacy

Groups, videos, and settings stay in `chrome.storage.local` (or origin-local storage for the web preview). No analytics or application server is included. The extension requests only `storage`, `alarms`, and access to `https://www.youtube.com/*`. YouTube images load from YouTube's image hosts. Public RSS/channel lookup requests omit credentials; the subscriptions page itself uses your normal YouTube sign-in.

Import-fix verification: 29 Node tests pass, including URL canonicalization before and after content-script startup, registration-before-navigation, redirect protection, failed-import diagnostics, DOM recycling, and direct channel-link parsing. The user’s installed extension page is blocked from automated browser inspection; reload the updated installed copy to verify the live end-to-end import.

2.1.0 verification: Node regression tests cover anchored stack boundaries, embedding lifecycle, and import routing. Syntax and manifest checks pass. Live embedded rendering still requires verification after reloading the extension in your browser.
