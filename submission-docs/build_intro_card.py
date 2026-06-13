"""
Generates the UORA intro title-card for the demo video voice-over segment 0.

Output: UORA-Intro-Card.png at 1920x1080 (16:9 HD) — drop it in the timeline
and hold for the 30-second intro narration.

Style: clean Void Terminal — black void background, plasma cyan accents,
mono font, corner ticks, sharply zoned layout. Every element lives in its
own band with explicit padding; nothing overlaps anything else.
"""
from __future__ import annotations
import os
from PIL import Image, ImageDraw, ImageFont

# ── Canvas ────────────────────────────────────────────────────────────────────
W, H = 1920, 1080

# ── Palette ───────────────────────────────────────────────────────────────────
VOID_950 = (5, 11, 20)
VOID_900 = (10, 21, 37)
VOID_800 = (17, 32, 58)
VOID_700 = (26, 48, 80)
PLASMA   = (0, 212, 255)
PLASMA_D = (0, 158, 189)
BID      = (22, 199, 132)
INK_0    = (240, 246, 252)
INK_200  = (200, 209, 217)
INK_400  = (139, 148, 158)
INK_500  = (110, 118, 129)


def _try_font(candidates: list[tuple[str, int]]) -> ImageFont.FreeTypeFont:
    for path, size in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _center_text(draw, text, font, y, color, stroke=None):
    bbox = draw.textbbox((0, 0), text, font=font)
    x = (W - (bbox[2] - bbox[0])) // 2 - bbox[0]
    if stroke:
        draw.text((x, y), text, font=font, fill=color,
                  stroke_width=stroke[0], stroke_fill=stroke[1])
    else:
        draw.text((x, y), text, font=font, fill=color)
    return bbox[3] - bbox[1]


def build(out: str) -> None:
    img = Image.new("RGB", (W, H), VOID_950)
    draw = ImageDraw.Draw(img, "RGBA")

    # ── Background grid (very subtle diagonal) ────────────────────────────────
    grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(grid)
    step = 80
    for i in range(-H, W + H, step):
        gdraw.line([(i, 0), (i + H, H)], fill=(0, 212, 255, 5), width=1)
    img.paste(grid, (0, 0), grid)

    # ── Outer frame + corner ticks ────────────────────────────────────────────
    M = 70
    draw.rectangle([M, M, W - M, H - M], outline=PLASMA + (60,), width=1)
    tick = 60
    tw_ = 6
    for (cx, cy) in [(M, M), (W - M, M), (M, H - M), (W - M, H - M)]:
        dx = tick if cx == M else -tick
        dy = tick if cy == M else -tick
        draw.line([(cx, cy), (cx + dx, cy)], fill=PLASMA, width=tw_)
        draw.line([(cx, cy), (cx, cy + dy)], fill=PLASMA, width=tw_)

    # ─── ZONE 1: TOP STATUS BAR (y: 100 - 150) ────────────────────────────────
    font_mono = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 22),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22),
    ])
    bar_y = 118
    # left: live indicator
    draw.ellipse([M + 28, bar_y + 8, M + 42, bar_y + 22], fill=BID)
    draw.text((M + 56, bar_y + 4), "// PLATFORM  ONLINE",
              font=font_mono, fill=PLASMA)
    # right: context
    right_txt = "IICPC  2026  ·  TEAM  UORA"
    bbox = draw.textbbox((0, 0), right_txt, font=font_mono)
    draw.text((W - M - 28 - (bbox[2] - bbox[0]), bar_y + 4),
              right_txt, font=font_mono, fill=INK_500)
    # divider under status bar
    draw.line([(M + 28, bar_y + 44), (W - M - 28, bar_y + 44)],
              fill=PLASMA + (45,), width=1)

    # ─── ZONE 2: BRAND BLOCK ──────────────────────────────────────────────────
    # Wordmark — smaller so the rest of the layout breathes.
    font_brand = _try_font([
        ("/System/Library/Fonts/Helvetica.ttc", 280),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 280),
    ])
    wordmark = "UORA"
    bbox = draw.textbbox((0, 0), wordmark, font=font_brand)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    word_y = 230
    word_x = (W - tw) // 2 - bbox[0]
    draw.text((word_x, word_y), wordmark, font=font_brand, fill=INK_0)

    # thin plasma underline directly under the wordmark
    underline_top = word_y + th + 30
    line_w = 280
    draw.line([(W // 2 - line_w // 2, underline_top),
               (W // 2 + line_w // 2, underline_top)],
              fill=PLASMA, width=3)

    # Subtitle — single line below the wordmark
    font_sub = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 30),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 30),
    ])
    sub_y = underline_top + 26
    _center_text(draw,
                 "UNIFIED  ORDERBOOK  RESILIENCE  ARCHITECTURE",
                 font_sub, sub_y, PLASMA)

    # Tagline — short, below subtitle
    font_tag = _try_font([
        ("/System/Library/Fonts/Helvetica.ttc", 22),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22),
    ])
    tag_y = sub_y + 64
    _center_text(draw,
                 "Matching-engine benchmarking at microsecond scale",
                 font_tag, tag_y, INK_400)

    # ─── ZONE 3: PARTICIPANT CARD ─────────────────────────────────────────────
    card_w, card_h = 1000, 230
    card_x = (W - card_w) // 2
    card_y = 700

    # solid panel background
    draw.rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                   fill=VOID_900)
    # plasma left stripe (lives INSIDE the card, not over the border)
    draw.rectangle([card_x, card_y, card_x + 8, card_y + card_h], fill=PLASMA)
    # 1-px border around the whole card
    draw.rectangle([card_x, card_y, card_x + card_w, card_y + card_h],
                   outline=PLASMA, width=2)

    # card label (top zone)
    draw.text((card_x + 40, card_y + 24),
              "// SUBMITTED  BY",
              font=font_mono, fill=INK_500)

    # NAME — big
    font_name = _try_font([
        ("/System/Library/Fonts/Helvetica.ttc", 52),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 52),
    ])
    draw.text((card_x + 40, card_y + 60), "VANSH  GUPTA",
              font=font_name, fill=INK_0)

    # horizontal divider inside the card
    div_y = card_y + 138
    draw.line([(card_x + 40, div_y), (card_x + card_w - 40, div_y)],
              fill=VOID_700, width=1)

    # meta rows: two columns
    font_meta_l = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 21),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 21),
    ])
    font_meta_v = _try_font([
        ("/System/Library/Fonts/Menlo.ttc", 21),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", 21),
    ])
    row_y = div_y + 16
    # Institution
    draw.text((card_x + 40, row_y), "INSTITUTION",
              font=font_meta_l, fill=PLASMA)
    draw.text((card_x + 230, row_y),
              "IIIT Bhopal  ·  Information Technology, 2nd Year",
              font=font_meta_v, fill=INK_200)
    # Team
    draw.text((card_x + 40, row_y + 32), "TEAM",
              font=font_meta_l, fill=PLASMA)
    draw.text((card_x + 230, row_y + 32), "UORA  ·  Solo participant",
              font=font_meta_v, fill=INK_200)

    # ─── ZONE 4: FOOTER (y: 980 - 1010) ───────────────────────────────────────
    foot_y = H - M - 50
    # divider above footer
    draw.line([(M + 28, foot_y - 20), (W - M - 28, foot_y - 20)],
              fill=PLASMA + (45,), width=1)
    draw.text((M + 28, foot_y),
              "github.com/vansh7266/uora-platform  ·  35.254.55.195:3000",
              font=font_mono, fill=INK_500)
    right_foot = "v2.0  ·  PRODUCTION"
    bbox = draw.textbbox((0, 0), right_foot, font=font_mono)
    draw.text((W - M - 28 - (bbox[2] - bbox[0]), foot_y),
              right_foot, font=font_mono, fill=BID)

    img.save(out, "PNG", optimize=True)


if __name__ == "__main__":
    out_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(out_dir, "UORA-Intro-Card.png")
    build(out_path)
    print(f"OK -> {out_path}")
