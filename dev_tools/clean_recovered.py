import os

recovered_files = {
    "index.html": "/Volumes/Photos/AI Studio/智能朗讀器/index_recovered.html",
    "style.css": "/Volumes/Photos/AI Studio/智能朗讀器/style_recovered.css",
    "app.js": "/Volumes/Photos/AI Studio/智能朗讀器/app_recovered.js"
}

def clean_file(name, path):
    if not os.path.exists(path):
        print(f"File not found: {path}")
        return
        
    with open(path, 'rb') as f:
        content = f.read()
        
    print(f"\n--- Inspecting trailing of {name} (len: {len(content)}) ---")
    
    # Print the last 100 bytes as text/repr
    print("Last 150 bytes:")
    print(content[-150:])
    
    # For HTML, we already sliced it from b'<!DOCTYPE html>' to b'</html>'. So index.html is clean!
    # Let's verify.
    if name == "index.html":
        final_content = content
        
    elif name == "style.css":
        # CSS should end with } followed by optional whitespace.
        # Let's find the last } and trim anything after it.
        # Wait, are there any comments at the end? E.g. /* ... */.
        # Let's search for the last valid text byte.
        # Edge cache files usually append metadata.
        # In UTF-8, let's decode to string (ignoring errors) and inspect where the real CSS ends.
        text = content.decode('utf-8', errors='ignore')
        # Find last closing brace or comment
        last_brace = text.rfind('}')
        if last_brace != -1:
            final_content = text[:last_brace+1].encode('utf-8')
        else:
            final_content = content
            
    elif name == "app.js":
        # JS should end with } or ); or similar.
        # Let's decode and find the last logical javascript character
        text = content.decode('utf-8', errors='ignore')
        last_brace = text.rfind('}')
        last_paren = text.rfind(')')
        cutoff = max(last_brace, last_paren)
        if cutoff != -1:
            # Let's check what characters are after it. If there is only whitespace or comments, that's fine.
            # But Edge cache data has binary bytes at the end.
            final_content = text[:cutoff+1].encode('utf-8')
        else:
            final_content = content
            
    # Write cleaned content to the final path in 智能朗讀器 folder
    final_path = f"/Volumes/Photos/AI Studio/智能朗讀器/{name}"
    with open(final_path, 'wb') as out:
        out.write(final_content)
    print(f"Cleaned and saved {name} to {final_path} (len: {len(final_content)})")

if __name__ == "__main__":
    for name, path in recovered_files.items():
        clean_file(name, path)
