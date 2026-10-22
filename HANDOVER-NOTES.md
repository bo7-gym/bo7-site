# Bo7 handover notes

Running list of things found while rebuilding bo7.ie, to go through with Ryan at the end. Two sections: what we changed versus the current site, and things on their side that need fixing regardless.

## Things on their side to fix

- **Glofox consent, Blackrock branch.** The Killiney lead form (branch 6659f3a6…) has the email and SMS consent checkboxes. The Blackrock lead form (branch 681a3f74…) does not. Until that's set up in Glofox, all web leads go to the Killiney branch and the team routes Blackrock enquiries by hand.
- **Glofox form heading.** The embedded lead form shows its own "Register Your Interest" title, which duplicates the overlay heading. That text lives in Glofox, not on our page. Check whether the lead-capture form title can be changed or hidden in Glofox settings; if not, ask Glofox support.
- **Instagram link is broken.** The site links to instagram.com/bo7_gym, which shows "Profile isn't available". Need the correct handle from Ryan.
  - Update 8 Oct 2026: @bo7_gym looks correct after all. Blackrock Village Centre's Bo7 store page (blackrockvillagecentre.ie/store/bo7/) links to instagram.com/bo7_gym, and search results index it as "Bo7 (@bo7_gym)", 1,958 followers, bio "4 Military Road, Killiney and Blackrock Village". Instagram serves a generic page for every handle to logged-out fetches, so the "Profile isn't available" message is probably a logged-out artefact; Ryan should confirm the link loads for him. The footer now shows the Instagram icon linked to this handle.
- **Placeholder pages are live.** /contact-1 shows Squarespace demo text (email@example.com, 123 Demo Street) and /testimonials opens with the template's "Maybe you have a creative project…" copy.
- **Store index is empty.** /store renders "No results found" even though three products exist (28-Day Challenge €200, Blue Label Whey €36, Clear Label Whey €32).
- **Orphan pages in the sitemap.** /learn-morebo7-1-1 and /learn-morebo7-1-2 are "First-Timers (Copy)" pages. /class-timetable is a duplicate of /booking-1.
- **No meta descriptions on any inner page**, and titles like "Contact 1" and "First-Timers (Copy)" are indexed.
- **Blackrock has no map pin or footer address** on the current site.
- **Google Business Profile and map cookies.** Both locations appear to have Google Business Profile listings: the embedded maps (Locations section) show the business pin, name and reviews for "Bo7 Gym" at Blackrock Village Shopping Centre (5.0 stars, 15 reviews) and "Bo7" at 4 Military Road (4.9 stars, 99 reviews). Ryan should confirm he owns and manages both listings (hours, photos, correct category). Separately, the embedded Google Maps set Google cookies, so a cookie notice or click-to-load map may be needed before launch.
- **Google rating badge is hard-coded.** The Results section shows 4.9 (99 reviews) for Killiney and 5.0 (15) for Blackrock, as checked on 8 Oct 2026, plus three quoted Google reviews (John, Orla, Jay). To keep the numbers live we need a Google Places API key from Ryan's Google Cloud account (or a monthly manual edit). Ryan should also confirm he's happy to show those reviewers' first names.
- **Email on bo7.ie when the domain moves.** Moving bo7.ie off Squarespace means changing its DNS records. If Bo7 uses @bo7.ie email, the email records (MX, plus any TXT records such as SPF or verification) must be copied across exactly, or email stops arriving. Before touching DNS: find out where bo7.ie is registered and who manages its DNS, screenshot every record, and send a test email after the switch. (Added 9 Oct 2026.)
- **Squarespace shop has nowhere to go.** The Squarespace store sells the 28-Day Challenge gift card (€200), Blue Label Whey (€36) and Clear Label Whey (€32). The new site has no shop, only a footer link for gift vouchers. Ryan needs to decide before Squarespace is cancelled: sell them through Glofox, in person only, or drop them. Export past orders and customer details from Squarespace first. (Added 9 Oct 2026.)
- **Two different WhatsApp numbers.** The site uses 085 241 3999; the bring-a-friend email uses 087 901 2343. Updated 22 Oct 2026: James asked for WhatsApp to use **083 022 0376** (wa.me/353830220376) on the website; calls still go to 085 241 3999. The bring-a-friend email still uses 085 241 3999 for WhatsApp. Instagram is @bo7_gym. (Added 21 Oct 2026.)
- **Email images are hosted on bo7.thedowlings.co.** When the site moves to bo7.ie that address stops working and the images in any sent email break. Before the email goes into use, upload its images to the email tool's own media library and swap the URLs. (Added 21 Oct 2026.)
- **SPF record misses Google.** bo7.ie mail runs on Google Workspace (MX smtp.google.com), but the SPF TXT record doesn't include `_spf.google.com`, so mail sent from @bo7.ie can fail SPF checks and land in spam. Add it when DNS is next edited. (Added 21 Oct 2026.)
- **One review reads as a before/after.** John's quote gives his weight before and after. The brand guidelines rule out "transformation" before/afters; Ryan to decide whether to swap it for another review. (Added 21 Oct 2026.)
- **Coach names and roles for the team photo.** The homepage now shows the coaching team photo from the Drive "Bo7 Content" folder. The brand guidelines want names and roles in captions; we only know James (Head Coach) and Cian Hill (Coach). Ryan to send the rest, and confirm everyone pictured is happy to be on the site. (Added 21 Oct 2026.)
- **WhatsApp green is an exception to the brand palette.** Ryan asked for WhatsApp buttons to stay WhatsApp green (#25D366) so they stand out, although the guidelines say no accent other than tan. Recorded in CLAUDE.md. (Added 21 Oct 2026.)
- **Old Squarespace URLs now redirect.** /home, /thank-you, /booking-1 (Killiney), /booking-1-1 (Blackrock), /learn-morebo7-1, -1-1, -1-2 (booking form), /testimonials (results), /contact-1 (locations), /personal-training-blackrock (Blackrock card), /store and the three /store/p/ product pages (homepage); any other /store/... path is caught by 404.html. These only take effect once bo7.ie points at this site. A proper /blackrock page would hold the "personal training Blackrock" search ranking better than a redirect to a homepage section. (Added 21 Oct 2026.)
- **"Gift vouchers" footer link points at bo7.ie/store.** After the switch that URL redirects to the homepage, so the link goes nowhere useful until the shop decision above is made. (Added 21 Oct 2026.)
- **Members area is at bo7.ie/members (22 Oct 2026).** Copied from the "Bo7 Members Area" project (commit 7f113ba): only the page files, as its `site/build.sh` lists, not the SQL, tests or fixtures. That project stays the source of truth; copy its `members/` page files here again after each change there. GitHub Pages can't send the response headers in that project's `site/_headers` (X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy, X-Robots-Tag). The pages keep their own Content-Security-Policy and noindex tags, but nothing stops another site embedding them in a frame. Move to Cloudflare Pages if that matters.
- **The members app runs in two places (22 Oct 2026).** bo7.ie/members (this repo) is the main one. A second copy runs on Cloudflare Pages at members.bo7.ie and bo7membershub.com, built from the private repo `jamesmcc-afk/bo7-members-area`. Both now have the compulsory password and the Turnstile bot check (site key `0x4AAAAAAFgvIdVmlqqh79rZ`, covering bo7.ie, members.bo7.ie and bo7membershub.com). After any change in the "Bo7 Members Area" project, copy the page files to **both**, or Supabase's CAPTCHA setting will break logins on whichever copy is behind. Twilio (22 Oct): texts allowed to Ireland only, $20/month spend alert to jamesmcc@bo7.ie. Supabase (22 Oct): CAPTCHA protection on with Turnstile (tested: James logged in fine on his phone), SMS rate limit 10/hour, sessions never time out.
- **Google tracking is on (22 Oct 2026).** `site/analytics.js` loads Google Analytics 4 property **G-Z20JQXCC3R** ("Bo7.ie", account 404745040, property 550015059), owned by ryan@bo7.ie's Google account. The Squarespace site also loaded Tag Manager GTM-NJRHF7LZ (sending to G-93C3ZYZH84), but neither ryan@ nor jamesmcc@ has access to it, so it was removed: it let an outside party run code on bo7.ie. Ireland needs consent for analytics cookies, so it uses Google Consent Mode v2: a cookie choice (Accept / Reject) shows on first visit, and "Cookie settings" in the footer reopens it. Before a choice, Google gets cookieless pings only. Events: whatsapp_click, call_click, book_consultation_click, timetable_click, directions_click, instagram_click, video_play, cookie_choice. The Glofox form is a cross-origin iframe, so its submissions can't be tracked from the site; count those in Glofox. A privacy policy page that mentions analytics is still needed.

## What we built versus what they have

| Area | Current bo7.ie | New build |
|---|---|---|
| Platform | Squarespace 7.1 | Static HTML/CSS/JS, no CMS, no build step |
| Homepage length | ~12,500 px, body text 12 px | ~9,000 px at desktop, body 17–19 px |
| Hero | Looping video with headline, "Learn More" button to a page of two iframes | Same video, re-encoded (2–3.5 MB); headline, two CTAs, three facts. Video behind the copy on phones, own column on desktop |
| Primary CTA | "Learn More" → /learn-morebo7-1 (two Glofox iframes) | "Book a free consultation" → overlay: WhatsApp first, then the Glofox form |
| Location choice | Visitor picks Killiney or Blackrock before the form | No choice. One form (Killiney branch), routed by the team |
| WhatsApp | Text link at page bottom | Green WhatsApp button in the overlay and sticky bar, prefilled message |
| USPs | Five bold paragraphs on a photo | Four numbered points beside a photo |
| How it works | Three accordion items + repeated text | Three numbered steps |
| Testimonials | Separate page, 6 YouTube videos, placeholder intro | On the homepage as six portrait tiles, click to play |
| Locations | Killiney address and map only | Both gyms with address, eircode, book button and timetable link |
| FAQ | Six accordion items, same answers shown twice | Same six, rewritten tighter |
| Gallery | 19-photo flat grid | Photos used in context across sections instead |
| Store / voucher | Nav item + voucher promo block | Footer link only (gift vouchers) |
| Nav | First-Timers, Bo7, PT Blackrock, Testimonials, Class Timetable (Killiney/Blackrock), Store, Instagram | Why Bo7, How it works, Results, Locations, FAQ, Book |
| Fonts | Archivo Black + proxima-nova | DM Serif Display + DM Sans (Google Fonts) |
| Images | Up to 2500w JPEG from Squarespace CDN, ~17 MB | WebP at 1800w/900w, ~7 MB total, lazy-loaded |
| Mobile | Standard Squarespace stack | Static header with Book + menu, sticky bottom bar (Book + WhatsApp), bottom-sheet overlay |
| Pages | 13 (many near-empty) | 1 so far (homepage); Blackrock, Killiney, Results, Coaches, Pricing, Thank-you planned |
| Tracking | GTM-NJRHF7LZ, GA4 G-Z20JQXCC3R | Not added yet; add GTM before launch |
| Hosting | Squarespace, bo7.ie | GitHub Pages (dowling-home/bo7-site) at bo7.thedowlings.co for review, then bo7.ie |

## Still needed from Ryan

- Correct Instagram handle
- Member count, years open, Google rating for the hero facts
- Coach names, bios, photos
- Blackrock photos
- Pricing
- Whether Ryan's 44 s message video should go on the page (it's downloaded and encoded)
