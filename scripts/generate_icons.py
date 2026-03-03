"""
Generate all Tauri app icon sizes from the rendered ASCII art icon.
Includes all sizes required for macOS ICNS bundling.
"""

from PIL import Image
import os

SOURCE = "assets/icon_ascii.png"
ICON_DIR = "src-tauri/icons"

# All sizes needed for macOS ICNS + Windows ICO
PNG_SIZES = {
    "32x32.png": 32,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
}

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def generate():
    src = Image.open(SOURCE).convert("RGBA")
    print(f"Source: {src.size[0]}x{src.size[1]}")

    for filename, size in PNG_SIZES.items():
        resized = src.resize((size, size), Image.LANCZOS)
        resized.save(os.path.join(ICON_DIR, filename), "PNG")
        print(f"  {filename} ({size}x{size})")

    # icon.ico — multi-size
    ico_images = [src.resize((s, s), Image.LANCZOS) for s in ICO_SIZES]
    ico_images[0].save(
        os.path.join(ICON_DIR, "icon.ico"),
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=ico_images[1:]
    )
    print(f"  icon.ico ({', '.join(str(s) for s in ICO_SIZES)})")

    print("Done!")


if __name__ == "__main__":
    generate()
