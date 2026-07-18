import re
from pdf_text_extractor import parse_pdf, extract_text_from_page

def main():
    pdf_path = "dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    pdf_objects = parse_pdf(pdf_path)
    
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    print(f"Total page objects: {len(page_objects)}")
    
    # Scan ALL pages to find chapter headings
    for idx in range(len(page_objects)):
        obj_id, body = page_objects[idx]
        try:
            text = extract_text_from_page(pdf_objects, idx, body)
        except Exception:
            continue
        
        # Fix ligature
        text = text.replace("sie", "ie")
        
        first_200 = text[:200].strip().replace('\n', ' | ')
        
        # Look for chapter markers - German chapter headings typically start with
        # "Kapitel" or specific section titles or roman numerals
        # The book structure: Part 1 chapters, then Part 2 chapters
        # Known: Ch1 = "Die teure Gnade" (~p34-44), Ch2 = "Der Ruf in die Nachfolge" (~p45-67)
        
        # Print pages that seem to start new sections (short first line, or known keywords)
        keywords = ['Kapitel', 'Nachfolge', 'Gnade', 'Gehorsam', 'Einzelne', 'Seligpreisungen',
                    'Nachfolge und', 'Bruder', 'Feind', 'Verborgene', 'Einfalt', 'Nachfolger',
                    'Bote', 'Kirche', 'Taufe', 'Sünder', 'Heilige', 'Bild',
                    'Erster Teil', 'Zweiter Teil', 'ERSTER', 'ZWEITER',
                    'Die Sichtbarkeit', 'Das Gebet', 'Der Jünger']
        
        found = False
        for kw in keywords:
            if kw.lower() in first_200.lower():
                found = True
                break
        
        if found or len(text.strip()) < 100:
            print(f"PAGE {idx} (PDF p.{idx+1}): {first_200[:150]}")
            print("-" * 60)

if __name__ == "__main__":
    main()
