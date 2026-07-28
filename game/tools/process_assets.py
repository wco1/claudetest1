#!/usr/bin/env python3
"""Turn the raw generated art into engine-ready sprites.

Every sprite is generated on a solid key colour (stylization.md section 5); this
script keys it out, despills the fringe, trims to content and rescales to the
final in-game size. The hero pose sheet is split into its four cells first, and
the three upright poses share one union bounding box so the character does not
change size between animation frames.

Usage:  python3 process_assets.py <raw_dir> <out_dir>
"""
import sys, os
import numpy as np
from PIL import Image

GREEN = "green"
MAGENTA = "magenta"


def key_out(im: Image.Image, key: str, hi: float = 40.0, lo: float = 6.0) -> Image.Image:
    """Soft chroma key + despill. `score` is how strongly the key hue dominates."""
    im = im.convert("RGBA")
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    if key == GREEN:
        score = g - np.maximum(r, b)
    else:  # magenta
        score = np.minimum(r, b) - g

    alpha = np.clip((hi - score) / max(1e-3, hi - lo), 0.0, 1.0) * 255.0

    # Despill: pull the key channel back down to the neighbouring channels.
    spill = score > lo
    if key == GREEN:
        g2 = np.where(spill, np.maximum(r, b), g)
        a[..., 1] = g2
    else:
        avg = np.maximum(g, np.minimum(r, b) * 0.0 + g)
        a[..., 0] = np.where(spill, np.minimum(r, avg + 12), r)
        a[..., 2] = np.where(spill, np.minimum(b, avg + 12), b)

    a[..., 3] = np.minimum(a[..., 3], alpha)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")


def bbox_of(im: Image.Image, thresh: int = 10):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return (0, 0, im.width, im.height)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def fit(im: Image.Image, box, target_w: int, pad_frac: float = 0.04) -> Image.Image:
    """Crop to `box`, add a small transparent margin, scale so width == target_w."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    pad = int(max(w, h) * pad_frac)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    cropped = im.crop((x0, y0, x1, y1))
    scale = target_w / cropped.width
    return cropped.resize(
        (target_w, max(1, int(round(cropped.height * scale)))), Image.LANCZOS)


def save(im: Image.Image, out_dir: str, name: str):
    p = os.path.join(out_dir, name)
    im.save(p, optimize=True)
    print(f"  {name:22s} {im.width}x{im.height}  {os.path.getsize(p)//1024} KB")


def process_hero_sheet(raw_dir: str, out_dir: str):
    """2x2 pose sheet -> run_a, run_b, jump (shared box) + roll (own box)."""
    sheet = Image.open(os.path.join(raw_dir, "hero_sheet.png")).convert("RGBA")
    W, H = sheet.size
    inset = int(min(W, H) * 0.012)          # skip the divider lines
    cells = {
        "hero_run_a": (0, 0), "hero_run_b": (1, 0),
        "hero_jump": (0, 1), "hero_roll": (1, 1),
    }
    keyed = {}
    for name, (cx, cy) in cells.items():
        box = (cx * W // 2 + inset, cy * H // 2 + inset,
               (cx + 1) * W // 2 - inset, (cy + 1) * H // 2 - inset)
        keyed[name] = key_out(sheet.crop(box), GREEN)

    upright = ["hero_run_a", "hero_run_b", "hero_jump"]
    ubox = union([bbox_of(keyed[n]) for n in upright])
    for n in upright:
        save(fit(keyed[n], ubox, 256), out_dir, n + ".png")
    save(fit(keyed["hero_roll"], bbox_of(keyed["hero_roll"]), 288), out_dir, "hero_roll.png")


# raw file -> (output name, key colour, target width)
SPRITES = [
    ("chaser.png",  "chaser.png",  GREEN,   360),
    ("train.png",   "train.png",   MAGENTA, 512),
    ("barrier.png", "barrier.png", GREEN,   256),
    ("gantry.png",  "gantry.png",  GREEN,   384),
]


def main(raw_dir: str, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    print("hero sheet:")
    process_hero_sheet(raw_dir, out_dir)

    print("sprites:")
    for src, dst, key, tw in SPRITES:
        im = key_out(Image.open(os.path.join(raw_dir, src)), key)
        save(fit(im, bbox_of(im), tw), out_dir, dst)

    print("backgrounds:")
    city = Image.open(os.path.join(raw_dir, "city.png")).convert("RGBA")
    save(city.resize((1024, int(1024 * city.height / city.width)), Image.LANCZOS),
         out_dir, "city.png")

    track = Image.open(os.path.join(raw_dir, "track.png")).convert("RGB")
    save(track.resize((512, 512), Image.LANCZOS), out_dir, "track.png")

    fav = os.path.join(raw_dir, "favicon.png")
    if os.path.exists(fav):
        save(Image.open(fav).convert("RGBA").resize((128, 128), Image.LANCZOS),
             out_dir, "favicon.png")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "work",
         sys.argv[2] if len(sys.argv) > 2 else "public/assets")
