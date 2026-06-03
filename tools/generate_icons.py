"""Generate the FaceAttend brand assets (app icon, adaptive icon, splash, grain).

Aesthetic: "field terminal" — warm charcoal, hi-vis amber signal accent, a
targeting-reticle framing a minimal face glyph with a scan line. Rendered at 4x
and downscaled (LANCZOS) for crisp anti-aliasing. No external assets needed.

Run:  poc/.venv/Scripts/python.exe tools/generate_icons.py
Out:  mobile/assets/{icon,adaptive-icon,splash-icon,favicon}.png + textures/grain.png
"""
import os
import math
import random
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "mobile", "assets"))
TEX = os.path.join(ASSETS, "textures")

# palette
CHARCOAL = (20, 19, 16)
CHARCOAL_D = (12, 11, 9)
AMBER = (255, 177, 0)
AMBER_BRIGHT = (255, 200, 70)
EMBER = (255, 122, 0)
CREAM = (245, 236, 216)

SS = 4  # supersample factor


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (1, size), 0)
    px = img.load()
    for y in range(size):
        px[0, y] = lerp(top, bottom, y / max(1, size - 1))
    return img.resize((size, size))


def make_bg(S):
    """Warm charcoal vertical gradient with a soft amber glow behind the glyph."""
    base = vertical_gradient(S, lerp(CHARCOAL, (36, 31, 22), 0.5), CHARCOAL_D)
    mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(mask)
    cx, cy, radius, steps = S * 0.5, S * 0.42, S * 0.58, 64
    for i in range(steps, 0, -1):
        r = radius * i / steps
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(70 * (1 - i / steps)))
    base.paste(Image.new("RGB", (S, S), lerp(CHARCOAL, EMBER, 0.75)), (0, 0), mask)
    return base.convert("RGBA")


def draw_glyph(draw, box, scale=1.0):
    """Draw reticle + face glyph centered in `box` (x0,y0,x1,y1)."""
    x0, y0, x1, y1 = box
    w = x1 - x0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    # --- targeting reticle: 4 corner brackets ---
    inset = w * 0.04
    arm = w * 0.20
    th = max(2, int(w * 0.035))
    corners = [
        (x0 + inset, y0 + inset, 1, 1),
        (x1 - inset, y0 + inset, -1, 1),
        (x0 + inset, y1 - inset, 1, -1),
        (x1 - inset, y1 - inset, -1, -1),
    ]
    for px, py, sx, sy in corners:
        draw.line([(px, py), (px + sx * arm, py)], fill=AMBER, width=th)
        draw.line([(px, py), (px, py + sy * arm)], fill=AMBER, width=th)

    # --- face: head ---
    hr = w * 0.255
    hth = max(2, int(w * 0.04))
    draw.ellipse([cx - hr, cy - hr * 1.12, cx + hr, cy + hr * 1.12], outline=CREAM, width=hth)

    # --- eyes ---
    er = w * 0.038
    ey = cy - hr * 0.18
    for ex in (cx - hr * 0.42, cx + hr * 0.42):
        draw.ellipse([ex - er, ey - er, ex + er, ey + er], fill=AMBER)

    # --- smile arc ---
    sm = hr * 0.5
    draw.arc([cx - sm, cy - sm * 0.2, cx + sm, cy + sm * 1.1], start=25, end=155,
             fill=CREAM, width=max(2, int(w * 0.028)))

    # --- scan line (glow under, bright over) ---
    sl_y = cy + hr * 0.05
    draw.line([(x0 + inset + arm * 0.2, sl_y), (x1 - inset - arm * 0.2, sl_y)],
              fill=EMBER, width=max(2, int(w * 0.05)))
    draw.line([(x0 + inset + arm * 0.2, sl_y), (x1 - inset - arm * 0.2, sl_y)],
              fill=AMBER_BRIGHT, width=max(1, int(w * 0.016)))


def make_icon(size, full_bg=True):
    S = size * SS
    img = make_bg(S) if full_bg else Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = S * 0.17  # margin -> safe zone for adaptive
    draw_glyph(d, (m, m, S - m, S - m))
    return img.resize((size, size), Image.LANCZOS)


def make_grain(size=512, alpha=26):
    random.seed(7)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    for y in range(size):
        for x in range(size):
            v = random.randint(0, 255)
            px[x, y] = (v, v, v, random.randint(0, alpha))
    return img


def main():
    os.makedirs(ASSETS, exist_ok=True)
    os.makedirs(TEX, exist_ok=True)

    make_icon(1024, full_bg=True).save(os.path.join(ASSETS, "icon.png"))
    make_icon(1024, full_bg=False).save(os.path.join(ASSETS, "adaptive-icon.png"))
    make_icon(1024, full_bg=False).save(os.path.join(ASSETS, "splash-icon.png"))
    make_icon(96, full_bg=True).save(os.path.join(ASSETS, "favicon.png"))
    make_grain().save(os.path.join(TEX, "grain.png"))
    print("[ok] wrote icon, adaptive-icon, splash-icon, favicon, textures/grain.png")


if __name__ == "__main__":
    main()
