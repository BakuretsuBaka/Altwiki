#!/usr/bin/env python3
"""Redraws icons/icon-*.png (needs Pillow): a red puzzle piece with a white blackletter a in a black outline."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024  # drawn large, scaled down at the end

def piece_mask():
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([170, 250, 770, 850], radius=34, fill=255)
    # knobs on top and right
    d.rectangle([430, 190, 510, 270], fill=255)
    d.ellipse([370, 105, 570, 305], fill=255)
    d.rectangle([750, 510, 830, 590], fill=255)
    d.ellipse([715, 450, 915, 650], fill=255) if False else d.ellipse([735, 450, 935, 650], fill=255)
    # notches on the left and the bottom
    d.ellipse([105, 485, 235, 615], fill=0)
    d.rectangle([150, 525, 200, 575], fill=0)
    d.ellipse([405, 785, 535, 915], fill=0)
    d.rectangle([445, 830, 495, 880], fill=0)
    return m.filter(ImageFilter.GaussianBlur(1.5)).point(lambda v: 255 if v > 127 else 0)

def gradient(top, bottom):
    g = Image.new("RGBA", (S, S))
    px = g.load()
    for y in range(S):
        t = min(1, max(0, (y - 100) / 800))
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,)
        for x in range(S):
            px[x, y] = c
    return g

def draw():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    m = piece_mask()
    # soft shadow
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 110), (0, 0), m)
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    im.alpha_composite(ImageChops.offset(sh, 0, 16))
    # dark red rim, then the red body inset by it
    rim = m
    inner = m.filter(ImageFilter.MinFilter(25))
    im.paste(gradient((120, 8, 20), (90, 4, 14)), (0, 0), rim)
    im.paste(gradient((255, 92, 80), (196, 20, 34)), (0, 0), inner)
    # glossy highlight along the top-left
    hl = Image.new("L", (S, S), 0)
    ImageDraw.Draw(hl).ellipse([120, 120, 760, 620], fill=70)
    hl = ImageChops.multiply(hl.filter(ImageFilter.GaussianBlur(40)), inner.filter(ImageFilter.MinFilter(21)))
    im.paste(Image.new("RGBA", (S, S), (255, 255, 255, 255)), (0, 0), hl)
    # the blackletter a (Fraktur, like the mathematical letter): black outline first, white on top
    font = ImageFont.truetype(os.path.join(ROOT, "tools", "fonts", "UnifrakturMaguntia.ttf"), 960)
    g = Image.new("L", (S, S), 0)
    ImageDraw.Draw(g).text((0, 0), "a", font=font, fill=255)
    box = g.getbbox()
    g = g.crop(box)
    cx, cy = 472, 560
    glyph = Image.new("L", (S, S), 0)
    glyph.paste(g, (cx - g.width // 2, cy - g.height // 2))
    outline = glyph.filter(ImageFilter.MaxFilter(41)).filter(ImageFilter.GaussianBlur(2)).point(lambda v: 255 if v > 127 else 0)
    # drop shadow, outline, a faint grey shade on the lower part of the letter, then the white letter
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((0, 0, 0, 110), (0, 0), outline)
    im.alpha_composite(ImageChops.offset(sh.filter(ImageFilter.GaussianBlur(10)), 0, 12))
    im.paste((10, 10, 12, 255), (0, 0), outline)
    letter = Image.new("RGBA", (S, S))
    px = letter.load()
    y0, y1 = cy - g.height // 2, cy + g.height // 2
    for y in range(S):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        c = (255, 255, 255) if t < 0.55 else tuple(int(255 - 38 * (t - 0.55) / 0.45) for _ in range(3))
        for x in range(S):
            px[x, y] = c + (255,)
    im.paste(letter, (0, 0), glyph)
    return im

img = draw().crop((60, 60, 964, 964)).convert("RGBa").resize((512, 512), Image.LANCZOS).convert("RGBA")
os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for size in (16, 32, 48, 128):
    img.convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA").save(os.path.join(ROOT, "icons", f"icon-{size}.png"))
print("icons written")
