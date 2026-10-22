# Bo7 site

Static HTML, no build step. Open `index.html` or serve the folder.

```bash
npx -y http-server . -p 3020 -c-1
```

## Files

- `index.html` — homepage (the only page so far)
- `styles.css` — all styles; design tokens at the top
- `site.js` — location picker for the Glofox form, click-to-load YouTube, scroll reveals
- `assets/img/*.webp` — photos from the Squarespace site, resized to 1800w and 900w (originals in `../source/images`)

## Lead capture

The booking form is Glofox's hosted lead-register page in an iframe. The Blackrock / Killiney toggle swaps the branch id:

| Location | Glofox branch |
|---|---|
| Blackrock | 681a3f74d2e34f87d40dcbf8 |
| Killiney | 6659f3a6bc0507bc710421c5 |

Timetable links point at the matching `classes-week-view`.

## Deploy

GitHub Pages, from the `bo7-gym/bo7-site` repo. Every push to `main` runs `.github/workflows/pages.yml`, which publishes this `site/` folder.

- Live: https://bo7.ie/ (DNS at Web Hosting Ireland: apex A records to GitHub Pages, `www` CNAME `bo7-gym.github.io`; MX and TXT stay with Google Workspace). Tested first at https://new.bo7.ie/.
- The prototype at https://bo7.thedowlings.co/ is Eoin's copy (`dowling-home/bo7-site`) and is no longer where the public site changes.

## Still placeholder / needs Ryan

- Numbers for the hero fact strip (member count, years open, Google rating)
- Coach names and bios (no coach page yet)
- Blackrock photos (all current shots are Killiney)
- Pricing
