#!/usr/bin/env python3
"""Redraws icons/icon-*.png (needs Pillow and numpy): a glossy red puzzle piece with a white blackletter a."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = 1024  # drawn large, scaled down at the end
BODY = (232, 250, 792, 810)  # x0, y0, x1, y1 of the square part
CX, CY = (BODY[0] + BODY[2]) // 2, (BODY[1] + BODY[3]) // 2

def blur(m, r):
    return m.filter(ImageFilter.GaussianBlur(r))

def piece_mask():
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle(BODY, radius=46, fill=255)
    r = 92
    # knobs: top and right (neck + round head), notches: left and bottom
    tx, ty = CX, BODY[1]
    d.rectangle([tx - 44, ty - 70, tx + 44, ty + 20], fill=255)
    d.ellipse([tx - r, ty - 70 - r + 20, tx + r, ty - 70 + r + 20], fill=255)
    rx, ry = BODY[2], CY
    d.rectangle([rx - 20, ry - 44, rx + 70, ry + 44], fill=255)
    d.ellipse([rx + 70 - r + 20, ry - r, rx + 70 + r + 20, ry + r], fill=255)
    nr = 92
    lx, ly = BODY[0], CY
    d.rectangle([lx - 10, ly - 40, lx + 70, ly + 40], fill=0)
    d.ellipse([lx + 38 - nr, ly - nr, lx + 38 + nr, ly + nr], fill=0)
    bx, by = CX, BODY[3]
    d.rectangle([bx - 40, by - 70, bx + 40, by + 10], fill=0)
    d.ellipse([bx - nr, by - 38 - nr, bx + nr, by - 38 + nr], fill=0)
    # round all the corners where the knobs meet the body
    return blur(m, 9).point(lambda v: 255 if v > 127 else 0).filter(ImageFilter.GaussianBlur(1.2))

def shaded(mask, base_top, base_bottom):
    """Red surface lit from the top left, with a bevelled edge."""
    h = np.asarray(blur(mask, 26), dtype=np.float32) / 255.0
    gy, gx = np.gradient(h)
    nx, ny = -gx * 90, -gy * 90
    nz = np.ones_like(nx)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    L = np.array([-0.55, -0.7, 0.45]); L /= np.linalg.norm(L)
    lam = (nx * L[0] + ny * L[1] + nz * L[2]) / n
    spec = np.clip(lam, 0, 1) ** 28
    yy = np.linspace(0, 1, S, dtype=np.float32)[:, None]
    top, bot = np.array(base_top, np.float32), np.array(base_bottom, np.float32)
    base = top[None, None, :] * (1 - yy[..., None]) + bot[None, None, :] * yy[..., None]
    base = np.broadcast_to(base, (S, S, 3))
    col = base * np.clip(0.55 + 0.75 * lam, 0.35, 1.35)[..., None] + 255 * 0.55 * spec[..., None]
    # soft sheen across the upper half
    sheen = np.clip(1 - np.hypot((np.arange(S)[None, :] - 420) / 520, (np.arange(S)[:, None] - 330) / 300), 0, 1) ** 2
    col = col + 70 * sheen[..., None]
    rgba = np.dstack([np.clip(col, 0, 255), np.full((S, S), 255)]).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")

def draw():
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    m = piece_mask()
    # shadow on the ground
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((60, 0, 0, 150), (0, 0), m)
    im.alpha_composite(ImageChops.offset(blur(sh, 20), 0, 26))
    # dark rim, red body, thin light edge inside
    rim = Image.new("RGBA", (S, S), (92, 4, 14, 255))
    im.paste(rim, (0, 0), m)
    body = m.filter(ImageFilter.MinFilter(21)).filter(ImageFilter.GaussianBlur(1.2))
    im.paste(shaded(m, (255, 70, 70), (170, 8, 28)), (0, 0), body)
    edge = ImageChops.subtract(body, body.filter(ImageFilter.MinFilter(9)))
    edge = ImageChops.offset(edge, -3, -3)
    glow = Image.new("RGBA", (S, S), (255, 190, 180, 255))
    im.paste(glow, (0, 0), ImageChops.multiply(edge, body).point(lambda v: int(v * 0.45)))

    # the blackletter a (Fraktur, like the mathematical letter), centred on the body by its centre of mass
    font = ImageFont.truetype(os.path.join(ROOT, "tools", "fonts", "UnifrakturMaguntia.ttf"), 760)
    g = Image.new("L", (S * 2, S * 2), 0)
    ImageDraw.Draw(g).text((200, 100), "a", font=font, fill=255)
    g = g.crop(g.getbbox())
    arr = np.asarray(g, dtype=np.float32)
    ys, xs = np.mgrid[0:arr.shape[0], 0:arr.shape[1]]
    mx, my = (arr * xs).sum() / arr.sum(), (arr * ys).sum() / arr.sum()
    # blend centre of mass and bounding-box centre so it also looks centred
    ox = 0.5 * mx + 0.5 * (arr.shape[1] / 2)
    oy = 0.5 * my + 0.5 * (arr.shape[0] / 2)
    glyph = Image.new("L", (S, S), 0)
    glyph.paste(g, (int(CX - ox), int(CY - oy)))
    outline = blur(glyph.filter(ImageFilter.MaxFilter(37)), 2).point(lambda v: 255 if v > 127 else 0).filter(ImageFilter.GaussianBlur(1))
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sh.paste((40, 0, 0, 140), (0, 0), outline)
    im.alpha_composite(ImageChops.offset(blur(sh, 12), 0, 14))
    im.paste((12, 8, 10, 255), (0, 0), outline)
    # white letter with a light shade towards the bottom
    gl = np.asarray(glyph).astype(np.float32)
    yy = np.arange(S)[:, None]
    box = glyph.getbbox()
    t = np.clip((yy - box[1]) / (box[3] - box[1]), 0, 1)
    v = 255 - 46 * np.clip((t - 0.45) / 0.55, 0, 1) ** 1.3
    letter = np.dstack([np.broadcast_to(v, (S, S))] * 3 + [np.full((S, S), 255.0)]).astype(np.uint8)
    im.paste(Image.fromarray(letter, "RGBA"), (0, 0), glyph)
    # the same top-left shine on the outline edge of the letter
    return im

full = draw()
bb = full.getbbox()
side = max(bb[2] - bb[0], bb[3] - bb[1]) + 60
cx, cy = (bb[0] + bb[2]) // 2, (bb[1] + bb[3]) // 2
full = full.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2))
img = full.convert("RGBa").resize((512, 512), Image.LANCZOS).convert("RGBA")
os.makedirs(os.path.join(ROOT, "icons"), exist_ok=True)
for size in (16, 32, 48, 128):
    img.convert("RGBa").resize((size, size), Image.LANCZOS).convert("RGBA").save(os.path.join(ROOT, "icons", f"icon-{size}.png"))
print("icons written")
