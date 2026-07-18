def truncate_file(path, line_count):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        lines = f.readlines()
    
    cleaned_lines = lines[:line_count]
    
    # Ensure it ends with exactly one newline
    content = "".join(cleaned_lines).rstrip() + "\n"
    
    with open(path, 'w', encoding='utf-8') as out:
        out.write(content)
        
    print(f"Truncated {path} to {line_count} lines. New length: {len(content)}")

if __name__ == "__main__":
    truncate_file("/Volumes/Photos/AI Studio/智能朗讀器/app.js", 1985)
    truncate_file("/Volumes/Photos/AI Studio/智能朗讀器/style.css", 1261)
