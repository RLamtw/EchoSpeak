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
    
    # Chapter 2 is PDF Pages 45 to 67 (indexes 44 to 66)
    chapter_text = []
    for idx in range(44, 67):
        obj_id, body = page_objects[idx]
        text = extract_text_from_page(pdf_objects, idx, body)
        chapter_text.append(text)
        
    full_text = "\n".join(chapter_text)
    
    # Fix the ie/sie ligature error
    full_text = full_text.replace("sie", "ie")
    # Fix common words where "sie" was correct
    # (Since we replaced all 'sie' with 'ie', we need to restore actual 'sie', 'Sie', 'sieht', etc.)
    # Let's write a targeted function to only replace "sie" that are part of ligatures (e.g. dsie -> die, ssie -> sie, wsieder -> wieder)
    # Actually, we can use a more precise correction. Let's see:
    # A systematic error was that 'i' in 'ie' was mapped to 'sie'. So 'ie' was extracted as 'sie'.
    # If the original word was 'die', it became 'dsie'.
    # If the original word was 'sie' (meaning they/she), it became 'ssie'.
    # If the original word was 'wieder', it became 'wsieder'.
    # If the original word was 'liegen', it became 'lsiegen'.
    # If the original word was 'hier', it became 'hsier'.
    # If the original word was 'geschieht', it became 'geschsieht'.
    # So replacing "sie" with "ie" globally makes:
    # dsie -> die (correct)
    # ssie -> sie (correct)
    # wsieder -> wieder (correct)
    # lsiegen -> liegen (correct)
    # hsie -> hie (should be hier? Oh, 'hier' became 'hsier', replacing 'sie' with 'ie' makes 'hier' -> 'hier' is correct!)
    # geschsieht -> geschieht (correct)
    # What about the word 'sie' itself? If it was 'sie' in the PDF, it was extracted as 'ssie' because of the ie combination.
    # Replacing 'sie' with 'ie' in 'ssie' yields 'sie' (correct!).
    # Wait, what if there was an actual 's' followed by 'ie' that did not have the ligature error?
    # Usually in this PDF, the font /C0_1 is used for all main text, so the quirk is 100% systematic.
    # Let's inspect paragraphs.
    
    # Let's split into paragraphs. Paragraphs in the book are separated by double newlines or indentations.
    # Let's split by double newlines and clean up line breaks.
    paragraphs = []
    raw_paras = full_text.split('\n\n')
    for rp in raw_paras:
        cleaned = rp.strip()
        # Remove hyphenation at the end of lines
        cleaned = re.sub(r'(\w+)-\n(\w+)', r'\1\2', cleaned)
        cleaned = re.sub(r'(\w+)-\r?\n(\w+)', r'\1\2', cleaned)
        # Replace single newlines with spaces
        cleaned = re.sub(r'\s*\n\s*', ' ', cleaned)
        if len(cleaned) > 20:
            paragraphs.append(cleaned)
            
    print(f"Extracted {len(paragraphs)} paragraphs for Chapter 2.")
    for i, p in enumerate(paragraphs):
        print(f"--- Para {i+1} ---")
        print(p[:200] + "...")
        
    with open("chapter2_german_raw.txt", "w", encoding="utf-8") as outf:
        outf.write("\n\n".join(paragraphs))

if __name__ == "__main__":
    main()
