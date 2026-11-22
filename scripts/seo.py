#!/usr/bin/env python3
"""Writes SEO tags, structured data and crawlable starter content into each page.
Run `python3 scripts/seo.py` after changing TOOLS. Safe to re-run: it replaces its own blocks."""
import html, json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://tabandtally.co.uk"
OG = f"{SITE}/og.png"

# slug, name, title, description, h1, intro, steps, faqs, category
TOOLS = [
 ("quidsin","QuidsIn","QuidsIn: free bill splitter for groups | Tab & Tally",
  "Free bill splitter for groups. Add expenses, see who owes who and settle up with the fewest payments. One shareable code, no sign-up.",
  "Split bills with friends, flatmates and trips",
  "QuidsIn tracks shared expenses and works out who owes whom, using the fewest payments to settle up. Share one code and everyone sees the same balances. It only records who owes what and never holds or moves money.",
  ["Create a group and add the people.","Add each expense and who it was split between.","Share the code. Everyone sees the balances and the simplest way to settle up."],
  [("Is QuidsIn free?","Yes. It is free, paid for by adverts, with no sign-up and no daily limits."),
   ("Does QuidsIn handle payments?","No. It only records who owes what. You pay each other however you like."),
   ("How long are groups kept?","Groups are deleted after 30 days, or 3 months if you choose that when you create one.")],
  "FinanceApplication"),
 ("santa","Secret Santa","Free Secret Santa generator: online name draw, no sign-up | Tab & Tally",
  "Free online Secret Santa generator. Everyone picks their name from one shared link and sees only who they buy for. Optional wishlists. No sign-up, no emails.",
  "Secret Santa name draw, with no sign-up",
  "Run a Secret Santa online in a minute. The organiser adds the names and the draw is made once on the server. Everyone opens the shared link, taps their name and sees only who they are buying for. Nobody, including the organiser, can see anyone else's match.",
  ["Add the names and choose whether people can add wishlists.","Share the link or QR code with the group.","Everyone taps their own name to see who they are buying for."],
  [("Is this Secret Santa generator free?","Yes, free with no sign-up and no email addresses needed."),
   ("Can the organiser see who got who?","No. The organiser can free up a mistaken claim but never sees the matches."),
   ("Can someone draw themselves?","No. The draw is a single loop, so nobody gets themselves."),
   ("Can people add wishlists?","Yes, if the organiser allows it. A wishlist is visible only to the person buying for you.")],
  "LifestyleApplication"),
 ("whipround","Whip-round","Free whip-round: collect for a gift or leaving do | Tab & Tally",
  "Free online whip-round for gifts, leaving dos and group presents. Share one link, see who has chipped in and tick off what you have received. We never hold your money.",
  "Collect for a gift, card or leaving do",
  "Set up a whip-round with a target and a closing date. People add their name and amount, and you tick off each contribution once it arrives. A progress bar shows how much is pledged and received. Money never passes through Tab & Tally.",
  ["Create the pot with a target and a closing date.","Share the link. People say how much they are giving.","Tick each one off when you have received the money."],
  [("Does Tab & Tally collect the money?","No. People pay you directly. The tool only keeps track of who has paid."),
   ("Can contributors see what others gave?","Not by default. The organiser can choose to show who gave what.")],
  "FinanceApplication"),
 ("tally","Tally","Free live score keeper for game nights and leagues | Tab & Tally",
  "Free live scoreboard for game nights, pool, darts and quizzes. One person keeps score, everyone watches on their own phone. No sign-up.",
  "Keep score without the arguments",
  "Tally is a shared scoreboard. The scorekeeper taps a name to add or take off points, and everyone else watches the leaderboard update on their own phone. Choose whether the highest or lowest score wins.",
  ["Add the players and choose whether high or low wins.","Tap a name to add points. Undo the last score if you slip.","Share the code so everyone can watch."],
  [("Can others change the scores?","No. Only the scorekeeper link can change scores."),
   ("Does it work for golf or darts?","Yes. Choose lowest score wins for golf-style games.")],
  "GameApplication"),
 ("killerpool","Killer Pool","Killer pool tracker and rules: lives, ball numbers, re-rack | Tab & Tally",
  "Free killer pool tracker for the pub. Set the lives and house rules, deal ball numbers and track who is still in. Pub killer and own-ball killer, with a live view for everyone.",
  "Run a game of killer pool",
  "Set up pub killer or own-ball killer, choose the lives and house rules, and track who is still in. Pub killer supports up to 20 players with two lives, a final shot to win, and the player who pots the black covering the next re-rack.",
  ["Pick pub killer or own-ball killer and set the house rules.","Record each shot. Misses cost a life.","Share the code so everyone can follow who is still in."],
  [("How does pub killer work?","Players take turns to pot any ball to stay safe. A miss costs a life. The last player standing must pot a ball to win."),
   ("Who pays for the re-rack?","With the option on, whoever pots the black covers the cost of the next re-rack.")],
  "GameApplication"),
 ("pickers","Pickers","Random name picker, team maker, coin flip and dice | Tab & Tally",
  "Free random name picker, fair team splitter, order shuffler, coin flip and dice. Works on your phone with no sign-up. Nothing is stored.",
  "Pick a name, split into teams, flip a coin",
  "Pickers is a set of quick decision tools: pick a name from a hat, split people into fair teams, shuffle an order, flip a coin or roll dice. It runs entirely in your browser and saves nothing.",
  ["Type in the names.","Choose pick, teams, shuffle, coin or dice.","Get a fair result in one tap."],
  [("Is the result really random?","Yes. It uses your browser's secure random number generator."),
   ("Is anything saved?","No. Everything stays on your phone.")],
  "UtilitiesApplication"),
 ("sweepstake","Sweepstake","Free sweepstake generator for the World Cup, Grand National and office draws | Tab & Tally",
  "Free sweepstake draw generator. Add teams, horses or numbers and the people, and everyone gets a fair random share. Works for the World Cup, Grand National or the office.",
  "Run a sweepstake without the hat",
  "Add what is being drawn (teams, horses or numbers) and who is playing. The draw is shuffled and dealt fairly in one go, and everyone can see who got what. The organiser marks items out or as winners as the event goes on.",
  ["Add the teams, horses or numbers, one per line.","Add the people. Everyone gets a fair share.","Share the code. The organiser marks who is out or has won."],
  [("Is the sweepstake draw fair?","Yes. Both lists are shuffled and the items dealt out evenly, so nobody gets more than one extra."),
   ("Can I redo the draw?","No. It happens once, so check the names first."),
   ("Does it handle the prize money?","No. It only tracks the draw. You sort the stakes and prize yourselves.")],
  "GameApplication"),
 ("quiz","Quiz night","Free pub quiz scorer with live leaderboard | Tab & Tally",
  "Free quiz night scorer. Enter each team's points round by round and everyone watches the live leaderboard on their phone. Half points allowed. No sign-up.",
  "Score the quiz, live",
  "Enter each team's points after every round and share a live leaderboard. There is also a round-by-round grid. Half points, extra rounds and late teams are all supported.",
  ["Add the teams and the number of rounds.","Enter scores after each round.","Share the code so teams can watch the leaderboard."],
  [("Can I use half points?","Yes, scores can be whole or half points."),
   ("Can I add a round or team later?","Yes. You can add, rename or remove rounds and teams at any time.")],
  "GameApplication"),
 ("league","League","Free league table maker with fixtures for pool, darts and five-a-side | Tab & Tally",
  "Free league table maker. Add teams, generate fixtures, enter results and the table works itself out. For pool, darts, quizzes and five-a-side. No sign-up.",
  "A league table that keeps itself",
  "Add the teams or players and choose the points for a win and a draw. Generate fixtures so everyone plays everyone once, or home and away. Enter results and the table updates for everyone following.",
  ["Add the teams and set the points for a win and a draw.","Generate the fixtures, or add results as they happen.","Share the code so everyone can follow the table."],
  [("How is the league table ordered?","By points, then difference, then goals or frames scored, then name."),
   ("Can I change the points for a win?","Yes. Set the points for a win and a draw when you create the league.")],
  "SportsApplication"),
]

PAGES = [  # static pages: slug, title, description (head tags only)
 ("about","About Tab & Tally: free tools for groups"),
 ("privacy","Privacy policy | Tab & Tally"),
 ("contact","Contact | Tab & Tally"),
]

def esc(s): return html.escape(s, quote=True)
def ld(o): return '<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "</script>"

def head_block(url, title, desc, extra=""):
    return "\n".join([
        "    <!-- seo:start -->",
        f'    <link rel="canonical" href="{url}" />',
        '    <meta name="robots" content="index, follow, max-image-preview:large" />',
        f'    <meta property="og:type" content="website" />',
        f'    <meta property="og:site_name" content="Tab &amp; Tally" />',
        f'    <meta property="og:locale" content="en_GB" />',
        f'    <meta property="og:url" content="{url}" />',
        f'    <meta property="og:title" content="{esc(title)}" />',
        f'    <meta property="og:description" content="{esc(desc)}" />',
        f'    <meta property="og:image" content="{OG}" />',
        '    <meta property="og:image:width" content="1200" />',
        '    <meta property="og:image:height" content="630" />',
        '    <meta name="twitter:card" content="summary_large_image" />',
        f'    <meta name="twitter:title" content="{esc(title)}" />',
        f'    <meta name="twitter:description" content="{esc(desc)}" />',
        f'    <meta name="twitter:image" content="{OG}" />',
        *(["    " + extra] if extra else []),
        "    <!-- seo:end -->",
    ])

def set_head(text, block, title=None, desc=None):
    text = re.sub(r"[ \t]*<!-- seo:start -->.*?<!-- seo:end -->\n?", "", text, flags=re.S)
    if title:
        text = re.sub(r"<title>.*?</title>", f"<title>{esc(title)}</title>", text, flags=re.S)
    if desc:
        text = re.sub(r'<meta\s+name="description"\s+content="[^"]*"\s*/>', f'<meta name="description" content="{esc(desc)}" />', text, flags=re.S)
    return text.replace("</head>", block + "\n  </head>", 1)

def pre(t):
    slug, name, title, desc, h1, intro, steps, faqs, cat = t
    li = "".join(f"<li>{esc(s)}</li>" for s in steps)
    fq = "".join(f"<h3>{esc(q)}</h3><p>{esc(a)}</p>" for q, a in faqs)
    return (f'<!-- seo-pre:start --><div class="seo-pre" style="max-width:640px;margin:0 auto;padding:24px 18px;font-family:system-ui,sans-serif;line-height:1.5">'
            f'<p><a href="/">Tab &amp; Tally</a> › {esc(name)}</p><h1>{esc(h1)}</h1><p>{esc(intro)}</p>'
            f'<h2>How it works</h2><ol>{li}</ol><h2>Questions</h2>{fq}'
            f'<p><a href="/about/">About</a> · <a href="/privacy/">Privacy</a> · <a href="/contact/">Contact</a></p></div><!-- seo-pre:end -->')

def jsonld_tool(t):
    slug, name, title, desc, h1, intro, steps, faqs, cat = t
    url = f"{SITE}/{slug}/"
    app = {"@context": "https://schema.org", "@type": "WebApplication", "name": f"{name} by Tab & Tally", "url": url,
           "description": desc, "applicationCategory": cat, "operatingSystem": "Any (web browser)", "browserRequirements": "Requires JavaScript",
           "inLanguage": "en-GB", "isAccessibleForFree": True,
           "offers": {"@type": "Offer", "price": "0", "priceCurrency": "GBP"},
           "isPartOf": {"@type": "WebSite", "name": "Tab & Tally", "url": SITE + "/"}}
    faq = {"@context": "https://schema.org", "@type": "FAQPage",
           "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Tab & Tally", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": name, "item": url}]}
    return ld(app) + "\n    " + ld(faq) + "\n    " + ld(crumbs)

for t in TOOLS:
    slug, name, title, desc = t[0], t[1], t[2], t[3]
    p = ROOT / slug / "index.html"
    s = p.read_text()
    s = set_head(s, head_block(f"{SITE}/{slug}/", title, desc, jsonld_tool(t)), title, desc)
    s = re.sub(r"<!-- seo-pre:start -->.*?<!-- seo-pre:end -->", "", s, flags=re.S)
    s = re.sub(r'<div id="root">\s*</div>', lambda m: '<div id="root">' + pre(t) + "</div>", s, count=1)
    p.write_text(s)

for slug, title in PAGES:
    p = ROOT / slug / "index.html"
    s = p.read_text()
    d = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', s).group(1)
    d = html.unescape(d)
    p.write_text(set_head(s, head_block(f"{SITE}/{slug}/", html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1)), d)))

# hub
hub = ROOT / "index.html"
s = hub.read_text()
htitle = "Tab & Tally: free tools for groups, no sign-up"
hdesc = "Free tools for groups: split bills, Secret Santa, whip-rounds, scoreboards, killer pool, sweepstakes, quiz scoring and league tables. One shareable code, no sign-up."
items = [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/{t[0]}/", "name": t[1]} for i, t in enumerate(TOOLS)]
site = {"@context": "https://schema.org", "@graph": [
    {"@type": "WebSite", "name": "Tab & Tally", "url": SITE + "/", "inLanguage": "en-GB", "description": hdesc},
    {"@type": "Organization", "name": "Tab & Tally", "url": SITE + "/", "logo": SITE + "/tabandtally.svg", "email": "hello@tabandtally.co.uk"},
    {"@type": "ItemList", "name": "Tab & Tally tools", "itemListElement": items}]}
s = set_head(s, head_block(SITE + "/", htitle, hdesc, ld(site)), htitle, hdesc)
hub.write_text(s)
print("seo blocks written for", len(TOOLS), "tools,", len(PAGES), "pages and the hub")
