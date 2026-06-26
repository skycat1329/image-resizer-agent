import os
import subprocess
from PIL import Image

def run_test():
    print("[*] Creating a temporary test image...")
    test_dir = "test_run"
    if not os.path.exists(test_dir):
        os.makedirs(test_dir)
        
    img_path = os.path.join(test_dir, "test_landscape.png")
    # Create a 1000x800 light blue image
    img = Image.new("RGB", (1000, 800), "#3498db")
    img.save(img_path)
    print(f"[+] Created test image: {img_path} (1000x800)")

    print("[*] Running resize_agent.py on test_run folder...")
    result = subprocess.run(
        ["python", "resize_agent.py", test_run_path := os.path.abspath(test_dir), "--mode", "cover"],
        capture_output=True,
        text=True
    )
    print(result.stdout)
    if result.stderr:
        print("Errors:")
        print(result.stderr)

    output_file = os.path.join(test_dir, "resized_600x600", "test_landscape.png")
    if os.path.exists(output_file):
        with Image.open(output_file) as resized_img:
            w, h = resized_img.size
            print(f"[+] Output image dimensions: {w}x{h}")
            if w == 600 and h == 600:
                print("[SUCCESS] Image converted to 600x600 px perfectly!")
                return True
    print("[FAIL] Output image was not found or was incorrect size.")
    return False

if __name__ == "__main__":
    run_test()
