#!/usr/bin/env python3
"""Generate ugcgo.ai launch roadmap PDF presentation."""

from fpdf import FPDF

FONT_DIR = "/usr/share/fonts/truetype/"
FONT_REGULAR = FONT_DIR + "liberation/LiberationSans-Regular.ttf"
FONT_BOLD = FONT_DIR + "liberation/LiberationSans-Bold.ttf"

# Colors
BLACK = (20, 20, 20)
WHITE = (255, 255, 255)
ACCENT = (232, 255, 89)  # #e8ff59
DARK_BG = (15, 15, 15)
CARD_BG = (30, 30, 30)
GRAY = (160, 160, 160)
GREEN = (0, 200, 100)
RED = (255, 80, 80)
ORANGE = (255, 180, 50)
BLUE = (80, 160, 255)


class RoadmapPDF(FPDF):
    def __init__(self):
        super().__init__(orientation="L", format="A4")
        self.add_font("Sans", "", FONT_REGULAR)
        self.add_font("Sans", "B", FONT_BOLD)
        self.set_auto_page_break(auto=False)

    def dark_page(self):
        self.add_page()
        self.set_fill_color(*DARK_BG)
        self.rect(0, 0, self.w, self.h, "F")

    def accent_text(self, text, size=14, x=None, y=None):
        self.set_font("Sans", "B", size)
        self.set_text_color(*ACCENT)
        if x is not None and y is not None:
            self.set_xy(x, y)
        self.cell(0, size * 0.5, text, new_x="LMARGIN", new_y="NEXT")

    def white_text(self, text, size=11, bold=False, x=None, y=None):
        self.set_font("Sans", "B" if bold else "", size)
        self.set_text_color(*WHITE)
        if x is not None and y is not None:
            self.set_xy(x, y)
        self.cell(0, size * 0.5, text, new_x="LMARGIN", new_y="NEXT")

    def gray_text(self, text, size=9, x=None, y=None):
        self.set_font("Sans", "", size)
        self.set_text_color(*GRAY)
        if x is not None and y is not None:
            self.set_xy(x, y)
        self.cell(0, size * 0.5, text, new_x="LMARGIN", new_y="NEXT")

    def card(self, x, y, w, h):
        self.set_fill_color(*CARD_BG)
        self.rect(x, y, w, h, "F")
        # accent top border
        self.set_fill_color(*ACCENT)
        self.rect(x, y, w, 1.5, "F")

    def status_dot(self, x, y, color):
        self.set_fill_color(*color)
        self.ellipse(x, y, 4, 4, "F")

    def divider(self, y):
        self.set_draw_color(*ACCENT)
        self.set_line_width(0.3)
        self.line(20, y, self.w - 20, y)


def build_pdf():
    pdf = RoadmapPDF()

    # ==================== SLIDE 1: TITLE ====================
    pdf.dark_page()
    # accent bar top
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, 0, pdf.w, 6, "F")

    pdf.set_font("Sans", "B", 42)
    pdf.set_text_color(*ACCENT)
    pdf.set_xy(30, 45)
    pdf.cell(0, 20, "ugcgo.ai")

    pdf.set_font("Sans", "B", 22)
    pdf.set_text_color(*WHITE)
    pdf.set_xy(30, 72)
    pdf.cell(0, 12, "Launch Roadmap")

    pdf.set_font("Sans", "", 14)
    pdf.set_text_color(*GRAY)
    pdf.set_xy(30, 90)
    pdf.cell(0, 8, "Zero Budget Strategy | March 2026")

    pdf.set_font("Sans", "", 10)
    pdf.set_xy(30, 108)
    pdf.cell(0, 6, "Based on: Reddit, Product Hunt, X (Twitter), Indie Hackers, market research")

    # Bottom accent bar
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, pdf.h - 6, pdf.w, 6, "F")

    # ==================== SLIDE 2: CURRENT STATE ====================
    pdf.dark_page()
    pdf.accent_text("01  CURRENT STATE", 18, 20, 15)
    pdf.gray_text("Where ugcgo.ai is right now", 10, 20, 28)
    pdf.divider(34)

    items = [
        ("Landing page (HTML/CSS/JS)", GREEN, "READY"),
        ("Animations, themes, responsive", GREEN, "READY"),
        ("Waitlist form", ORANGE, "NOT CONNECTED"),
        ("CI/CD (GitHub Pages)", GREEN, "READY"),
        ("Backend / DB / Auth", RED, "MISSING"),
        ("AI video pipeline", RED, "MISSING"),
        ("Dashboards / Payments", RED, "MISSING"),
    ]

    y = 42
    for label, color, status in items:
        pdf.card(20, y, 250, 14)
        pdf.status_dot(28, y + 5, color)
        pdf.white_text(label, 11, False, 38, y + 3)
        pdf.set_font("Sans", "B", 9)
        pdf.set_text_color(*color)
        pdf.set_xy(210, y + 3)
        pdf.cell(50, 5, status, align="R")
        y += 18

    # Stage label
    pdf.card(20, y + 5, 250, 20)
    pdf.set_font("Sans", "B", 13)
    pdf.set_text_color(*ACCENT)
    pdf.set_xy(30, y + 10)
    pdf.cell(0, 7, "STAGE: Pre-launch. There is a showcase, but no product yet.")

    # ==================== SLIDE 3: COMPETITORS ====================
    pdf.dark_page()
    pdf.accent_text("02  COMPETITORS (March 2026)", 18, 20, 15)
    pdf.gray_text("AI UGC market is overheated. But NO ONE is a marketplace.", 10, 20, 28)
    pdf.divider(34)

    competitors = [
        ("Arcads", "$100/mo", "300+ AI actors, perf ads"),
        ("HeyGen", "$24/mo", "1100+ avatars, voice clone"),
        ("Creatify", "$39/mo", "URL-to-video"),
        ("MakeUGC", "$49/mo", "Cheapest per video (<$10)"),
        ("EzUGC", "$49-199/mo", "Multi-model (Sora 2, Veo 3.1)"),
        ("AdStellar", "---", "Full cycle: UGC + Meta campaigns"),
        ("Synthesia", "$22/mo", "Enterprise, 230+ avatars"),
    ]

    y = 40
    # Header
    pdf.set_font("Sans", "B", 9)
    pdf.set_text_color(*ACCENT)
    pdf.set_xy(25, y)
    pdf.cell(60, 5, "PLATFORM")
    pdf.set_xy(105, y)
    pdf.cell(40, 5, "PRICE")
    pdf.set_xy(165, y)
    pdf.cell(100, 5, "KEY FEATURE")
    y += 9

    for name, price, feat in competitors:
        pdf.card(20, y, 260, 13)
        pdf.set_font("Sans", "B", 10)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(25, y + 3)
        pdf.cell(60, 5, name)
        pdf.set_font("Sans", "", 10)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(105, y + 3)
        pdf.cell(40, 5, price)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(165, y + 3)
        pdf.cell(100, 5, feat)
        y += 16

    # Opportunity box
    pdf.set_fill_color(*ACCENT)
    pdf.rect(20, y + 5, 260, 22, "F")
    pdf.set_font("Sans", "B", 13)
    pdf.set_text_color(*BLACK)
    pdf.set_xy(30, y + 9)
    pdf.cell(0, 7, 'YOUR NICHE: "Fiverr for AI UGC" — marketplace, not another SaaS tool')
    pdf.set_font("Sans", "", 9)
    pdf.set_xy(30, y + 18)
    pdf.cell(0, 5, "Creators sell skills. Brands get content. Platform takes commission.")

    # ==================== SLIDE 4: PHASE 0 ====================
    pdf.dark_page()
    pdf.accent_text("03  PHASE 0: PREPARATION (Days 1-3)", 18, 20, 15)
    pdf.gray_text("Connect email collection + prepare build-in-public content", 10, 20, 28)
    pdf.divider(34)

    tasks = [
        ("1", "Connect waitlist to Tally.so", "30 min", "Tally.so (free)"),
        ("2", "Create accounts: X, Reddit, PH, IH", "1 hour", "---"),
        ("3", "Optimize X profile: bio + link", "15 min", "---"),
        ("4", "Record first Loom video of landing", "1 hour", "Loom (free)"),
        ("5", "Write first X thread", "30 min", "---"),
    ]

    y = 42
    for num, task, time, tool in tasks:
        pdf.card(20, y, 255, 14)
        # Number circle
        pdf.set_fill_color(*ACCENT)
        pdf.ellipse(25, y + 3, 8, 8, "F")
        pdf.set_font("Sans", "B", 8)
        pdf.set_text_color(*BLACK)
        pdf.set_xy(25, y + 4)
        pdf.cell(8, 5, num, align="C")
        # Task
        pdf.set_font("Sans", "", 10)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(38, y + 3)
        pdf.cell(130, 5, task)
        # Time
        pdf.set_text_color(*ACCENT)
        pdf.set_font("Sans", "B", 9)
        pdf.set_xy(175, y + 3)
        pdf.cell(40, 5, time)
        # Tool
        pdf.set_text_color(*GRAY)
        pdf.set_font("Sans", "", 9)
        pdf.set_xy(220, y + 3)
        pdf.cell(50, 5, tool)
        y += 17

    # X thread template box
    y += 5
    pdf.card(20, y, 255, 48)
    pdf.set_font("Sans", "B", 10)
    pdf.set_text_color(*ACCENT)
    pdf.set_xy(28, y + 4)
    pdf.cell(0, 5, "FIRST X THREAD TEMPLATE:")
    lines = [
        'I am building ugcgo.ai - the first marketplace for AI UGC creators.',
        'Brands spend $150-$2000 per video with human UGC creators.',
        'AI UGC tools cost $2-20/video, but brands cannot use them.',
        'Solution: marketplace where AI creators sell ready-made content.',
        'Fiverr, but for AI video. Building in public. Follow along!',
    ]
    ly = y + 12
    for line in lines:
        pdf.set_font("Sans", "", 9)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(28, ly)
        pdf.cell(0, 5, line)
        ly += 6

    # ==================== SLIDE 5: PHASE 1 ====================
    pdf.dark_page()
    pdf.accent_text("04  PHASE 1: BUILD IN PUBLIC (Days 4-21)", 18, 20, 15)
    pdf.gray_text("Goal: 200+ emails in waitlist, 500 followers on X", 10, 20, 28)
    pdf.divider(34)

    # X Strategy
    pdf.white_text("X (TWITTER) - PRIMARY CHANNEL", 12, True, 20, 40)
    pdf.gray_text("Grok-powered algorithm in 2026 promotes small accounts with strong engagement", 9, 20, 50)

    # Content plan
    plan = [
        ("Morning", "Build in public", "Day 7. Built creator profiles. What would you add?"),
        ("Afternoon", "Expert content", "AI UGC: Arcads $100/mo. MakeUGC $49. What if creator does it for $15?"),
        ("Evening", "Engagement", "Brands: how much do you pay for UGC video now?"),
    ]
    y = 60
    for time, typ, example in plan:
        pdf.card(20, y, 255, 16)
        pdf.set_font("Sans", "B", 9)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(25, y + 2)
        pdf.cell(35, 5, time)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(65, y + 2)
        pdf.cell(45, 5, typ)
        pdf.set_font("Sans", "", 8)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(120, y + 2)
        pdf.cell(150, 5, example)
        y += 19

    # Reddit
    y += 3
    pdf.white_text("REDDIT - SECONDARY CHANNEL", 12, True, 20, y)
    pdf.gray_text("Rule 90/10: 90% useful content, 10% mention product", 9, 20, y + 10)

    subs = [
        ("r/Entrepreneur", "4.9M", "Market research post"),
        ("r/SideProject", "600K+", "Show my project"),
        ("r/AlphaAndBetaUsers", "---", "Looking for beta testers (promo OK)"),
        ("r/roastmystartup", "---", "Roast my landing = feedback + attention"),
    ]
    y += 17
    for sub, members, what in subs:
        pdf.set_font("Sans", "B", 9)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(25, y)
        pdf.cell(55, 5, sub)
        pdf.set_text_color(*GRAY)
        pdf.set_font("Sans", "", 9)
        pdf.set_xy(85, y)
        pdf.cell(25, 5, members)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(115, y)
        pdf.cell(150, 5, what)
        y += 8

    # Fact box
    y += 5
    pdf.set_fill_color(*ACCENT)
    pdf.rect(20, y, 255, 14, "F")
    pdf.set_font("Sans", "B", 10)
    pdf.set_text_color(*BLACK)
    pdf.set_xy(28, y + 4)
    pdf.cell(0, 5, "REAL CASE: Indie hacker 0 -> 2400 followers in 4 months -> launched at $8K MRR")

    # ==================== SLIDE 6: PHASE 2 MVP ====================
    pdf.dark_page()
    pdf.accent_text("05  PHASE 2: MVP LAUNCH (Days 22-45)", 18, 20, 15)
    pdf.gray_text("Minimum viable marketplace. Cost: $0 (Supabase Free + Vercel Free)", 10, 20, 28)
    pdf.divider(34)

    # What to build
    pdf.white_text("BUILD:", 12, True, 20, 40)
    features = [
        ("Registration", "Email + Google OAuth", "Supabase Auth"),
        ("Creator profile", "Name, portfolio, skills, price", "Next.js + Supabase"),
        ("Brand brief", "Product, style, platform, budget", "Next.js + Supabase"),
        ("Matching", "List of creators with filters", "Simple UI"),
        ("Chat", "Messaging", "Supabase Realtime"),
        ("Video upload", "Creator uploads finished video", "Supabase Storage"),
    ]

    y = 50
    for feat, desc, stack in features:
        pdf.card(20, y, 255, 14)
        pdf.set_font("Sans", "B", 10)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(25, y + 3)
        pdf.cell(55, 5, feat)
        pdf.set_font("Sans", "", 9)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(85, y + 3)
        pdf.cell(100, 5, desc)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(210, y + 3)
        pdf.cell(60, 5, stack)
        y += 16

    # Do NOT build
    y += 5
    pdf.white_text("DO NOT BUILD IN MVP:", 12, True, 20, y)
    y += 10
    donts = ["Payments (manual transfer first)", "AI generation inside platform", "Complex search/recommendations"]
    for d in donts:
        pdf.set_font("Sans", "", 10)
        pdf.set_text_color(*RED)
        pdf.set_xy(28, y)
        pdf.cell(5, 5, "X")
        pdf.set_text_color(*GRAY)
        pdf.set_xy(38, y)
        pdf.cell(200, 5, d)
        y += 8

    # ==================== SLIDE 7: LAUNCH DAY ====================
    pdf.dark_page()
    pdf.accent_text("06  PHASE 3: LAUNCH DAY (Day 46-48)", 18, 20, 15)
    pdf.gray_text("Multi-platform staggered launch. Tuesday/Wednesday/Thursday only.", 10, 20, 28)
    pdf.divider(34)

    # Pre-launch
    pdf.white_text("2 WEEKS BEFORE:", 11, True, 20, 40)
    preps = [
        "Submit to BetaList (14.9% signup conversion)",
        "Get 5-10 creators to fill profiles (marketplace must not be empty)",
        "Prepare Product Hunt assets: logo, screenshots, GIF, demo video",
    ]
    y = 50
    for p in preps:
        pdf.set_font("Sans", "", 9)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(28, y)
        pdf.cell(0, 5, p)
        y += 7

    # Timeline
    y += 5
    pdf.white_text("LAUNCH DAY TIMELINE:", 11, True, 20, y)
    y += 10

    timeline = [
        ("00:01 PT", "Product Hunt launch + maker comment"),
        ("00:15 PT", "X post: We just launched!"),
        ("00:30 PT", "Email to entire waitlist"),
        ("06:00 PT", "Hacker News: Show HN"),
        ("08:00 PT", "Reddit: r/SideProject, r/AlphaAndBetaUsers"),
        ("10:00 PT", "Indie Hackers post"),
        ("ALL DAY", "Reply to EVERY comment on Product Hunt"),
    ]

    for time, action in timeline:
        pdf.card(20, y, 255, 13)
        pdf.set_font("Sans", "B", 9)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(25, y + 3)
        pdf.cell(30, 5, time)
        pdf.set_font("Sans", "", 9)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(65, y + 3)
        pdf.cell(200, 5, action)
        y += 15

    # Note
    pdf.set_fill_color(*ACCENT)
    pdf.rect(20, y + 2, 255, 12, "F")
    pdf.set_font("Sans", "B", 9)
    pdf.set_text_color(*BLACK)
    pdf.set_xy(28, y + 5)
    pdf.cell(0, 5, "PH ranks by ENGAGEMENT QUALITY, not upvote count. Active users' votes weigh more.")

    # ==================== SLIDE 8: FIRST 100 USERS ====================
    pdf.dark_page()
    pdf.accent_text("07  PHASE 4: FIRST 100 USERS (Days 49-90)", 18, 20, 15)
    pdf.gray_text('"Do things that don\'t scale" - Paul Graham', 10, 20, 28)
    pdf.divider(34)

    # Two columns
    # Creators
    pdf.card(20, 40, 125, 70)
    pdf.set_font("Sans", "B", 12)
    pdf.set_text_color(*ACCENT)
    pdf.set_xy(28, 44)
    pdf.cell(0, 6, "CREATORS")

    cr_steps = [
        "Find 50 AI UGC accounts on X/TikTok",
        "DM each: \"Saw your AI videos - fire.",
        "  We have a marketplace. Free access.\"",
        "Join AI Discords (Midjourney,",
        "  RunwayML, HeyGen communities)",
    ]
    y = 56
    for s in cr_steps:
        pdf.set_font("Sans", "", 8)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(28, y)
        pdf.cell(110, 4, s)
        y += 6

    # Brands
    pdf.card(150, 40, 125, 70)
    pdf.set_font("Sans", "B", 12)
    pdf.set_text_color(*ACCENT)
    pdf.set_xy(158, 44)
    pdf.cell(0, 6, "BRANDS")

    br_steps = [
        "Find marketers on X/LinkedIn complaining",
        "  about UGC costs",
        "Offer: \"First order free - we'll show",
        "  how AI UGC saves 90% budget\"",
        "DM 100 DTC brands (Shopify stores)",
    ]
    y = 56
    for s in br_steps:
        pdf.set_font("Sans", "", 8)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(158, y)
        pdf.cell(110, 4, s)
        y += 6

    # Metrics
    pdf.white_text("TARGET METRICS:", 12, True, 20, 118)
    metrics = [
        ("Signup conversion", "2-4%"),
        ("Activation rate", "30-50%"),
        ("Traffic growth", "10-20%/month"),
        ("Waitlist -> Active user", "15-25%"),
    ]
    y = 130
    for m, v in metrics:
        pdf.card(20, y, 255, 13)
        pdf.set_font("Sans", "", 10)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(28, y + 3)
        pdf.cell(120, 5, m)
        pdf.set_font("Sans", "B", 11)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(200, y + 3)
        pdf.cell(60, 5, v, align="R")
        y += 16

    # ==================== SLIDE 9: ACTION PLAN ====================
    pdf.dark_page()
    pdf.accent_text("08  ACTION PLAN: WHAT TO DO RIGHT NOW", 18, 20, 15)
    pdf.gray_text("No survey needed. Market is validated. Time is the enemy.", 10, 20, 28)
    pdf.divider(34)

    blocks = [
        ("TODAY (30 min)", ACCENT, [
            "Connect Tally.so to waitlist form",
            "Create/optimize X account",
        ]),
        ("TOMORROW (2 hours)", GREEN, [
            "Record demo video (Loom/OBS, 60-90 sec)",
            "Write first X thread",
            "First Reddit post",
        ]),
        ("WEEKS 1-3", BLUE, [
            "Build in public (3 posts/day on X)",
            "Collect waitlist emails",
            "Start building MVP (Next.js + Supabase)",
        ]),
        ("WEEKS 4-6", BLUE, [
            "Launch MVP",
            "Onboard 10 creators manually",
            "Product Hunt launch day",
        ]),
        ("WEEKS 7-12", ORANGE, [
            "100 users via direct outreach",
            "Iterate product based on feedback",
            "First revenue",
        ]),
    ]

    y = 40
    for title, color, steps in blocks:
        pdf.set_fill_color(*color)
        pdf.rect(20, y, 4, 8 + len(steps) * 7, "F")
        pdf.set_font("Sans", "B", 11)
        pdf.set_text_color(*color)
        pdf.set_xy(30, y)
        pdf.cell(0, 6, title)
        sy = y + 9
        for step in steps:
            pdf.set_font("Sans", "", 9)
            pdf.set_text_color(*WHITE)
            pdf.set_xy(35, sy)
            pdf.cell(0, 5, step)
            sy += 7
        y = sy + 5

    # ==================== SLIDE 10: PLATFORMS ====================
    pdf.dark_page()
    pdf.accent_text("09  FREE LAUNCH PLATFORMS", 18, 20, 15)
    pdf.gray_text("$0 budget. Organic acquisition: ~$150/user vs $802 via paid ads.", 10, 20, 28)
    pdf.divider(34)

    platforms = [
        ("Product Hunt", "5-10K visitors/day for #1", "Launch day"),
        ("BetaList", "14.9% signup conversion", "2 weeks before launch"),
        ("Hacker News", "Tech audience, viral potential", "Launch day"),
        ("Indie Hackers", "Founders community, feedback", "After launch"),
        ("Reddit", "Massive audience (millions)", "Build in public phase"),
        ("X (Twitter)", "Long-term compounding growth", "From day 1"),
    ]

    y = 42
    for name, benefit, when in platforms:
        pdf.card(20, y, 255, 18)
        pdf.set_font("Sans", "B", 12)
        pdf.set_text_color(*ACCENT)
        pdf.set_xy(28, y + 3)
        pdf.cell(55, 6, name)
        pdf.set_font("Sans", "", 10)
        pdf.set_text_color(*WHITE)
        pdf.set_xy(90, y + 3)
        pdf.cell(120, 6, benefit)
        pdf.set_font("Sans", "B", 9)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(215, y + 3)
        pdf.cell(55, 6, when, align="R")
        y += 22

    # ==================== SLIDE 11: SOURCES ====================
    pdf.dark_page()
    pdf.accent_text("10  SOURCES", 18, 20, 15)
    pdf.divider(24)

    sources = [
        "How to launch a startup on Reddit - 2026 (blog.mean.ceo)",
        "9 Best Startup Launch Platforms 2026 (startupa.ge)",
        "How to Get First 100 Users 2026 (openhunts.com)",
        "Product Hunt Launch Checklist 2026 (phlaunchchecklist.com)",
        "Product Hunt Playbook - 30x #1 Winner (dev.to)",
        "Twitter Strategy for Indie Hackers 2026 (teract.ai)",
        "Top 7 Arcads Alternatives 2026 (ezugc.ai)",
        "10 Best AI UGC Generators 2026 (aiavatar.tech.blog)",
        "Zero-Budget Marketing for Startups (launchboosts.com)",
        "Best Subreddits for Startups 2026 (redditgrowthdb.com)",
    ]

    y = 32
    for s in sources:
        pdf.set_font("Sans", "", 8)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(28, y)
        pdf.cell(0, 5, s)
        y += 7

    # Bottom
    y += 10
    pdf.set_fill_color(*ACCENT)
    pdf.rect(20, y, 255, 20, "F")
    pdf.set_font("Sans", "B", 14)
    pdf.set_text_color(*BLACK)
    pdf.set_xy(28, y + 5)
    pdf.cell(240, 8, "ugcgo.ai  |  The Future of UGC is AI  |  March 2026", align="C")

    # Save
    out_path = "/home/user/claudetest1/UGCGO_LAUNCH_ROADMAP.pdf"
    pdf.output(out_path)
    print(f"PDF saved: {out_path}")
    return out_path


if __name__ == "__main__":
    build_pdf()
