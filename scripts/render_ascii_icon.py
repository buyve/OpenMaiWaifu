"""
Render braille ASCII art to a high-resolution PNG by decoding each braille
Unicode character into its 2x4 dot pattern and drawing filled circles.
Output: square 1024x1024 black background, white dots, auto-cropped to character.
"""

from PIL import Image, ImageDraw

ASCII_ART = """\
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⣿⣷⣦⣄⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣼⣿⣿⣿⣿⣿⣿⣷⣤⣀⠀⠀⠀⠀⠀⠉⠑⣶⣤⣄⣀⣠⣤⣶⣶⣿⣿⣿⣿⡇⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿⣿⣿⣿⣿⣿⡿⠟⠋⠁⠀⠀⠀⣀⠤⠒⠉⠈⢉⡉⠻⢿⣿⣿⣿⣿⣿⣿⣿⠀⠀⠀⠀
⠀⠀⠀⠀⣀⣴⣶⣿⣷⡄⠀⠀⠀⠀⢹⣿⣿⣿⣿⠏⠁⠀⢀⠄⠀⠀⠈⢀⠄⠀⢀⡖⠁⠀⢀⠀⠈⠻⣿⣿⣿⣿⡏⠀⠀⠀⠀
⠀⠀⢠⣾⣿⣿⣿⣿⡿⠁⠀⠀⠀⠀⢸⣿⣿⠏⠀⠀⢀⡴⠁⠀⠀⣠⠖⠁⢀⠞⠋⠀⢠⡇⢸⡄⠀⠀⠈⢻⣿⣿⠁⠀⠀⠀⠀
⠀⣠⣿⣿⣿⣿⣿⠟⠁⠀⠀⠀⠀⠀⢸⡿⠁⠀⠀⢀⡞⠀⠀⢀⡴⠃⠀⣰⠋⠀⠀⣰⡿⠀⡜⢳⡀⠘⣦⠀⢿⡇⠀⠀⠀⠀⠀
⢠⣿⣿⣿⣿⡿⠃⠀⠀⠀⠀⠀⠀⢰⣿⠃⠀⢀⠆⡞⡄⠀⣠⡞⠁⣀⢾⠃⠀⣀⡜⢱⠇⣰⠁⠈⣷⠂⢸⡇⠸⣵⠀⠀⠀⠀⠀
⣿⣿⣿⣿⡿⠁⠀⠀⠀⠀⠀⠀⢠⣿⠇⠀⠀⡜⣸⡟⢀⣴⡏⢠⣾⠋⡎⢀⣼⠋⢀⡎⡰⠃⠀⠀⣿⣓⢒⡇⠀⣿⠀⠀⠀⠀⠀
⣿⣿⣿⣿⠇⠀⠀⠀⠀⠀⠀⠴⢻⣟⢀⣀⢀⣧⡇⢨⠟⢾⣔⡿⠃⢸⢀⠞⠃⢀⣾⡜⠁⠀⠀⠀⡏⠁⢠⠃⠀⢹⠀⠀⠀⠀⠀
⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⢸⣼⢸⣿⡟⢻⣿⠿⣶⣿⣿⣿⣶⣾⣏⣀⣠⣾⣿⠔⠒⠉⠉⢠⠁⡆⡸⠀⡈⣸⠀⠀⠀⠀⠀
⣿⣿⣿⣿⣇⠀⠀⠀⠀⠀⠀⠀⣸⣿⣸⣿⣇⢸⠃⡄⢻⠃⣾⣿⢋⠘⣿⣿⠏⣿⡟⣛⡛⢻⣿⢿⣶⣷⣿⣶⢃⣿⠀⠀⠀⠀⠀
⢸⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⣰⠃⣿⣿⣿⣿⠀⣸⣧⠈⣸⣿⠃⠘⠃⢹⣿⠀⣿⠃⠛⠛⣿⡇⢸⣿⡇⢸⣿⡿⣿⡀⠀⠀⠀⠀
⠀⠻⣿⣿⣿⣿⣦⡀⠀⢀⡔⣹⣼⡟⡟⣿⣿⣿⠛⠻⠶⠿⠷⣾⣿⣿⣬⣿⣠⣿⣀⣿⣿⣿⡇⠸⡿⠀⣾⡏⢠⣿⣇⠀⠀⠀⠀
⠀⠀⠙⢿⣿⣿⣿⣿⣷⡞⢠⣿⢿⡇⣿⡹⡝⢿⡷⣄⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠙⠛⠛⠻⠿⣶⣶⣾⣿⣇⣾⠉⢯⠃⠀⠀⠀
⠀⠀⠀⠀⠙⠿⣿⣿⣿⠇⢸⠇⠘⣇⠸⡇⣿⣮⣳⡀⠉⠂⠀⠀⣀⣤⡤⢤⣀⠀⠀⠀⠀⠀⢈⣿⠟⣠⣾⠿⣿⡆⡄⣧⡀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠙⠻⡘⠾⣄⠀⠘⢦⣿⠃⠹⣿⣿⣶⠤⠀⠀⣿⠋⠉⠻⣿⠁⠀⠠⣀⣤⣾⣵⣾⡿⠃⣾⠏⣿⣧⠋⡇⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣠⠖⠳⣄⡈⠃⠀⠼⠋⠙⢷⣞⢻⣿⣿⣀⡀⠈⠤⣀⠬⠟⠀⢀⣠⣶⠿⢛⡽⠋⣠⣾⣏⣠⡿⣃⣞⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⣧⠀⠀⠀⠉⠛⠓⠢⠶⣶⡤⠺⡟⢺⣿⠿⣿⣶⣤⣀⣠⣴⣾⡿⠿⢵⠋⠙⠲⣏⡝⠁⠀⣹⢿⡣⣌⠒⠄⠀
⠀⠀⠀⠀⠀⠀⢸⠈⡄⠀⠇⠀⠀⡖⠁⢢⡞⠀⢰⠻⣆⡏⣇⠙⠻⣿⣿⣿⣿⠋⢀⡴⣪⢷⡀⠀⡘⠀⢀⠜⠁⢀⠟⢆⠑⢄⠀
⠀⠀⠀⠀⠀⠀⠘⡄⠱⠀⠸⡀⠄⠳⡀⠀⢳⡀⢰⠀⢸⢇⡟⠑⠦⢈⡉⠁⢼⢠⡏⣴⠟⢙⠇⠀⡇⢠⠃⢀⡴⠁⠀⠘⠀⠈⡆
⠀⠀⠀⠀⠀⠀⠀⠇⠀⠣⠀⡗⢣⡀⠘⢄⠀⢧⠀⢳⡟⠛⠙⣧⣧⣠⣄⣀⣠⢿⣶⠁⠀⠸⡀⠀⠓⠚⢴⣋⣠⠔⠀⠀⠀⠀⠁
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠧⡤⠙⢤⡈⣦⡼⠀⠀⠧⢶⠚⡇⠈⠁⠈⠃⠀⡰⢿⣄⠀⠀⠑⢤⣀⠀⠀⠀⠈⠁⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀"""

OUTPUT_PATH = "assets/icon_ascii.png"
DOT_RADIUS = 6
DOT_SPACING = 3  # space between dots within a cell
CELL_GAP_X = 2   # extra horizontal gap between characters
CELL_GAP_Y = 2   # extra vertical gap between lines
CROP_PADDING = 60


def decode_braille(ch):
    """Decode a braille Unicode character into 4 rows x 2 cols of dots."""
    code = ord(ch) - 0x2800
    if code < 0 or code > 0xFF:
        return [[False]*2 for _ in range(4)]
    # Bit layout:
    # bit 0 = dot1 (row0,col0), bit 3 = dot4 (row0,col1)
    # bit 1 = dot2 (row1,col0), bit 4 = dot5 (row1,col1)
    # bit 2 = dot3 (row2,col0), bit 5 = dot6 (row2,col1)
    # bit 6 = dot7 (row3,col0), bit 7 = dot8 (row3,col1)
    dots = [[False]*2 for _ in range(4)]
    dots[0][0] = bool(code & (1 << 0))
    dots[1][0] = bool(code & (1 << 1))
    dots[2][0] = bool(code & (1 << 2))
    dots[0][1] = bool(code & (1 << 3))
    dots[1][1] = bool(code & (1 << 4))
    dots[2][1] = bool(code & (1 << 5))
    dots[3][0] = bool(code & (1 << 6))
    dots[3][1] = bool(code & (1 << 7))
    return dots


def render():
    lines = ASCII_ART.split("\n")

    d = DOT_RADIUS * 2  # dot diameter
    cell_w = d * 2 + DOT_SPACING + CELL_GAP_X
    cell_h = d * 4 + DOT_SPACING * 3 + CELL_GAP_Y

    max_cols = max(len(line) for line in lines)
    num_rows = len(lines)

    margin = 120
    img_w = max_cols * cell_w + margin * 2
    img_h = num_rows * cell_h + margin * 2

    img = Image.new("RGB", (img_w, img_h), color=(0, 0, 0))
    draw = ImageDraw.Draw(img)

    for row_idx, line in enumerate(lines):
        for col_idx, ch in enumerate(line):
            dots = decode_braille(ch)
            base_x = margin + col_idx * cell_w
            base_y = margin + row_idx * cell_h

            for dr in range(4):
                for dc in range(2):
                    if dots[dr][dc]:
                        cx = base_x + dc * (d + DOT_SPACING) + DOT_RADIUS
                        cy = base_y + dr * (d + DOT_SPACING) + DOT_RADIUS
                        draw.ellipse(
                            [cx - DOT_RADIUS, cy - DOT_RADIUS,
                             cx + DOT_RADIUS, cy + DOT_RADIUS],
                            fill=(255, 255, 255)
                        )

    # Auto-crop to non-black content
    pixels = img.load()
    min_x, min_y, max_x, max_y = img_w, img_h, 0, 0
    for py in range(img_h):
        for px in range(img_w):
            if pixels[px, py] != (0, 0, 0):
                min_x = min(min_x, px)
                min_y = min(min_y, py)
                max_x = max(max_x, px)
                max_y = max(max_y, py)

    min_x = max(0, min_x - CROP_PADDING)
    min_y = max(0, min_y - CROP_PADDING)
    max_x = min(img_w, max_x + CROP_PADDING)
    max_y = min(img_h, max_y + CROP_PADDING)

    cropped = img.crop((min_x, min_y, max_x, max_y))

    # Make square
    cw, ch = cropped.size
    side = max(cw, ch)
    square = Image.new("RGB", (side, side), color=(0, 0, 0))
    square.paste(cropped, ((side - cw) // 2, (side - ch) // 2))

    # Scale to 1024x1024
    final = square.resize((1024, 1024), Image.LANCZOS)
    final.save(OUTPUT_PATH, "PNG")
    print(f"Saved: {OUTPUT_PATH} (1024x1024)")


if __name__ == "__main__":
    render()
