import re

def clean_page_text(page_idx, text):
    lines = text.split('\n')
    cleaned_lines = []
    
    is_footnote = [False] * len(lines)
    
    # Scan from top to bottom to find where footnotes start
    footnote_started = False
    for i in range(len(lines)):
        line = lines[i].strip()
        if not line:
            continue
            
        # ONLY check for footnotes if we are in the bottom 60% of the page lines
        if i > len(lines) * 0.4:
            # Allow optional period after footnote digits (e.g. "1. Tim" or "1 Vgl")
            is_fn_start = re.match(r'^(?:\d+\.?|o\s+\d+|D\s+\d+|D)\s+(?:Vgl\.|Siehe|Lied|EG|DBW|WA|Mt|Mk|Lk|Jn|Joh|Gen|Ex|Ro|Römer|1\.|2\.|3\.|4\.|[A-Z][a-z]+)', line)
            if is_fn_start:
                footnote_started = True
            
        if footnote_started:
            is_footnote[i] = True
            
    # Mark lines that are headers or page numbers
    for i, line in enumerate(lines):
        if is_footnote[i]:
            continue
            
        l_str = line.strip()
        if not l_str:
            continue
            
        # Match headers:
        is_header = False
        if re.search(r'Ruf\s+in\s+die\s+Nachfolge', l_str, re.IGNORECASE):
            is_header = True
        elif re.search(r'einfältige\s+Gehorsam', l_str, re.IGNORECASE):
            is_header = True
        elif re.search(r'Nachfolge\s+und\s+das\s+Kreuz', l_str, re.IGNORECASE):
            is_header = True
        elif re.search(r'Teil\s*1\.', l_str, re.IGNORECASE):
            is_header = True
        elif re.search(r'Teil\s*I\.', l_str):
            is_header = True
        elif re.search(r'teure\s+Gnade', l_str, re.IGNORECASE):
            is_header = True
        elif re.match(r'^\d+\s*$', l_str):
            is_header = True
        elif re.match(r'^\d+/\d+\s*$', l_str):
            is_header = True
        # Match page numbers combined with headers, e.g. "33 Dtr Ruf..." or "46 Teil..."
        elif re.match(r'^\d+\s+(?:Dtr|Der|Teil|Ruf|Die|Ein)', l_str, re.IGNORECASE):
            is_header = True
            
        if not is_header:
            cleaned_lines.append(line)
            
    return "\n".join(cleaned_lines)

def main():
    with open("chapter2_raw.txt", "r", encoding="utf-8") as f:
        content = f.read()
        
    pages = content.split("============================================================\n")
    cleaned_pages = []
    
    for page in pages:
        if not page.strip():
            continue
        parts = page.split("===\n", 1)
        if len(parts) < 2:
            parts = page.split("===", 1)
            if len(parts) < 2:
                continue
        header = parts[0] + "==="
        body = parts[1]
        
        m = re.search(r'PAGE INDEX (\d+)', header)
        page_idx = int(m.group(1)) if m else 0
        
        cleaned_body = clean_page_text(page_idx, body)
        cleaned_pages.append(cleaned_body)
        
    full_cleaned_text = "\n".join(cleaned_pages)
    
    # Strip line breaks and replace hyphenations
    full_cleaned_text = re.sub(r'(\w+)-\n(\w+)', r'\1\2', full_cleaned_text)
    full_cleaned_text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', full_cleaned_text)
    full_cleaned_text = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', full_cleaned_text)
    
    with open("chapter2_clean_draft.txt", "w", encoding="utf-8") as outf:
        outf.write(full_cleaned_text)
        
    print("Cleaned draft written to chapter2_clean_draft.txt")

if __name__ == "__main__":
    main()
