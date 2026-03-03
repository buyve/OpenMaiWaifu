"""
Generate all Tauri app icon sizes from the rendered ASCII art icon.
Outputs: icon.png (1024), icon.ico, 128x128.png, 128x128@2x.png, 32x32.png
"""

from PIL import Image
import os

SOURCE = "assets/icon_ascii.png"
ICON_DIR = "src-tauri/icons"

def generate():
    src = Image.open(SOURCE).convert("RGBA")
    print(f"Source: {src.size[0]}x{src.size[1]}")

    # icon.png — 1024x1024 (already this size, but ensure)
    icon_1024 = src.resize((1024, 1024), Image.LANCZOS)
    icon_1024.save(os.path.join(ICON_DIR, "icon.png"), "PNG")
    print("  icon.png (1024x1024)")

    # 128x128@2x.png — 256x256
    icon_256 = src.resize((256, 256), Image.LANCZOS)
    icon_256.save(os.path.join(ICON_DIR, "128x128@2x.png"), "PNG")
    print("  128x128@2x.png (256x256)")

    # 128x128.png
    icon_128 = src.resize((128, 128), Image.LANCZOS)
    icon_128.save(os.path.join(ICON_DIR, "128x128.png"), "PNG")
    print("  128x128.png (128x128)")

    # 32x32.png
    icon_32 = src.resize((32, 32), Image.LANCZOS)
    icon_32.save(os.path.join(ICON_DIR, "32x32.png"), "PNG")
    print("  32x32.png (32x32)")

    # icon.ico — multi-size ICO (16, 32, 48, 64, 128, 256)
    ico_sizes = [16, 32, 48, 64, 128, 256]
    ico_images = [src.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    ico_images[0].save(
        os.path.join(ICON_DIR, "icon.ico"),
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
        append_images=ico_images[1:]
    )
    print(f"  icon.ico ({', '.join(str(s) for s in ico_sizes)})")

    print("Done!")


if __name__ == "__main__":
    generate()
