# Bo7 website audit and redesign plan

Crawled 7 Oct 2026. Content inventory in `source/CONTENT-INVENTORY.md`.

## What is wrong with the current site

**Structure**
- Five of the thirteen pages are near-empty shells around a Glofox iframe. First-Timers, both timetable pages and two orphan "(Copy)" pages have under ten words each.
- Two pages still carry Squarespace placeholder text on the live site. Contact shows "email@example.com, 123 Demo Street". Testimonials opens with "Maybe you have a creative project to share with the world".
- The Store index renders "No results found" even though three products exist.
- Duplicate content: the Blackrock page repeats the homepage. Three pages host the same Killiney lead form.
- No page for the Killiney location itself, no coach page, no pricing page.

**Homepage**
- 12,500 px tall at desktop width. Every message is a paragraph. The USP section is five full sentences in bold inline labels on a photo background, which is the "text heavy" feel.
- Body text renders at 12 px. Headlines render in Archivo Black at huge sizes, so the hierarchy is two extremes with nothing in between.
- The main CTA says "Learn More" and goes to a page that is just two iframes. The real conversion step (Glofox lead form) is at the very bottom of a 12,500 px page.
- Social proof is weak where it matters: one photo under "Don't just take our word for it", no star rating, no named members, no numbers. The six video testimonials are buried on a separate page.
- Gallery of 19 photos is a flat grid with no captions and no purpose in the funnel.

**Technical**
- 17 MB of imagery served from Squarespace CDN at up to 2500w. Lighthouse will be poor on mobile.
- No meta descriptions on any inner page. Titles like "First-Timers (Copy)" and "Contact 1" are indexed.
- Blackrock, the new site, has no address in the footer, no map pin, and no timetable link from the homepage.

**What is good and should be kept**
- The positioning is clear and differentiated: semi-private PT, not a gym, not classes. "Future Proof Your Body" is a strong line.
- The photography is excellent. Pro shoot, consistent lighting, real members.
- The FAQ answers the actual objections (nervous, beginner, how often).
- Six real video testimonials already exist.
- Glofox already handles lead capture, booking and memberships, so the new site only has to deliver leads into it.

## Recommended structure (lead funnel first)

Goal of the site: one action, "Book a free consultation", available in every viewport, routed to the right Glofox branch.

| Page | Purpose | Primary CTA |
|---|---|---|
| / | Convince and route. Hero, proof strip, what semi-private PT is (3 cards), how it works, outcomes, video testimonials, two location cards, FAQ, CTA | Book a free consultation (location picker) |
| /blackrock | Location landing page for ads and local SEO. Address, map, hours, timetable embed, Blackrock photos, form | Book at Blackrock |
| /killiney | Same for Killiney | Book at Killiney |
| /start | Short lead page: pick location, 4-field form, what happens next | Submit |
| /results | Testimonials: 6 videos, written reviews, before/after if they have them | Book |
| /coaches | Ryan and the team | Book |
| /pricing | Optional. Even "from €X/week" lifts lead quality | Book |
| /thank-you | Confirmation plus WhatsApp link and app download | WhatsApp us |

Dropped from nav: Store (keep products reachable from footer or move to Glofox), Contact (fold into footer and /start), orphan Copy pages (301 to /start).

## Design direction

- Keep the black and gold identity and Archivo Black for display only. Use a readable body face at 17 to 18 px (Inter or similar). Cut the beige page background in favour of white and near-black sections.
- Convert every paragraph list into cards with an icon, a 3-word label and one line.
- Sticky mobile CTA bar: "Book free consultation" plus WhatsApp.
- Hero: one photo or the existing video loop, one headline, one sub-line, two buttons (Blackrock / Killiney).
- Proof strip under the hero: Google rating, years open, member count, "2 locations". Needs numbers from Ryan.
- Lead form: own HTML form posting to a small endpoint that forwards to Glofox lead-register, or embed the Glofox iframe only on /start and the location pages, not on the homepage.
- Images: resize to 1600w WebP, target under 150 KB each.

## Hosting on thedowlings.co

thedowlings.co is on Cloudflare DNS and currently serves the family hub from Railway (The Dowlings landing page with /algebra). The gym prototype should sit on a subdomain so it does not collide with that: `bo7.thedowlings.co`. Static site, so Cloudflare Pages or a second Railway static service both work. When Ryan signs off, point bo7.ie at the same build.

## Open questions for Ryan

1. Membership prices and package names.
2. Coach names, bios, photos.
3. Google review rating and permission to quote named reviews.
4. Blackrock photos.
5. Source files for the hero loop and his 44 s message video.
6. Opening hours per location.
