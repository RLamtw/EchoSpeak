import re

with open("chapter2_raw.txt", "r", encoding="utf-8") as f:
    raw_content = f.read()

pages = raw_content.split("============================================================\n")

def test_page(page_idx):
    page = pages[page_idx]
    # Split header
    parts = page.split("===\n", 1)
    if len(parts) < 2:
        parts = page.split("===", 1)
        if len(parts) < 2:
            return
    body = parts[1]
    lines = body.split('\n')
    print(f"\n--- TESTING PAGE {page_idx} (lines: {len(lines)}) ---")
    
    footnote_started = False
    for i in range(len(lines)):
        line = lines[i].strip()
        if not line:
            continue
        is_fn = False
        is_fn_start = None
        if i > len(lines) * 0.4:
            is_fn_start = re.match(r'^(?:\d+|o\s+\d+|D\s+\d+|D)\s+(?:Vgl\.|Siehe|Lied|EG|DBW|WA|Mt|Mk|Lk|Jn|Joh|Gen|Ex|Ro|Römer|1\.|2\.|3\.|4\.|[A-Z][a-z]+)', line)
            if is_fn_start:
                footnote_started = True
                is_fn = True
        
        # Check if header
        is_header = False
        l_str = line.strip()
        if re.search(r'Der\s+Ruf\s+in\s+die\s+Nachfolge', l_str, re.IGNORECASE) or \
           re.search(r'Der\s+einfältige\s+Gehorsam', l_str, re.IGNORECASE) or \
           re.search(r'Teil\s*1\.', l_str, re.IGNORECASE) or \
           re.search(r'Teil\s*I\.', l_str) or \
           re.match(r'^\d+\s*$', l_str) or \
           re.match(r'^\d+/\d+\s*$', l_str):
            is_header = True
            
        status = "KEEP"
        if footnote_started or is_fn:
            status = "FOOTNOTE"
        elif is_header:
            status = "HEADER"
            
        print(f"Line {i:2d} ({status}): {line[:80]}")
        if is_fn_start:
            print(f"   => Matched footnote start: {is_fn_start.group(0)}")

test_page(0)
test_page(1)
test_page(2)
