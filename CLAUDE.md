# Bo7 site — working notes for Claude

Read this first. It is the hand-off from the session that built the site (Oct 2026).

## What this is

A static rebuild of **bo7.ie**, a semi-private personal training gym with two gyms in south Dublin: **Killiney** (4 Military Road, Ballybrack, A96 PR58, the original) and **Blackrock** (Unit 30, Blackrock Village Shopping Centre, A94 C2N7, new). Founder is **Ryan**. Eoin (the user) is doing this as a favour for a friend; the goal is a lead funnel, not a brochure. The only conversion is **"Book a free consultation"**, which opens an overlay offering WhatsApp first, then Glofox's lead form.

- Live: **https://bo7.ie/** (GitHub Pages, repo `bo7-gym/bo7-site`, owned by Bo7, branch `main`). Every push to `main` deploys `site/` via `.github/workflows/pages.yml`. Until DNS is switched it is tested at https://new.bo7.ie/. Eoin's copy (`dowling-home/bo7-site`, bo7.thedowlings.co) stays up as the prototype and playbook; it is no longer where the public site changes.
- `reference/` holds Eoin's internal pages (plan deck, playbook, dashboard and members mockups, email, font comparison). **It is not published**; only `site/` is.
- Old site: Squarespace. Crawl and content inventory in `source/` (`CONTENT-INVENTORY.md`, per-page Markdown in `source/pages/`). Heavy originals are gitignored.
- `AUDIT.md`: what was wrong with the old site and the planned page structure.
- `HANDOVER-NOTES.md`: running list of (a) things on Ryan's side to fix and (b) a table of old site vs new build. **Append to it whenever you find something on their side or change something structural.** Eoin wants to walk Ryan through it at the end.

## Files

- `site/index.html`: the homepage, the only page so far. Planned later: /blackrock, /killiney, /results, /coaches, /pricing, /thank-you.
- `site/styles.css`: all styles. Design tokens at the top (`--ink`, `--paper`, `--paper-2`, `--stone`, `--muted`, `--gold`, `--gold-deep`, `--gold-ink`, `--max` 1320px, `--nav-h` 64px, `--hero-h` 700px). Sections are full-bleed; content sits in `.in` (max-width 1320px).
- `site/site.js`: booking overlay, video lightbox, mobile menu, hero video source selection, sticky bar reveal, click-to-load YouTube, scroll reveals.
- `site/assets/img/*.webp`: photos (1800w and 900w). `site/assets/video/`: hero loop (`hero-720.mp4` desktop, `hero-540.mp4` phones, poster) and Ryan's 44 s message (`ryan-720.mp4`).
- `reference/fonts.html`: font-pairing comparison page (not published).

## Design decisions (don't undo without asking)

- **Brand Guidelines v1.0 (2026) from Ryan override earlier choices** (21 Oct 2026). Fonts: Helvetica Neue, Inter as the web fallback; headlines bold sentence case, detail labels bold caps tracked +200. Colours only from the brand palette: Black #0A0A0A, Tan #C49A6C, Deep Tan #8F704F, Bone #F4EFE7, Cream #E8DFD0, Graphite #1F1F1F. Tan is an accent, never a background or long text. No other accent hue, with one exception Ryan asked for (21 Oct 2026): WhatsApp buttons and links stay WhatsApp green `--wa` #25D366 with black text and mark, so they stand out. Logo is tan (`assets/bo7-logo-tan.png`). Tagline is "Futureproof your body." (one word).
- Hero: left text column, right video column (700px tall on desktop). On phones the video sits full-bleed behind the copy with a gradient scrim; the hero block is **exactly one viewport tall** (`minmax(calc(100svh - var(--nav-h)), auto)`) and ends after the Google rating line; the pins strip (Blackrock / Killiney / "All levels · beginners welcome") sits beneath it as a black band. Check any hero change at 390x844 and 360x780: the text block must still end at the viewport edge.
- Hero lede has an animated white marker highlighter: four segments (the long sentence splits at its first comma), 2 s start, 0.6 s in / 1 s hold / 0.5 s out, each recedes before the next. Outer `.hl` draws the box, inner `.hl__t` paints text black via a text-clipped gradient so letters only turn black as the marker reaches them.
- Header: sticky on all sizes. Mobile shows logo, hamburger, and "Book a free consult" (falls back to "Book" under 360px). The header CTA has a light-sweep shine every 5 s.
- Sticky bottom bar (phones only): one gold button "Book a free consultation" with mail + WhatsApp icons; hidden until the hero has scrolled out of view.
- Booking overlay `<dialog id="book">`: no location picker (Eoin removed it). WhatsApp first (prefilled message), "or", then the Glofox lead form iframe for the **Killiney** branch `6659f3a6bc0507bc710421c5` (Blackrock branch `681a3f74d2e34f87d40dcbf8` has no consent checkboxes set up, so all web leads go to Killiney and are routed by hand). The `#start` section at the bottom is the no-JS fallback with the same form.
- Ryan's section: portrait with a play button in the lower third (keep it off his face), opens a lightbox `<dialog id="vid">` playing `ryan-720.mp4` with sound.
- Results: six YouTube Shorts as portrait tiles (click to load), one Google rating line "4.9 from 99 Google reviews" linking to the Killiney reviews, then three verbatim Google review quotes (John, Orla, Jay). The same rating line, unlinked, sits under the hero buttons. **Numbers are hard-coded as of 8 Oct 2026.**
- Locations: embedded keyless Google Maps (`https://www.google.com/maps?q=...&output=embed`) showing the gyms' own Business pins, with "Open in Google Maps" links.
- Footer: Instagram icon + `@bo7_gym` (confirmed correct handle).

## Hard-won gotchas

- **Closed `<dialog>`s must stay `display:none`.** A desktop rule once set `.book { display:grid }` unconditionally, which made an invisible full-viewport dialog eat wheel scrolling and clicks over the hero. The guard is `.book:not([open]), .vid:not([open]) { display:none }`. Keep it.
- `scroll-behavior: smooth` is on `html`; when measuring scroll in tests use `behavior: 'instant'`.
- Full-page screenshots miss lazy images and `[data-reveal]` sections; before capturing, run a script that sets `loading='eager'` on lazy images/iframes and adds class `is-in` to every `[data-reveal]`.
- The Glofox iframe sets its own dark theme and shows a "Register Your Interest" title we cannot style (it's cross-origin). Eoin decided not to clip it; it's logged in the handover notes.
- The hero video source is picked in JS by viewport width at load (`data-src-small` / `data-src-large`).
- Reduced-motion users get the poster frame, no highlighter sweep, no shine.

## How to verify changes (Eoin expects screenshots)

1. Local server: Chrome DevTools MCP works well; the in-app browser pane is flaky. Start `npx -y http-server C:/Users/eoin/ClaudeCoWork/bo7-gym/site -p 3020 -c-1 --silent` in the background if nothing is on :3020 (there is also a launch config named `bo7-site` in `~/.claude/launch.json`).
2. Use `mcp__chrome-devtools__new_page` on `http://localhost:3020/`, `resize_page` 1366x860 for desktop, and `emulate` with viewport `390x844x2,mobile,touch` (plus 360x780 for narrow phones). Reload with `ignoreCache: true` after CSS edits; the server sends no-cache but Chrome sometimes keeps the old stylesheet.
3. Check `list_console_messages` for errors. Save screenshots under `source/` (gitignored) and send them to Eoin with `SendUserFile`.
4. Then commit and push:
   ```
   git -c user.name="James McCahill" -c user.email="jamesmcc@bo7.ie" commit -m "<what changed>

   Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
   git push bo7 main   (remote `bo7` = https://github.com/bo7-gym/bo7-site.git)
   ```
   Wait for the deploy (`gh run list --repo bo7-gym/bo7-site --limit 1`, make sure it is the run created after your push, then `gh run watch <id> --repo bo7-gym/bo7-site --exit-status --interval 10`) and confirm with `curl -s "https://bo7.ie/?v=<timestamp>"` that the change is in the live HTML/CSS. Say explicitly when something is live.
   (If this session's attribution reminder names a different model, use that name in the Co-Authored-By line instead.)

## How Eoin likes to work

- One change at a time, verified, pushed, then a short report: what changed, what was verified, anything he needs to decide. Lead with the outcome. No em dashes.
- Give a recommendation rather than a menu. If a request conflicts with something above, say so in a sentence and do it his way.
- Never invent facts about the gym (prices, member counts, coach names, review text). If data is missing, say so and add it to the "Still needed from Ryan" list in `HANDOVER-NOTES.md`.
- Don't touch the content in `source/`; it is the crawl of the old site.

## Still needed from Ryan (as of 8 Oct 2026)

Prices, coach names/bios/photos, Blackrock photos (all shots are Killiney), permission to show reviewers' first names, Google Places API key if the rating should stay live, a decision on a cookie notice (maps and YouTube set cookies), and GTM/GA4 tags before launch on bo7.ie (old site used GTM-NJRHF7LZ and G-Z20JQXCC3R).
