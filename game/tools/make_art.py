#!/usr/bin/env python3
"""Draw the sprite kit procedurally, in the game's STYLE FORMULA.

STYLE FORMULA v1: bold flat cel-shaded cartoon, chunky rounded silhouettes with
thick dark-navy outlines, cool concrete grey and dusty teal environment with deep
navy shadows, coral-orange hero that pops against the grey city, hazards edged in
warning red-orange, pickups in electric yellow-gold, consistent three-quarter rear
chase-camera perspective.

Every sprite is drawn at 4x and downsampled with LANCZOS, which is what gives the
outlines their clean anti-aliased edge.

Usage:  python3 make_art.py <out_dir>
"""
import sys, os, math, random
from PIL import Image, ImageDraw, ImageFilter

S = 4  # supersample factor

NAVY = (22, 34, 58, 255)
NAVY_S = (36, 52, 84, 255)
CORAL = (255, 122, 77, 255)
CORAL_D = (214, 84, 46, 255)
CORAL_L = (255, 160, 116, 255)
GOLD = (255, 210, 74, 255)
TEAL = (63, 198, 192, 255)
TEAL_D = (38, 138, 136, 255)
GREY = (141, 153, 172, 255)
GREY_D = (91, 103, 121, 255)
GREY_L = (183, 194, 209, 255)
SKIN = (232, 178, 140, 255)
SKIN_D = (196, 140, 104, 255)
WHITE = (248, 250, 253, 255)
STEEL = (168, 182, 198, 255)
STEEL_D = (108, 124, 143, 255)
WOOD = (94, 72, 56, 255)
WOOD_D = (68, 51, 40, 255)
BALLAST = (124, 130, 134, 255)
BALLAST_D = (96, 102, 107, 255)


def canvas(w, h):
    im = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im)


def down(im, w, h):
    return im.resize((w, h), Image.LANCZOS)


def rr(d, box, r, fill, outline=None, width=0):
    d.rounded_rectangle([c * S for c in box], radius=r * S, fill=fill,
                        outline=outline, width=int(width * S))


def ell(d, box, fill, outline=None, width=0):
    d.ellipse([c * S for c in box], fill=fill, outline=outline, width=int(width * S))


def poly(d, pts, fill, outline=None, width=0):
    d.polygon([(x * S, y * S) for x, y in pts], fill=fill, outline=outline,
              width=int(width * S))


def line(d, pts, fill, width):
    d.line([(x * S, y * S) for x, y in pts], fill=fill, width=int(width * S),
           joint="curve")


# ---------------------------------------------------------------- hero
def hero(pose):
    """Back view of the runner, 256x384 logical units. Legs read as legs."""
    W, H = 256, 384
    im, d = canvas(W, H)
    cx = 128
    OL = 5

    if pose == "roll":
        rr(d, (cx - 80, 232, cx + 80, 322), 42, CORAL, NAVY, OL)          # hunched back
        rr(d, (cx - 64, 244, cx + 6, 302), 30, CORAL_L, None, 0)          # rim light
        rr(d, (cx - 34, 250, cx + 34, 300), 20, TEAL, NAVY, OL)           # backpack
        ell(d, (cx - 50, 200, cx + 50, 272), CORAL_D, NAVY, OL)           # hood
        ell(d, (cx - 32, 214, cx + 32, 262), (58, 42, 34, 255), None, 0)  # hair
        for s in (-1, 1):                                                  # tucked legs
            x = cx + s * 30
            rr(d, (x - 32, 292, x + 32, 342), 22, GREY, NAVY, OL)
            rr(d, (x - 30, 330, x + 30, 360), 14, WHITE, NAVY, OL)
            rr(d, (x - 30, 348, x + 30, 360), 6, CORAL, None, 0)
        for s in (-1, 1):                                                  # arms thrown forward
            x = cx + s * 68
            rr(d, (x - 19, 246, x + 19, 308), 17, CORAL_D, NAVY, OL)
            ell(d, (x - 18, 290, x + 18, 322), SKIN, NAVY, 4)
        return down(im, W, H)

    if pose == "jump":
        legs = ((-1, -10, 244, 302), (1, 10, 244, 302))
        arm_x, arm_y = 74, 130
    elif pose == "run_a":
        legs = ((-1, -12, 248, 366), (1, 10, 246, 310))
        arm_x, arm_y = 58, 144
    else:  # run_b
        legs = ((-1, -3, 248, 340), (1, 5, 248, 348))
        arm_x, arm_y = 55, 150

    for s, dx, top, bot in legs:
        x = cx + s * 24 + dx
        rr(d, (x - 25, top, x + 25, bot), 20, GREY, NAVY, OL)              # leg
        rr(d, (x - 19, top + 12, x - 5, bot - 20), 7, GREY_L, None, 0)     # cel highlight
        rr(d, (x - 29, bot - 14, x + 29, bot + 22), 14, WHITE, NAVY, OL)   # sneaker
        rr(d, (x - 29, bot + 8, x + 29, bot + 22), 6, CORAL, None, 0)      # sole flash

    for s in (-1, 1):
        x = cx + s * arm_x
        ay = arm_y + (18 if (pose == "run_a" and s > 0) else 0)
        rr(d, (x - 19, ay, x + 19, ay + 88), 18, CORAL_D, NAVY, OL)        # arm
        ell(d, (x - 18, ay + 68, x + 18, ay + 104), SKIN, NAVY, OL)        # hand

    rr(d, (cx - 49, 138, cx + 49, 272), 36, CORAL, NAVY, OL)               # hoodie
    rr(d, (cx - 40, 150, cx - 11, 258), 17, CORAL_L, None, 0)              # rim light
    rr(d, (cx - 39, 246, cx + 39, 268), 10, CORAL_D, None, 0)              # hem
    rr(d, (cx - 32, 166, cx + 32, 236), 18, TEAL, NAVY, OL)                # backpack
    rr(d, (cx - 24, 176, cx - 7, 228), 9, TEAL_D, None, 0)
    rr(d, (cx - 21, 206, cx + 21, 218), 6, GOLD, NAVY, 3)                  # buckle

    ell(d, (cx - 46, 98, cx + 46, 180), CORAL_D, NAVY, OL)                 # hood
    ell(d, (cx - 39, 64, cx + 39, 148), SKIN, NAVY, OL)                    # back of head
    ell(d, (cx - 37, 56, cx + 37, 116), (56, 40, 32, 255), NAVY, OL)       # hair
    ell(d, (cx - 27, 64, cx - 6, 96), (88, 64, 50, 255), None, 0)
    for s in (-1, 1):
        ell(d, (cx + s * 38 - 10, 102, cx + s * 38 + 10, 128), SKIN_D, NAVY, 4)

    return down(im, W, H)


# ---------------------------------------------------------------- chaser
def chaser():
    W, H = 360, 400
    im, d = canvas(W, H)
    OL = 6
    # dog, leaping at the left
    dx, dy = 96, 250
    rr(d, (dx - 62, dy, dx + 62, dy + 76), 34, (139, 94, 60, 255), NAVY, OL)
    ell(d, (dx + 24, dy - 40, dx + 96, dy + 26), (156, 108, 70, 255), NAVY, OL)
    poly(d, [(dx + 40, dy - 30), (dx + 30, dy - 74), (dx + 66, dy - 40)], (110, 74, 48, 255), NAVY, OL)
    poly(d, [(dx + 76, dy - 32), (dx + 92, dy - 72), (dx + 96, dy - 24)], (110, 74, 48, 255), NAVY, OL)
    for s, ox in ((1, -34), (1, 44)):
        rr(d, (dx + ox - 15, dy + 58, dx + ox + 15, dy + 116), 13, (120, 80, 52, 255), NAVY, OL)
    line(d, [(dx - 58, dy + 16), (dx - 104, dy - 26)], (139, 94, 60, 255), 16)

    # inspector, lunging at the right
    cx = 238
    for s, ox, top, bot in ((-1, -34, 250, 348), (1, 40, 246, 336)):
        rr(d, (cx + ox - 27, top, cx + ox + 27, bot), 22, (36, 52, 84, 255), NAVY, OL)
        rr(d, (cx + ox - 31, bot - 10, cx + ox + 31, bot + 22), 12, (30, 34, 44, 255), NAVY, OL)
    rr(d, (cx - 74, 128, cx + 74, 268), 46, (44, 62, 100, 255), NAVY, OL)   # jacket
    rr(d, (cx - 62, 142, cx - 22, 252), 22, (62, 84, 130, 255), None, 0)
    rr(d, (cx - 50, 232, cx + 50, 256), 12, (30, 42, 70, 255), None, 0)     # belt
    rr(d, (cx - 20, 236, cx + 20, 254), 7, GOLD, NAVY, 4)                   # buckle
    rr(d, (cx + 62, 150, cx + 128, 190), 20, (44, 62, 100, 255), NAVY, OL)  # reaching arm
    ell(d, (cx + 112, 146, cx + 164, 198), SKIN, NAVY, OL)
    rr(d, (cx - 130, 158, cx - 58, 200), 20, (44, 62, 100, 255), NAVY, OL)
    ell(d, (cx - 60, 78, cx + 60, 186), SKIN, NAVY, OL)                     # head
    ell(d, (cx - 66, 62, cx + 66, 132), (30, 42, 70, 255), NAVY, OL)        # cap
    rr(d, (cx - 58, 100, cx + 58, 122), 10, (22, 32, 54, 255), None, 0)     # brim
    return down(im, W, H)


# ---------------------------------------------------------------- obstacles
def train_rear():
    W, H = 512, 512
    im, d = canvas(W, H)
    OL = 7
    rr(d, (36, 40, 476, 470), 46, (146, 166, 190, 255), NAVY, OL)           # body
    rr(d, (52, 56, 460, 200), 34, (108, 128, 152, 255), None, 0)            # upper band
    rr(d, (74, 92, 438, 214), 24, (30, 44, 66, 255), NAVY, OL)              # window
    rr(d, (92, 104, 250, 160), 14, (74, 106, 140, 255), None, 0)            # glass sheen
    rr(d, (60, 250, 452, 300), 16, CORAL, NAVY, 5)                          # graffiti stripe
    poly(d, [(90, 296), (150, 246), (210, 296), (150, 320)], GOLD, NAVY, 5)
    poly(d, [(250, 296), (300, 250), (350, 300), (300, 322)], TEAL, NAVY, 5)
    for x in (110, 402):                                                     # tail lights
        ell(d, (x - 34, 340, x + 34, 402), (232, 66, 48, 255), NAVY, OL)
        ell(d, (x - 18, 352, x + 12, 382), (255, 170, 150, 255), None, 0)
    rr(d, (196, 356, 316, 404), 14, (60, 74, 92, 255), NAVY, 5)             # coupling
    rr(d, (36, 430, 476, 470), 18, (66, 80, 98, 255), NAVY, OL)             # skirt
    return down(im, W, H)


def barrier():
    W, H = 256, 200
    im, d = canvas(W, H)
    OL = 6
    rr(d, (16, 60, 240, 170), 18, (206, 212, 220, 255), NAVY, OL)
    for i in range(6):                                                       # warning stripes
        x = 22 + i * 36
        poly(d, [(x, 64), (x + 22, 64), (x + 4, 166), (x - 18, 166)],
             CORAL if i % 2 == 0 else WHITE, None, 0)
    rr(d, (16, 60, 240, 170), 18, None, NAVY, OL)
    rr(d, (10, 150, 246, 186), 12, GREY_D, NAVY, OL)                         # foot
    ell(d, (108, 22, 148, 62), GOLD, NAVY, OL)                               # amber lamp
    ell(d, (116, 28, 134, 46), (255, 246, 210, 255), None, 0)
    rr(d, (120, 50, 136, 68), 5, GREY_D, NAVY, 4)
    return down(im, W, H)


def gantry():
    W, H = 384, 384
    im, d = canvas(W, H)
    OL = 7
    for x in (26, 316):                                                      # legs
        rr(d, (x, 96, x + 42, 372), 10, STEEL, NAVY, OL)
        rr(d, (x + 6, 104, x + 20, 360), 5, STEEL_D, None, 0)
        rr(d, (x - 14, 356, x + 56, 380), 8, GREY_D, NAVY, OL)
    rr(d, (10, 62, 374, 122), 14, STEEL, NAVY, OL)                           # beam
    rr(d, (26, 20, 358, 84), 12, (222, 228, 236, 255), NAVY, OL)             # sign panel
    for i in range(8):
        x = 32 + i * 42
        poly(d, [(x, 24), (x + 24, 24), (x + 6, 80), (x - 18, 80)],
             CORAL if i % 2 == 0 else WHITE, None, 0)
    rr(d, (26, 20, 358, 84), 12, None, NAVY, OL)
    return down(im, W, H)


# ---------------------------------------------------------------- world
def track_tile():
    """512x512, seamless top/bottom: three separate rail tracks, one per lane."""
    W = H = 512
    im, d = canvas(W, H)
    rnd = random.Random(11)
    d.rectangle([0, 0, W * S, H * S], fill=(112, 118, 116, 255))            # gravel between beds
    for _ in range(1700):
        x, y = rnd.randrange(W), rnd.randrange(H)
        r = rnd.choice((2, 2, 3, 4))
        ell(d, (x, y, x + r, y + r),
            rnd.choice(((96, 102, 100, 255), (132, 138, 136, 255), (84, 90, 88, 255))), None, 0)

    lane_w = W / 3
    n_sleep, step = 8, H / 8
    for lane in range(3):
        cxp = lane_w * (lane + 0.5)
        bed = 56                                                            # half width of the bed
        d.rectangle([(cxp - bed) * S, 0, (cxp + bed) * S, H * S], fill=BALLAST)
        for _ in range(260):                                                # bed speckle
            x = rnd.uniform(cxp - bed, cxp + bed); y = rnd.randrange(H)
            r = rnd.choice((2, 3))
            ell(d, (x, y, x + r, y + r), rnd.choice((BALLAST_D, (146, 151, 154, 255))), None, 0)
        for i in range(n_sleep):                                            # sleepers wrap vertically
            y = i * step
            rr(d, (cxp - bed + 4, y + step * 0.30, cxp + bed - 4, y + step * 0.60), 4, WOOD, WOOD_D, 2)
            rr(d, (cxp - bed + 10, y + step * 0.34, cxp + bed - 10, y + step * 0.43), 2,
               (110, 84, 64, 255), None, 0)
        for off in (-38, 38):                                               # the two rails
            x = cxp + off
            d.rectangle([(x - 8) * S, 0, (x + 8) * S, H * S], fill=(74, 84, 96, 255))
            d.rectangle([(x - 6) * S, 0, (x + 4) * S, H * S], fill=STEEL_D)
            d.rectangle([(x - 5) * S, 0, (x - 1) * S, H * S], fill=(196, 208, 222, 255))
    return down(im, 512, 512)


def city():
    W, H = 1024, 320
    im, d = canvas(W, H)
    rnd = random.Random(5)
    bands = (
        (0, (186, 206, 226, 255), (206, 222, 238, 255), 80, 150),
        (1, (150, 176, 202, 255), (172, 196, 218, 255), 110, 205),
        (2, (108, 138, 170, 255), (132, 162, 192, 255), 145, 255),
    )
    for band, col, lit, hmin, hmax in bands:
        x = -40
        while x < W + 40:
            w = rnd.randrange(46, 118)
            h = rnd.randrange(hmin, hmax)
            top = H - h
            d.rectangle([x * S, top * S, (x + w) * S, H * S], fill=col)
            d.rectangle([x * S, top * S, (x + int(w * 0.28)) * S, H * S], fill=lit)  # sunlit face
            if band == 2:
                for wy in range(top + 18, H - 18, 26):
                    for wx in range(x + 12, x + w - 14, 20):
                        if rnd.random() < 0.34:
                            d.rectangle([wx * S, wy * S, (wx + 9) * S, (wy + 12) * S],
                                        fill=(255, 236, 176, 255))
            if rnd.random() < 0.28:                                          # water tower
                tx = x + w // 2
                d.rectangle([(tx - 15) * S, (top - 28) * S, (tx + 15) * S, top * S], fill=col)
                for lx in (tx - 11, tx + 8):
                    d.rectangle([lx * S, (top - 30) * S, (lx + 4) * S, (top - 2) * S], fill=col)
            x += w + rnd.randrange(4, 20)
    for cxp in (220, 760):                                                   # depot cranes
        d.rectangle([(cxp - 4) * S, 44 * S, (cxp + 4) * S, H * S], fill=(96, 126, 158, 255))
        d.rectangle([(cxp - 92) * S, 44 * S, (cxp + 132) * S, 53 * S], fill=(96, 126, 158, 255))
        d.rectangle([(cxp + 118) * S, 53 * S, (cxp + 126) * S, 88 * S], fill=(96, 126, 158, 255))
    return down(im, W, H)


def favicon():
    W = H = 128
    im, d = canvas(W, H)
    d.rounded_rectangle([0, 0, W * S, H * S], radius=24 * S, fill=(24, 38, 62, 255))
    for off in (-30, 30):                                                     # converging rails
        poly(d, [(64 + off * 0.35, 40), (64 + off * 0.55, 40),
                 (64 + off * 1.5, 122), (64 + off * 1.05, 122)], STEEL, NAVY, 3)
    ell(d, (30, 26, 98, 94), GOLD, NAVY, 6)
    ell(d, (42, 36, 86, 84), (255, 240, 180, 255), None, 0)
    poly(d, [(70, 38), (50, 64), (64, 64), (56, 84), (78, 56), (64, 56)], NAVY, None, 0)
    return down(im, W, H)


def main(out):
    os.makedirs(out, exist_ok=True)
    jobs = {
        # 2D sprite kit — superseded by the 3D scene; kept for reference only.
        "hero_run_a.png": lambda: hero("run_a"),
        "hero_run_b.png": lambda: hero("run_b"),
        "hero_jump.png": lambda: hero("jump"),
        "hero_roll.png": lambda: hero("roll"),
        "chaser.png": chaser,
        "train.png": train_rear,
        "barrier.png": barrier,
        "gantry.png": gantry,
        "track.png": track_tile,
        "city.png": city,
        "favicon.png": favicon,
    }
    for name, fn in jobs.items():
        im = fn()
        p = os.path.join(out, name)
        im.save(p, optimize=True)
        print(f"  {name:18s} {im.width}x{im.height}  {os.path.getsize(p)//1024} KB")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "public/assets")
