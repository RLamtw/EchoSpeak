import sys
import re
from pdf_text_extractor import parse_pdf, extract_text_from_page

def main():
    pdf_path = "dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    pdf_objects = parse_pdf(pdf_path)
    
    # Find page objects
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    print(f"Total page objects: {len(page_objects)}")
    
    # Scan pages 41 to 58
    for idx in range(41, 58):
        if idx >= len(page_objects):
            break
        obj_id, body = page_objects[idx]
        text = extract_text_from_page(pdf_objects, idx, body)
        
        # Clean systematic font ligatures (replace "sie" with "ie" in the extracted German text)
        text = text.replace("sie", "ie")
        # Print a short header and the first few characters to spot chapter beginnings
        first_300 = text[:300].strip().replace('\n', ' ')
        # We look for "Der Ruf in die Nachfolge" or "Nachfolge"
        print(f"PAGE {idx} (PDF Page {idx + 1}): {first_300}")
        print("-" * 40)

if __name__ == "__main__":
    main()
