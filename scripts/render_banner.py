#!/usr/bin/env python3
"""
Render OPENMAIWAIFU Twitter banner (1500x500) in Claude Code terminal style.

Uses direct bold monospace text rendering at high resolution,
styled like a terminal with cursor blink and prompt aesthetics.
"""

from PIL import Image, ImageDraw, ImageFont
import os

# ── Config ──
WIDTH, HEIGHT = 1500, 500
SCALE = 3
RW, RH = WIDTH * SCALE, HEIGHT * SCALE

BG       = (13, 13, 13)
ORANGE   = (217, 119, 58)   # Claude orange
WHITE    = (235, 235, 235)
DIM      = (90, 90, 90)
DIMMER   = (55, 55, 55)

OUTPUT = os.path.join(os.path.dirname(__file__), "..", "assets", "twitter_banner.png")

# ── Fonts ──
BOLD_FONTS = [
    "/System/Library/Fonts/SFMono-Bold.otf",
    "/System/Library/Fonts/Supplemental/Menlo-Bold.ttf",
    "/Library/Fonts/SF-Mono-Bold.otf",
]
REG_FONTS = [
    "/System/Library/Fonts/SFMono-Regular.otf",
    "/System/Library/Fonts/Menlo.ttc",
]

def find_font(candidates):
    for p in candidates:
        if os.path.exists(p):
            return p
    return None

bold_path = find_font(BOLD_FONTS) or find_font(REG_FONTS)
reg_path = find_font(REG_FONTS)
print(f"Bold: {bold_path}")
print(f"Regular: {reg_path}")

# ── Create image ──
img = Image.new("RGB", (RW, RH), BG)
draw = ImageDraw.Draw(img)

# ── Layout ──
# Main title: "OPENMAI" in orange, "WAIFU" in white
# Subtitle below
# Terminal prompt accent: "> " before title

title_size = int(RH * 0.30)  # ~30% of height for main text
sub_size = int(RH * 0.065)

title_font = ImageFont.truetype(bold_path, title_size) if bold_path else ImageFont.load_default()
sub_font = ImageFont.truetype(reg_path, sub_size) if reg_path else ImageFont.load_default()
prompt_font = ImageFont.truetype(reg_path, int(title_size * 0.5)) if reg_path else ImageFont.load_default()

# Measure "OPENMAIWAIFU"
part1 = "OPENMAI"
part2 = "WAIFU"

bb1 = title_font.getbbox(part1)
bb2 = title_font.getbbox(part2)
w1 = bb1[2] - bb1[0]
w2 = bb2[2] - bb2[0]
h_text = bb1[3] - bb1[1]

# Measure prompt ">"
prompt = "> "
pb = prompt_font.getbbox(prompt)
pw = pb[2] - pb[0]

# Total width of title line
total_w = pw + w1 + w2

# Center everything
x_start = (RW - total_w) // 2
y_title = int(RH * 0.22)

# Draw prompt ">" in dim
draw.text((x_start, y_title + h_text * 0.15), prompt, fill=DIM, font=prompt_font)

# Draw "OPENMAI" in orange
x_text = x_start + pw
draw.text((x_text, y_title), part1, fill=ORANGE, font=title_font)

# Draw "WAIFU" in white
draw.text((x_text + w1, y_title), part2, fill=WHITE, font=title_font)

# ── Cursor block ──
cursor_w = int(h_text * 0.55)
cursor_h = int(h_text * 0.85)
cx = x_text + w1 + w2 + int(h_text * 0.1)
cy = y_title + int(h_text * 0.15)
draw.rectangle([cx, cy, cx + cursor_w, cy + cursor_h], fill=ORANGE)

# ── Subtitle ──
subtitle = "AI Desktop Waifu with Memory, Personality & Emotions"
sb = sub_font.getbbox(subtitle)
sw = sb[2] - sb[0]
sx = (RW - sw) // 2
sy = y_title + h_text + int(RH * 0.10)
draw.text((sx, sy), subtitle, fill=DIM, font=sub_font)

# ── Decorative line ──
line_y = sy - int(RH * 0.035)
line_margin = int(RW * 0.15)
draw.line([(line_margin, line_y), (RW - line_margin, line_y)], fill=DIMMER, width=SCALE)

# ── Downscale ──
img = img.resize((WIDTH, HEIGHT), Image.LANCZOS)

os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
img.save(OUTPUT, "PNG")
print(f"Saved: {OUTPUT} ({WIDTH}x{HEIGHT})")
