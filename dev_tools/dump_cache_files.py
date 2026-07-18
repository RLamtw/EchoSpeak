import os

cache_files = [
    "/Users/rlamtw/Library/Caches/Microsoft Edge//Default/Cache/Cache_Data/fb8bbacd59f573c8_0",
    "/Users/rlamtw/Library/Caches/Microsoft Edge//Default/Cache/Cache_Data/468e81bc1e4fae03_0",
    "/Users/rlamtw/Library/Caches/Microsoft Edge//Default/Cache/Cache_Data/e27f77627f6716e8_0"
]

def dump():
    for path in cache_files:
        if not os.path.exists(path):
            print(f"File not found: {path}")
            continue
            
        size = os.path.getsize(path)
        print(f"\n--- Cache File: {path} (size: {size} bytes) ---")
        
        # Read file as binary or text
        try:
            with open(path, 'rb') as f:
                content = f.read()
                
            # Print a snippet of printable characters
            # Edge cache files might contain HTTP response headers followed by content.
            # Let's find common headers like Content-Type
            text_preview = ""
            for byte in content[:500]:
                if 32 <= byte <= 126 or byte in [9, 10, 13]:
                    text_preview += chr(byte)
                else:
                    text_preview += '.'
            print("Start of file text preview:")
            print(text_preview)
            
            # Let's see if we can identify if it's HTML, CSS, or JS
            if b'<!DOCTYPE html>' in content:
                print("-> Identified as index.html candidate!")
                # Find start of <!DOCTYPE html>
                start_idx = content.find(b'<!DOCTYPE html>')
                # Edge cache files might have some footer metadata. Let's find if there is a </html>
                end_idx = content.rfind(b'</html>')
                if end_idx != -1:
                    html_content = content[start_idx:end_idx+7]
                    out_path = "/Volumes/Photos/AI Studio/智能朗讀器/index_recovered.html"
                    with open(out_path, 'wb') as out:
                        out.write(html_content)
                    print(f"   Recovered index.html to {out_path} (len: {len(html_content)})")
                    
            elif b'EchoSpeak CSS Stylesheet' in content or b'--bg-app' in content:
                print("-> Identified as style.css candidate!")
                # Find start of CSS content (usually starts with /* === or @charset or :root)
                start_idx = content.find(b'/* ==============================')
                if start_idx == -1:
                    start_idx = content.find(b':root')
                
                # Search for some end markers or just copy everything
                # Let's look for common last rules or copy up to the end of the file or up to cache metadata
                # Edge cache metadata usually starts from the end of the file.
                # Let's write the text starting from start_idx up to a reasonable point.
                # We can write the whole text after start_idx and inspect it.
                css_content = content[start_idx:]
                # Trim trailing binary metadata if any (usually starts with 0x00 or special bytes)
                # Let's just write it out for inspection
                out_path = "/Volumes/Photos/AI Studio/智能朗讀器/style_recovered.css"
                with open(out_path, 'wb') as out:
                    out.write(css_content)
                print(f"   Recovered style.css to {out_path} (len: {len(css_content)})")
                
            elif b'class SpeechController' in content or b'window.speechSynthesis' in content or b'class Visualizer' in content:
                print("-> Identified as app.js candidate!")
                start_idx = content.find(b'/* ===')
                if start_idx == -1:
                    start_idx = content.find(b'class')
                if start_idx == -1:
                    start_idx = content.find(b'const')
                
                js_content = content[start_idx:]
                out_path = "/Volumes/Photos/AI Studio/智能朗讀器/app_recovered.js"
                with open(out_path, 'wb') as out:
                    out.write(js_content)
                print(f"   Recovered app.js to {out_path} (len: {len(js_content)})")
                
        except Exception as e:
            print(f"Error reading {path}: {e}")

if __name__ == "__main__":
    dump()
