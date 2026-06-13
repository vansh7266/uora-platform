"""
Generates the UORA intro title-card for the demo video voice-over segment 0.

Output: UORA-Intro-Card.png at 1920x1080 (16:9 HD) — drop it in the timeline
and hold for the 30-second intro narration.

Style: Void Terminal — black void background, plasma cyan accents, mono font,
corner ticks, subtle grid, big UORA wordmark, participant card.
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont

# ── Canvas ────────────────────────────────────────────────────────────────────
W, H = 1920, 1080

# ── Palette ───────────────────────────────────────────────────────────────────
VOID_950 = (5, 11, 20)          # near-black background
VOID_900 = (10, 21, 37)         # panel background
VOID_700 = (26, 48, 80)         # subtle border
PLASMA   = (0, 212, 255)        # primary accent
PLASMA_D = (0, 158, 189)        # plasma dim
BID      = (22, 199, 132)       # accent green
INK_0    = (240, 246, 252)      # primary text
INK_200  = (200, 209, 217)      # body text
INK_400  = (139, 148, 158)      # muted
INK_500  = (110, 118, 129)      # subtle


def _try_font(candidates: list[tuple[str, int]]) -> ImageFont.FreeTypeFont:
    """Pick the first font path that loads, else fall back to PIL default."""
    for path, size in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def build(out: str) -> None:
    img = Image.new("RGB", (W, H), VOID_950)
    draw = ImageDraw.Draw(img, "RGBA")

    # ── 1. Subtle plasma diagonal grid (very low opacity) ─────────────────────
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grid)
    step = 64
    for i in range(-H, W + H, step):
        gdraw.line([(i, 0), (i + H, H)], fill=(0, 212, 255, 7), width=1)
    img.paste(grid, (0, 0), grid)

    # ── 2. Centered radial-ish glow behind the wordmark ───────────────────────
    glow_w, glow_h = 1200, 600
    glow = Image.new("RGBA", (glow_w, glow_h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    for r in range(8):
        a = max(0, 35 - r * 4)
        gdraw.ellipse(
            [r * 40, r * 25, glow_w - r * 40, glow_h - r * 25],
            fill=(0, 212, 255, a),
        )
    img.paste(glow, ((W - glow_w) // 2, (H - glow_h) // 2 - 60), glow)

    # ── 3. Outer frame with corner ticks ──────────────────────────────────────
    M = 60  # outer margin
    draw.rectangle([M, M, W - M, H - M], outline=PLASMA + (90,), width=1)
    tick_len = 50
    tick_w = 6
    # top-left
    draw.line([(M, M), (M + tick_len, M)], fill=PLASMA, width=tick_w)
    draw.line([(M, M), (M, M + tick_len)], fill=PLASMA, width=tick_w)
    # top-right
    draw.line([(W - M - tick_len, M), (W - M, M)], fill=PLASMA, width=tick_w)
    draw.line([(W - M, M), (W - M, M + tick_len)], fill=PLASMA, width=tick_w)
    # bottom-left
    draw.line([(M, H - M - tick_len), (M, H - M)], fill=PLASMA, width=tick_w)
    draw.line([(M, H - M), (M + tick_len, H - M)], fill=PLASMA, width=tick_w)
    # bottom-right
    draw.line([(W - M, H - M - tick_len), (W - M, H - M)], fill=PLASMA, width=tick_w)
    draw.line([(W - M - tick_len, H - M), (W - M, H - M)], fill=PLASMA, width=tick_w)

    # ── 4. Status bar (top) ───────────────────────────────────────────────────
    bar_top = M + 30
    font_mono_s = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 22),
        ("/System/Library/Fonts/Monaco.ttf", 22),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22),
    ])
    draw.text((M + 40, bar_top), "// PLATFORM  ONLINE",
              font=font_mono_s, fill=PLASMA)
    draw.text((W - M - 320, bar_top), "IICPC  2026  ·  TITLE  CARD",
              font=font_mono_s, fill=INK_400)

    # blinking dot
    dot_y = bar_top + 7
    draw.ellipse([M + 22, dot_y, M + 36, dot_y + 14], fill=BID)

    # ── 5. UORA wordmark (HUGE, center) ───────────────────────────────────────
    # Try to load a heavy display font
    font_brand = _try_font([
        ("/System/Library/Fonts/Helvetica.ttc", 380),
        ("/System/Library/Fonts/HelveticaNeue.ttc", 380),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 380),
    ])
    text = "UORA"
    bbox = draw.textbbox((0, 0), text, font=font_brand, stroke_width=0)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (W - tw) // 2 - bbox[0]
    ty = (H - th) // 2 - bbox[1] - 180
    # subtle plasma shadow
    draw.text((tx + 4, ty + 4), text, font=font_brand, fill=(0, 158, 189, 90))
    draw.text((tx, ty), text, font=font_brand, fill=INK_0)

    # ── 6. Subtitle (full name) ───────────────────────────────────────────────
    font_sub = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 34),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 34),
    ])
    sub = "UNIFIED  ORDERBOOK  RESILIENCE  ARCHITECTURE"
    bbox = draw.textbbox((0, 0), sub, font=font_sub)
    sw = bbox[2] - bbox[0]
    sy = ty + th + 60
    draw.text(((W - sw) // 2 - bbox[0], sy), sub, font=font_sub, fill=PLASMA)

    # divider line under subtitle
    line_w = 460
    cy = sy + 80
    draw.line([(W // 2 - line_w // 2, cy), (W // 2 + line_w // 2, cy)],
              fill=(0, 212, 255, 90), width=2)

    # ── 7. Participant card (bottom) ──────────────────────────────────────────
    card_w, card_h = 960, 220
    card_x = (W - card_w) // 2
    card_y = H - M - 80 - card_h

    # background
    card_bg = Image.new("RGBA", (card_w, card_h), VOID_900 + (255,))
    img.paste(card_bg, (card_x, card_y), card_bg)
    # border
    draw.rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                   outline=PLASMA, width=2)
    # left plasma stripe
    draw.rectangle([card_x, card_y, card_x + 6, card_y + card_h], fill=PLASMA)

    # card label
    draw.text((card_x + 36, card_y + 22),
              "// SUBMITTED  BY",
              font=font_mono_s, fill=INK_500)

    # NAME (big)
    font_name = _try_font([
        ("/System/Library/Fonts/Helvetica.ttc", 64),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 64),
    ])
    draw.text((card_x + 36, card_y + 55), "VANSH  GUPTA",
              font=font_name, fill=INK_0)

    # meta rows
    font_meta_l = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 24),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 24),
    ])
    font_meta_v = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 24),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 24),
    ])
    meta = [
        ("INSTITUTION", "IIIT Bhopal  ·  Information Technology, 2nd Year"),
        ("TEAM",        "UORA  ·  Solo participant"),
    ]
    my = card_y + 138
    for label, value in meta:
        draw.text((card_x + 36, my), label, font=font_meta_l, fill=PLASMA)
        draw.text((card_x + 240, my), value, font=font_meta_v, fill=INK_200)
        my += 32

    # ── 8. Bottom-right scoreboard ────────────────────────────────────────────
    draw.text((M + 40, H - M - 40),
              "github.com/vansh7266/uora-platform  ·  http://35.254.55.195:3000",
              font=font_mono_s, fill=INK_500)
    draw.text((W - M - 270, H - M - 40),
              "v2.0  ·  PRODUCTION",
              font=font_mono_s, fill=BID)

    img.save(out, "PNG", optimize=True)


if __name__ == "__main__":
    out_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(out_dir, "UORA-Intro-Card.png")
    build(out_path)
    print(f"OK -> {out_path}")
