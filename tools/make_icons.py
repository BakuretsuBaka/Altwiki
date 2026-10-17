#!/usr/bin/env python3
"""Redraws icons/icon-*.png (needs Pillow)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 512

def draw():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # background: rounded square, teal to indigo
    bg = Image.new("RGBA", (S, S))
    px = bg.load()
    for y in range(S):
        for x in range(S):
            t = (x + y) / (2 * S)
            px[x, y] = (int(20 + 60 * t), int(150 - 60 * t), int(170 - 10 * t), 255)
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=110, fill=255)
    im.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(im)
    # open book
    white = (255, 255, 255, 255)
    page = (232, 244, 248, 255)
    d.polygon([(256, 190), (96, 160), (96, 360), (256, 392)], fill=page)
    d.polygon([(256, 190), (416, 160), (416, 360), (256, 392)], fill=white)
    d.line([(256, 190), (256, 392)], fill=(40, 110, 140, 255), width=8)
    for i, y in enumerate((222, 254, 286, 318)):
        d.line([(128, y - 8 + i * 0), (232, y + 8)], fill=(120, 170, 190, 255), width=10)
        d.line([(284, y + 8), (388, y - 8)], fill=(150, 190, 205, 255), width=10)
    # curved arrow over the book: "go elsewhere"
    d.arc([128, 60, 384, 260], start=200, end=340, fill=white, width=26)
    d.polygon([(384, 160), (340, 150), (372, 112)], fill=white)
    return im

img = draw()
os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for size in (16, 32, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, "icons", f"icon-{size}.png"))
print("icons written")
