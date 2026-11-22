#!/usr/bin/env python3
"""Writes the search landing pages (guides). Run `python3 scripts/guides.py` after editing GUIDES."""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://tabandtally.co.uk"
OG = SITE + "/og.png"
e = lambda s: html.escape(s, quote=True)

# slug, tool slug, tool name, button, title, description, h1, intro, sections [(h2, [paragraphs or ("ul",[..]) or ("ol",[..])])], faqs, related guide slugs
GUIDES = [
("secret-santa-generator","santa","Secret Santa","Start a Secret Santa",
 "Secret Santa generator: how to run one online, free | Tab & Tally",
 "Run a Secret Santa online for free. How it works, what budget to set, and how to keep matches secret, even from the organiser. No sign-up or emails.",
 "Secret Santa generator with no sign-up",
 "A good Secret Santa needs three things: a fair draw, matches that stay secret, and a budget everyone agrees on. This free generator does the first two for you, and the tips below help with the third.",
 [("How the Tab & Tally draw works",
   [("ol",["The organiser adds everyone's name and chooses whether people can add a wishlist.","The draw is made once, on the server, as a single loop. Nobody can draw themselves, and nobody gets a mini-loop with one other person.","The organiser shares one link or QR code. Each person taps their own name once and gets a private key.","Only that key shows who you are buying for. The organiser never sees the matches, so they can play too."])]),
  ("Setting the budget and the date",
   ["Agree the amount before the draw, and put it in the group chat with the link. £10 to £20 is common for office and friend groups, and £5 to £10 works well for large groups or families.",
    "Pick a date for the gift swap and a deadline to open the link. Tell people the draw is one-off, so they should check the names first."]),
  ("Wishlists",
   ["If you switch wishlists on, each person can add a few ideas. Only the person buying for you can see them, so you still get a surprise but nobody has to guess sizes or tastes."]),
  ("Couples and families",
   ["When you set up the draw, add pairs to keep apart, such as couples or housemates. Neither person will draw the other. Those pairs are used for the draw only and aren't saved. If the pairs leave no way to draw everyone, you'll be asked to remove one or two and try again."]),
  ("If someone loses their key",
   ["The organiser can free up a mistaken claim so the person can tap their name again. This releases the name only; the organiser still doesn't see the match."])],
 [("Is the Secret Santa generator really free?","Yes. It is free, paid for by adverts, with no sign-up and no email addresses needed."),
  ("Can the organiser see who got who?","No. Each person gets their own private key. The organiser can free up a mistaken claim but never sees any match."),
  ("Can I redo the draw?","The draw is made once when you create it. If you need a different draw, create a new Secret Santa."),
  ("How long is my Secret Santa kept?","It is deleted automatically after 30 days, or after 3 months if you tick Keep for 3 months."),
  ("Can couples be stopped from drawing each other?","Yes. Add pairs to keep apart when you create the draw. They are used once for the draw and not saved."),
  ("Does it work for remote teams?","Yes. Everyone just needs the link, so it suits teams who are spread across different places.")],
 ["whip-round-for-a-gift","random-team-generator"]),

("sweepstake-generator","sweepstake","Sweepstake","Start a sweepstake",
 "Sweepstake generator: World Cup, Grand National and office draws | Tab & Tally",
 "Free sweepstake generator. Draw teams, horses or numbers to people fairly, share the result, and track who is still in. Ideas for the World Cup, Euros, Grand National and the office.",
 "Sweepstake generator for tournaments, races and the office",
 "A sweepstake is simple until you have to draw it. Paper in a hat takes time and someone always doubts it. Enter the teams, horses or numbers and the people, and the draw is shuffled and dealt in one go, with the whole result visible to everyone.",
 [("How the draw is dealt",
   ["Both lists are shuffled, then items are dealt out in turn. If there are more items than people, a few people simply get one extra, and nobody gets two extra.",
    "The draw happens once and can't be redone, so check the names before you press the button."]),
  ("Ideas for what to draw",
   [("ul",["Tournament teams, such as the World Cup, Euros or Six Nations. Add the teams one per line.","Horses for the Grand National or any race meeting.","Numbered squares for a Super Bowl or darts night.","Drivers, golfers, contestants on a TV show, or anything with a winner."])]),
  ("Getting the numbers to work",
   ["If you can, match the number of people to the number of items. With 32 teams, 8 people get 4 each. With 48 teams, 12 people get 4 each. If it doesn't divide evenly, the page tells you some people will get one more, so you can decide whether that's fair for your group."]),
  ("Running it as it goes",
   ["Share the code so everyone can see who has what. The organiser taps a team once to mark it out and again to mark it as the winner. People can check the page to see who is still in."]),
  ("Money and prizes",
   ["Tab & Tally tracks the draw only. You collect the stakes and pay the prize however you like. If you are collecting for a prize pot, a <a href=\"/whipround/\">whip-round</a> can track who has paid."])],
 [("Is the sweepstake draw fair?","Yes. Both the items and the people are shuffled and the items dealt evenly."),
  ("How many teams or people can I add?","Up to 64 of each."),
  ("Can I use it for the Grand National?","Yes. Add the horses one per line and the people who are playing."),
  ("Can people see the draw?","Yes, everyone with the code can see who has which item. Only the organiser can mark items out or as winners."),
  ("Is it free?","Yes, with no sign-up.")],
 ["pub-quiz-scorer","whip-round-for-a-gift"]),

("pub-quiz-scorer","quiz","Quiz night","Start a quiz",
 "Pub quiz scorer: live leaderboard, round by round | Tab & Tally",
 "Free pub quiz scorer. Enter team scores after each round and share a live leaderboard. Half points, extra rounds and late teams all supported. No sign-up.",
 "Pub quiz scorer with a live leaderboard",
 "Adding up quiz scores on paper gets slow and error-prone around round five. This scorer keeps a running total for every team and shows everyone the leaderboard on their own phone.",
 [("Setting up",
   [("ol",["Add the teams. You can add more later if someone turns up late.","Choose the number of rounds. You can add, rename or remove rounds at any time.","Share the code or QR code so teams can watch the leaderboard."])]),
  ("Scoring a round",
   ["Pick the round, then type each team's score. Half points are fine, and there are quick buttons for +1 and −½. Totals and rankings update straight away for everyone watching.",
    "Made a mistake? Type the new number over the old one, or clear it."]),
  ("Tips for a smoother quiz night",
   [("ul",["Keep a bonus or tiebreaker round at the end and add it as an extra round.","Read out the leaderboard after each round, but hold back the last one for drama.","Let teams swap their answer sheets to mark each other's, then enter the totals yourself.","Share the code on the screen or on a poster so teams can follow along without asking."])]),
  ("Raising money with a quiz",
   ["Running a quiz for a club or charity? <a href=\"https://fundtheteam.net/\">FundTheTeam</a> can help with the fundraising side. Tab & Tally never handles money."])],
 [("Can teams see the scores?","Yes. Everyone with the code sees the leaderboard and a round-by-round grid. Only the quizmaster can change scores."),
  ("Can I use half points?","Yes, scores can be whole or half points."),
  ("How many teams and rounds?","Up to 40 teams and 30 rounds."),
  ("How long is the quiz kept?","It is deleted after 30 days, or 3 months if you choose.")],
 ["league-table-maker","random-team-generator"]),

("killer-pool-rules","killerpool","Killer Pool","Start a game of killer pool",
 "Killer pool rules: pub killer and own-ball killer explained | Tab & Tally",
 "How to play killer pool. Rules for pub killer and own-ball killer, lives, becoming a killer, who pays for the re-rack, the final shot, and a free tracker.",
 "Killer pool rules: pub killer and own-ball killer",
 "Killer is a pool game for a group, where everyone starts with a few lives and tries to be the last one in. House rules vary between pubs, so agree them before the first shot. These are the two most common versions, and both can be set up in the free tracker.",
 [("Pub killer",
   [("ol",["Each player starts with the same number of lives, usually two or three.","Players take turns in a fixed order.","On your turn you must pot any ball. If you do, you stay safe.","If you miss, you lose a life. When your lives are gone, you are out.","The last player left is the winner."])]),
  ("The final shot",
   ["When only one player is left, they usually have to pot a ball to actually win. In the tracker, the Final shot to win option does this. If they miss, everyone is back in with full lives and the game carries on."]),
  ("The black and the re-rack",
   ["A common pub rule is that whoever pots the black covers the cost of the next re-rack. The tracker can show who that is, and an optional re-rack cost beside their name, until you mark it as paid."]),
  ("Own-ball killer",
   ["Each player gets a numbered ball, picked at random or chosen. Variations include having to become a killer first by potting your own ball, losing a life for potting your own ball or scratching, and keeping ball numbers secret until a player is out. The tracker lets you switch each of these on or off."]),
  ("Agree the house rules first",
   ["Decide before you start: how many lives, whether a scratch costs a life, what happens on a foul, and who pays for the next game. Write them in the game setup so nobody argues later."])],
 [("How many lives do you start with?","Two or three is most common. The tracker lets you choose, with two as the default for pub killer."),
  ("How many people can play?","Pub killer supports up to 20 players. Own-ball killer supports up to 15."),
  ("What happens when the last player misses the final shot?","Everyone comes back in with full lives and play continues."),
  ("Who pays for the re-rack?","That depends on your house rules. A common one is that whoever pots the black covers it, and the tracker can follow that rule.")],
 ["random-team-generator","league-table-maker"]),

("league-table-maker","league","League","Start a league",
 "League table maker: fixtures and results for pool, darts and five-a-side | Tab & Tally",
 "Free league table maker. Add the teams, generate fixtures, enter results and the table works itself out. For pool, darts, quizzes and five-a-side leagues.",
 "League table maker with fixtures",
 "Spreadsheets work until someone enters a result wrong and the whole table shifts. This league maker works out the table for you from the results you enter, and everyone can follow it on their phone.",
 [("What it does",
   [("ul",["Works out played, won, drawn, lost, difference and points automatically.","Orders the table by points, then difference, then goals or frames scored, then name.","Lets you set your own points for a win and a draw.","Generates round-robin fixtures, each team playing the others once, or home and away.","Lets you add one-off results that aren't in the fixtures."])]),
  ("Good for",
   ["Pool and darts leagues in the pub, office table football, five-a-side, board game seasons, e-sports and any league where you need a quick table."]),
  ("Running a league",
   ["Add the teams or players and choose the points. Tap Home and away for a double round-robin, or play each other once. Tap a match to enter its score, and share the code so everyone can see the table."]),
  ("Longer seasons",
   ["Leagues are kept for 30 days, or 3 months if you tick Keep for 3 months, with one Keep another month extension. For anything longer, check your plans against that limit."])],
 [("How are tied teams ordered?","By goal or frame difference, then by goals or frames scored, then by name."),
  ("Can I change the points for a win?","Yes, set the points for a win and a draw when you create the league."),
  ("How many teams can I add?","Up to 20, and up to 500 matches."),
  ("Can I fix a wrong score?","Yes. Tap the match and enter the correct result, or clear it.")],
 ["pub-quiz-scorer","killer-pool-rules"]),

("split-bills-with-friends","quidsin","QuidsIn","Split a bill",
 "How to split bills with friends, flatmates and on trips | Tab & Tally",
 "How to split shared expenses without arguments. Keep a running list, see who owes whom, and settle up with the fewest payments. Free, no sign-up.",
 "How to split bills with friends and flatmates",
 "Shared costs get awkward when nobody remembers who paid for what. The simplest fix is to write each expense down as it happens and let a tool do the maths at the end.",
 [("A simple way to do it",
   [("ol",["Create a group and add everyone.","Whenever someone pays, add the expense and say who it covers.","At any point, look at the balances to see who owes whom.","When you're ready, settle up with the fewest payments."])]),
  ("Why the fewest payments",
   ["If A owes B, and B owes C, the simplest answer is often for A to pay C directly. The tool works this out for you, so a weekend away may need only a few transfers, not one for every expense."]),
  ("Splitting unevenly",
   ["Not everyone has the same meal or share of the rent. Choose who each expense covers and split it as it applies, so a person who didn't drink doesn't pay for the wine."]),
  ("Trips, flats and nights out",
   [("ul",["Trips: add costs as you go and settle on the way home.","Flatmates: add rent and bills each month, and settle every few weeks.","Nights out: add the round or the meal and who was there."])]),
  ("Paying each other",
   ["Tab & Tally never holds or moves money. It only tracks who owes what, and you pay each other however you like. Check the figures before you send anything."])],
 [("Is it free?","Yes, with no sign-up."),
  ("Does it handle payments?","No. It records who owes what, and you pay each other directly."),
  ("Do I need an app?","No. It works in your phone's browser, and everyone uses the same code."),
  ("How long are groups kept?","They are deleted after 30 days, or 3 months if you choose.")],
 ["whip-round-for-a-gift","secret-santa-generator"]),

("whip-round-for-a-gift","whipround","Whip-round","Start a whip-round",
 "Whip-round for a gift or leaving do: how to run one online | Tab & Tally",
 "How to run a whip-round for a leaving gift, wedding present or group card. Set a target, share one link and see who has chipped in. We never hold your money.",
 "How to run a whip-round for a gift or leaving do",
 "Collecting money from a group is awkward, especially when you have to chase people. A shared link with a target and a closing date makes it easy for people to join in and easy for you to see where you are.",
 [("Setting it up",
   [("ol",["Name the pot and say what it's for.","Add a suggested amount, a target and a closing date.","Add a short note on how people should pay you.","Share the link or QR code."])]),
  ("Tracking who has paid",
   ["People add their name and amount and tick that they have paid. When the money arrives, you tick Received, and the bar shows how much is pledged and how much you actually hold."]),
  ("Keeping it comfortable",
   ["By default, contributors can't see what others gave, so people can give what they can afford. You can choose to show who gave what if that suits your group."]),
  ("How much to ask for",
   ["Pick a figure most people are happy with, then let people give more. For a leaving gift, £2 to £5 each is common in a big team and £5 to £10 in a small one."]),
  ("Safety",
   ["Tab & Tally never holds your money. The how-to-pay note refuses anything that looks like a bank account or card number, so people can't be tricked into putting account details on the page."])],
 [("Does Tab & Tally take the money?","No. People pay you directly. The page only tracks who has paid."),
  ("Can contributors see each other's amounts?","Not by default. The organiser can choose to show them."),
  ("Is it free?","Yes, with no sign-up."),
  ("Is it good for charity fundraising?","For a team or club that needs proper fundraising, try <a href=\"https://fundtheteam.net/\">FundTheTeam</a>.")],
 ["secret-santa-generator","split-bills-with-friends"]),

("random-team-generator","pickers","Pickers","Open Pickers",
 "Random team generator, name picker, coin flip and dice | Tab & Tally",
 "Free random team generator. Split a list of names into fair teams, pick a name from a hat, shuffle an order or flip a coin. Runs on your phone, saves nothing.",
 "Random team generator and name picker",
 "Picking teams by hand takes time and causes arguments. Type in the names, choose how many teams you want, and Pickers splits everyone up at random in one tap.",
 [("What you can do",
   [("ul",["Split a list of names into teams of a size you choose.","Pick one name at random, like a name from a hat.","Shuffle a list to decide the order, such as who goes first.","Flip a coin or roll dice to settle a decision."])]),
  ("Why people trust it",
   ["Results come from your browser's secure random number generator. Nothing is sent to our servers, so there's nothing to tamper with, and nothing is stored."]),
  ("Good for",
   ["Five-a-side, school and club sessions, pub games, office activities, and anyone who needs a quick, fair decision."]),
  ("When you need more",
   ["For a full competition, make a <a href=\"/league/\">league table</a>. For a game night, use <a href=\"/tally/\">Tally</a> to keep score."])],
 [("Is it really random?","Yes. It uses your browser's secure random number generator."),
  ("Is anything saved?","No. Everything stays on your phone."),
  ("Can I make uneven teams?","If the number of people doesn't divide evenly, some teams will have one more person than others."),
  ("Is it free?","Yes, with no sign-up.")],
 ["league-table-maker","killer-pool-rules"]),
]
TITLES = {g[0]: g[6] for g in GUIDES}

def render_body(blocks):
    out = []
    for b in blocks:
        if isinstance(b, tuple):
            tag, items = b
            out.append(f"<{tag}>" + "".join(f"<li>{i}</li>" for i in items) + f"</{tag}>")
        else:
            out.append(f"<p>{b}</p>")
    return "\n        ".join(out)

def strip(s): return re.sub(r"<[^>]+>", "", s)

for slug, tool, tname, btn, title, desc, h1, intro, secs, faqs, rel in GUIDES:
    url = f"{SITE}/{slug}/"
    ld = [
        {"@context": "https://schema.org", "@type": "Article", "headline": h1, "description": desc, "inLanguage": "en-GB", "url": url,
         "image": OG, "author": {"@type": "Organization", "name": "Tab & Tally"}, "publisher": {"@type": "Organization", "name": "Tab & Tally", "url": SITE + "/"},
         "mainEntityOfPage": url, "dateModified": "2026-11-22", "datePublished": "2026-11-22"},
        {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": strip(a)}} for q, a in faqs]},
        {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Tab & Tally", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": tname, "item": f"{SITE}/{tool}/"},
            {"@type": "ListItem", "position": 3, "name": h1, "item": url}]},
    ]
    ldtags = "\n    ".join('<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False, separators=(",", ":")) + "</script>" for o in ld)
    secs_html = "\n\n        ".join(f"<h2>{e(h)}</h2>\n        {render_body(b)}" for h, b in secs)
    faq_html = "\n        ".join(f"<h3>{e(q)}</h3>\n        <p>{a}</p>" for q, a in faqs)
    rel_html = "".join(f'<li><a href="/{r}/">{e(TITLES[r])}</a></li>' for r in rel)
    page = f'''<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/tabandtally.svg" />
    <meta name="theme-color" content="#14233a" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="description" content="{e(desc)}" />
    <title>{e(title)}</title>
    <script type="module" src="/src/hub.ts"></script>
    <link rel="canonical" href="{url}" />
    <meta name="robots" content="index, follow, max-image-preview:large" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Tab &amp; Tally" />
    <meta property="og:locale" content="en_GB" />
    <meta property="og:url" content="{url}" />
    <meta property="og:title" content="{e(title)}" />
    <meta property="og:description" content="{e(desc)}" />
    <meta property="og:image" content="{OG}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{e(title)}" />
    <meta name="twitter:description" content="{e(desc)}" />
    <meta name="twitter:image" content="{OG}" />
    {ldtags}
  </head>
  <body>
    <main class="page">
      <article class="doc">
        <a class="doc-brand" href="/">
          <svg viewBox="0 0 64 40" aria-hidden="true" width="32" height="20">
            <g stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M12 4v32M24 4v32M36 4v32M48 4v32" /></g>
            <path d="M5 27 56 13" stroke="#e8a317" stroke-width="5" stroke-linecap="round" />
          </svg>
          Tab &amp; Tally
        </a>

        <h1>{e(h1)}</h1>
        <p>{intro}</p>
        <p><a class="cta" href="/{tool}/">{e(btn)}</a></p>

        {secs_html}

        <h2>Questions</h2>
        {faq_html}

        <p><a class="cta" href="/{tool}/">{e(btn)}</a> <span class="meta">Free, no sign-up.</span></p>

        <h2>More guides</h2>
        <ul>{rel_html}</ul>

        <nav class="doc-nav" aria-label="Site">
          <a href="/">Home</a>
          <a href="/{tool}/">{e(tname)}</a>
          <a href="/about/">About</a>
          <a href="/privacy/">Privacy</a>
          <a href="/contact/">Contact</a>
        </nav>
      </article>
    </main>
  </body>
</html>
'''
    d = ROOT / slug
    d.mkdir(exist_ok=True)
    (d / "index.html").write_text(page)

# vite inputs
v = (ROOT / "vite.config.ts").read_text()
v = re.sub(r"\n        // guides:start.*?// guides:end", "", v, flags=re.S)
block = "\n        // guides:start\n" + "".join(f'        "{g[0]}": resolve(import.meta.dirname, "{g[0]}/index.html"),\n' for g in GUIDES) + "        // guides:end"
v = v.replace('        about: resolve(import.meta.dirname, "about/index.html"),', '        about: resolve(import.meta.dirname, "about/index.html"),' + block, 1)
(ROOT / "vite.config.ts").write_text(v)

# sitemap
m = (ROOT / "public/sitemap.xml").read_text()
m = re.sub(r"  <!-- guides:start -->.*?<!-- guides:end -->\n", "", m, flags=re.S)
m = m.replace("</urlset>", "  <!-- guides:start -->\n" + "".join(f"  <url><loc>{SITE}/{g[0]}/</loc><lastmod>2026-11-22</lastmod></url>\n" for g in GUIDES) + "  <!-- guides:end -->\n</urlset>")
(ROOT / "public/sitemap.xml").write_text(m)

# llms.txt
l = (ROOT / "public/llms.txt").read_text()
l = re.sub(r"\n## Guides\n.*?(?=\n## About)", "", l, flags=re.S)
l = l.replace("\n## About", "\n## Guides\n\n" + "".join(f"- [{g[6]}]({SITE}/{g[0]}/): {g[5]}\n" for g in GUIDES) + "\n## About", 1)
(ROOT / "public/llms.txt").write_text(l)
print(len(GUIDES), "guides written")
