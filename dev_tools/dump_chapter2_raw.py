import sys
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
    
    # Dump Chapter 2 pages
    for idx in range(44, 67):
        obj_id, body = page_objects[idx]
        text = extract_text_from_page(pdf_objects, idx, body)
        text = text.replace("sie", "ie")
        print(f"=== PAGE INDEX {idx} (PDF Page {idx + 1}) ===")
        print(text)
        print("=" * 60)

if __name__ == "__main__":
    main()
