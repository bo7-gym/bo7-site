"""Extract readable content from the raw Squarespace HTML of bo7.ie into Markdown + JSON."""
import json, re, sys, pathlib
from bs4 import BeautifulSoup, NavigableString

RAW = pathlib.Path(__file__).parent / "raw"
OUT = pathlib.Path(__file__).parent / "pages"
OUT.mkdir(exist_ok=True)

PAGES = [l.strip() for l in (RAW / "pages.txt").read_text().splitlines() if l.strip()]
SKIP = {"class-timetable"}  # duplicate of booking-1

def slug_of(url):
    return url.replace("https://www.bo7.ie/", "").replace("/", "_")

def clean(s):
    return re.sub(r"\s+", " ", s).strip()

def nav(soup):
    items = []
    for a in soup.select(".header-nav-list a.header-nav-item--collection, .header-nav-folder-item a, .header-nav-item--collection > a, .header-nav-folder-title"):
        t, h = clean(a.get_text()), a.get("href")
        if t and (t, h) not in items:
            items.append((t, h))
    # fallback: raw header anchors
    if not items:
        for a in soup.select("header a[href]"):
            t, h = clean(a.get_text()), a.get("href")
            if t and (t, h) not in items:
                items.append((t, h))
    return items

def walk_blocks(main):
    """Yield markdown lines from Squarespace content blocks in document order."""
    out = []
    seen_text = set()
    for el in main.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote", "img", "a", "iframe", "figcaption", "button"]):
        if el.name in ("a", "button"):
            # only capture buttons / CTA style links
            cls = " ".join(el.get("class", []))
            if "btn" in cls or "button" in cls or "sqs-block-button" in cls:
                t = clean(el.get_text())
                if t:
                    out.append(f"[BUTTON: {t}]({el.get('href','')})")
            continue
        if el.name == "img":
            src = el.get("data-src") or el.get("src") or ""
            if "squarespace-cdn" in src or src.startswith("http"):
                alt = clean(el.get("alt") or "")
                out.append(f"![{alt}]({src.split('?')[0]})")
            continue
        if el.name == "iframe":
            out.append(f"[EMBED: {el.get('src','')}]")
            continue
        t = clean(el.get_text(" "))
        if not t or t in seen_text:
            continue
        seen_text.add(t)
        if el.name.startswith("h"):
            out.append("#" * int(el.name[1]) + " " + t)
        elif el.name == "li":
            out.append("- " + t)
        elif el.name == "blockquote":
            out.append("> " + t)
        elif el.name == "figcaption":
            out.append("_" + t + "_")
        else:
            out.append(t)
    return out

summary = []
all_images = set()
for url in PAGES:
    slug = slug_of(url)
    if slug in SKIP:
        continue
    html = (RAW / f"{slug}.html").read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "lxml")
    title = clean(soup.title.get_text()) if soup.title else ""
    desc = (soup.find("meta", attrs={"name": "description"}) or {}).get("content", "")
    og_img = (soup.find("meta", property="og:image") or {}).get("content", "")
    main = soup.select_one("main, #page, .site-content, article") or soup.body
    # strip header/footer/scripts/noscript
    for sel in ["header", "footer", "script", "style", "noscript", "nav", ".sqs-announcement-bar", ".header"]:
        for x in main.select(sel):
            x.decompose()
    lines = walk_blocks(main)
    # footer content separately (once)
    foot = soup.select_one("footer")
    footer_lines = walk_blocks(foot) if foot else []
    imgs = re.findall(r"https://images\.squarespace-cdn\.com/[^\s\"'?)]+", html)
    imgs = sorted(set(i for i in imgs if not i.endswith((".svg",))))
    all_images.update(imgs)
    words = sum(len(l.split()) for l in lines if not l.startswith(("!", "[", "#")))
    md = [f"# {title}", f"URL: {url}", f"Meta description: {desc}", f"OG image: {og_img}", f"Body words: {words}", ""]
    md += lines
    if slug == "home":
        md += ["", "---", "## NAV", *[f"- {t} -> {h}" for t, h in nav(soup)], "", "## FOOTER", *footer_lines]
    (OUT / f"{slug}.md").write_text("\n".join(md), encoding="utf-8")
    summary.append({"slug": slug, "url": url, "title": title, "description": desc, "words": words, "images": len(imgs), "embeds": [l for l in lines if l.startswith("[EMBED")]})
    print(f"{slug:45s} words={words:5d} imgs={len(imgs):3d} embeds={len(summary[-1]['embeds'])}  {title}")

(RAW / "all-image-urls.txt").write_text("\n".join(sorted(all_images)), encoding="utf-8")
(OUT / "_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print(f"\n{len(all_images)} unique CDN image URLs")
