import re
import json
from pdf_text_extractor import parse_pdf, extract_text_from_page

# Chapter configuration with page indices (0-indexed)
CHAPTER_CONFIGS = [
    {"id": "ch1", "title": "第一章：重價恩典 (Die teure Gnade)", "pages": range(28, 43)},
    {"id": "ch2", "title": "第二章：跟隨的呼召 (Der Ruf in die Nachfolge)", "pages": range(44, 67)},
    {"id": "ch3", "title": "第三章：單純的順服 (Der einfältige Gehorsam)", "pages": range(68, 76)},
    {"id": "ch4", "title": "第四章：跟隨與十字架 (Die Nachfolge und das Kreuz)", "pages": range(76, 85)},
    {"id": "ch5", "title": "第五章：跟隨與個體 (Die Nachfolge und der Einzelne)", "pages": range(86, 95)},
    {"id": "ch6", "title": "第六章：山上寶訓·八福 (Die Bergpredigt — Matthäus 5)", "pages": range(98, 115)},
    {"id": "ch7", "title": "第七章：山上寶訓·弟兄、仇敵 (Die Bergpredigt — Mt 5 續)", "pages": range(117, 146)},
    {"id": "ch8", "title": "第八章：山上寶訓·隱祕生活 (Die Bergpredigt — Matthäus 6)", "pages": range(149, 174)},
    {"id": "ch9", "title": "第九章：山上寶訓·分別 (Die Bergpredigt — Matthäus 7)", "pages": range(175, 192)},
    {"id": "ch10", "title": "第十章：使者 (Die Boten — Matthäus 10)", "pages": range(192, 211)},
    {"id": "ch11", "title": "第十一章：前置問題 (Teil II — Vorfragen)", "pages": range(214, 218)},
    {"id": "ch12", "title": "第十二章：洗禮 (Die Taufe)", "pages": range(218, 226)},
    {"id": "ch13", "title": "第十三章：基督的身體 (Der Leib Christi)", "pages": range(226, 254)},
    {"id": "ch14", "title": "第十四章：聖徒 (Die Heiligen)", "pages": range(268, 296)},
    {"id": "ch15", "title": "第十五章：基督的形象 (Das Bild Christi)", "pages": range(296, 303)}
]

def clean_text(text):
    # Fix the ie/sie ligature error
    text = text.replace("sie", "ie")
    return text

def split_into_paragraphs(text):
    paragraphs = []
    # Split by double newlines or large space sequences
    raw_paras = text.split('\n\n')
    for rp in raw_paras:
        cleaned = rp.strip()
        
        # Remove footnotes at bottom of page (like "78 Teil 1. 62" or digit footnotes)
        # We can clean them by filtering out common pattern lines
        lines = cleaned.split('\n')
        filtered_lines = []
        for line in lines:
            line_strip = line.strip()
            # Skip page headers/footers
            if re.match(r'^\d+\s+Teil\s+I', line_strip) or re.match(r'^Teil\s+I\.\s+\d+', line_strip):
                continue
            if re.match(r'^\d+\s+Teil\s+II', line_strip) or re.match(r'^Teil\s+II\.\s+\d+', line_strip):
                continue
            if re.match(r'^\d+\s+Die\s+Bergpredigt', line_strip) or re.match(r'^Die\s+Bergpredigt\s+\d+', line_strip):
                continue
            # Skip pure footnote indicator lines at the bottom
            if re.match(r'^\d+\s+Vgl\.', line_strip) or re.match(r'^o\s+\d+', line_strip):
                continue
            filtered_lines.append(line)
        
        cleaned = '\n'.join(filtered_lines).strip()
        
        # Remove hyphenation at the end of lines
        cleaned = re.sub(r'(\w+)-\n(\w+)', r'\1\2', cleaned)
        cleaned = re.sub(r'(\w+)-\r?\n(\w+)', r'\1\2', cleaned)
        # Replace single newlines with spaces
        cleaned = re.sub(r'\s*\n\s*', ' ', cleaned)
        
        if len(cleaned) > 30: # Ignore tiny remnants
            paragraphs.append(cleaned)
    return paragraphs

def main():
    pdf_path = "智能朗讀器/raw_data/dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    print("Loading and parsing PDF...")
    pdf_objects = parse_pdf(pdf_path)
    
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    print(f"Total pages parsed: {len(page_objects)}")
    
    output_chapters = []
    
    for cfg in CHAPTER_CONFIGS:
        print(f"Extracting {cfg['title']}...")
        chapter_text = []
        for p_idx in cfg["pages"]:
            if p_idx >= len(page_objects):
                break
            obj_id, body = page_objects[p_idx]
            try:
                text = extract_text_from_page(pdf_objects, p_idx, body)
                chapter_text.append(text)
            except Exception as e:
                print(f"  Error on page index {p_idx}: {e}")
        
        full_text = "\n".join(chapter_text)
        cleaned = clean_text(full_text)
        raw_paragraphs = split_into_paragraphs(cleaned)
        
        paras_json = []
        for idx, p_text in enumerate(raw_paragraphs):
            paras_json.append({
                "id": f"{cfg['id']}-p{idx+1}",
                "de": p_text,
                "zh": "" # To be filled by translation
            })
            
        output_chapters.append({
            "id": cfg["id"],
            "title": cfg["title"],
            "paragraphs": paras_json
        })
        print(f"  Extracted {len(paras_json)} paragraphs.")
        
    result = {
        "title": "跟隨基督 (Nachfolge)",
        "author": "迪特里希·潘霍華 (Dietrich Bonhoeffer)",
        "chapters": output_chapters
    }
    
    output_path = "智能朗讀器/raw_data/german_chapters.json"
    with open(output_path, "w", encoding="utf-8") as out_f:
        json.dump(result, out_f, ensure_ascii=False, indent=2)
    print(f"Successfully saved all chapters to {output_path}")

if __name__ == "__main__":
    main()
