#!/usr/bin/env python3
import os
import sys
import argparse
from PIL import Image

def resize_images(input_dir, mode="cover", pad_color="#ffffff", output_format=None, quality=90):
    """
    Resizes all images in input_dir to exactly 600x600 pixels.
    Saves them in a subfolder called 'resized_600x600'.
    """
    output_dir = os.path.join(input_dir, "resized_600x600")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    supported_extensions = ('.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif')
    files_to_process = []

    for root, dirs, files in os.walk(input_dir):
        # Prevent going into the output directory recursively
        if "resized_600x600" in dirs:
            dirs.remove("resized_600x600")
            
        for file in files:
            if file.lower().endswith(supported_extensions):
                files_to_process.append(os.path.join(root, file))

    if not files_to_process:
        print("[-] No supported images found in the directory.")
        return

    print(f"[*] Found {len(files_to_process)} images. Starting batch resize to 600x600 px...")
    print(f"[*] Output directory: {output_dir}\n")

    target_size = (600, 600)
    success_count = 0
    error_count = 0

    for idx, filepath in enumerate(files_to_process, 1):
        filename = os.path.basename(filepath)
        print(f"[{idx}/{len(files_to_process)}] Processing {filename}... ", end="", flush=True)

        try:
            with Image.open(filepath) as img:
                # Store original dimensions
                orig_w, orig_h = img.size
                
                # Create a blank square image of target size
                if mode == "contain":
                    # Hex string color parsing
                    fill_rgb = tuple(int(pad_color.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
                    new_img = Image.new("RGBA" if img.mode == "RGBA" else "RGB", target_size, fill_rgb)
                    
                    # Compute containing dimensions preserving aspect ratio
                    ratio = min(600 / orig_w, 600 / orig_h)
                    new_w = int(orig_w * ratio)
                    new_h = int(orig_h * ratio)
                    
                    resized_sub = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                    x = (600 - new_w) // 2
                    y = (600 - new_h) // 2
                    new_img.paste(resized_sub, (x, y))
                elif mode == "cover":
                    # Compute covering dimensions and crop
                    ratio = max(600 / orig_w, 600 / orig_h)
                    new_w = int(orig_w * ratio)
                    new_h = int(orig_h * ratio)
                    
                    resized_sub = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                    x = (new_w - 600) // 2
                    y = (new_h - 600) // 2
                    new_img = resized_sub.crop((x, y, x + 600, y + 600))
                else: # stretch
                    new_img = img.resize(target_size, Image.Resampling.LANCZOS)

                # Convert mode if target format requires it (e.g. RGB for JPEG)
                out_ext = output_format if output_format else os.path.splitext(filename)[1].lower().replace('.', '')
                if out_ext in ['jpg', 'jpeg'] and new_img.mode == "RGBA":
                    new_img = new_img.convert("RGB")

                # Build output filename
                base_name = os.path.splitext(filename)[0]
                save_filename = f"{base_name}.{out_ext}"
                save_path = os.path.join(output_dir, save_filename)

                # Save
                if out_ext in ['jpg', 'jpeg']:
                    new_img.save(save_path, "JPEG", quality=quality)
                elif out_ext == 'webp':
                    new_img.save(save_path, "WEBP", quality=quality)
                else:
                    new_img.save(save_path)

                print(f"Success ({orig_w}x{orig_h} -> 600x600)")
                success_count += 1

        except Exception as e:
            print(f"Failed: {str(e)}")
            error_count += 1

    print(f"\n[+] Processing finished!")
    print(f"[+] Successfully converted: {success_count}")
    print(f"[+] Failed/Errors: {error_count}")
    print(f"[+] Resized files saved to: {output_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Batch resize directory images to exactly 600x600 pixels.")
    parser.add_argument("directory", type=str, help="Path to the directory containing images")
    parser.add_argument("--mode", type=str, choices=["cover", "contain", "stretch"], default="cover",
                        help="Fitting mode for aspect ratio (default: cover)")
    parser.add_argument("--pad-color", type=str, default="#ffffff",
                        help="Hex color for contain padding (default: #ffffff)")
    parser.add_argument("--format", type=str, choices=["png", "jpg", "jpeg", "webp"], default=None,
                        help="Force output image format (default: keep original)")
    parser.add_argument("--quality", type=int, default=90,
                        help="Compression quality for lossy formats 1-100 (default: 90)")

    args = parser.parse_args()
    
    if not os.path.isdir(args.directory):
        print(f"[-] Error: {args.directory} is not a valid directory.")
        sys.exit(1)

    resize_images(
        args.directory,
        mode=args.mode,
        pad_color=args.pad_color,
        output_format=args.format,
        quality=args.quality
    )
