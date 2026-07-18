import re
import json
from pdf_text_extractor import parse_pdf, extract_text_from_page

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
    # Normalize space around J esus
    text = text.replace("J esus", "Jesus")
    text = text.replace("j esus", "jesus")
    text = text.replace("J ünger", "Jünger")
    text = text.replace("J ún-I ger", "Jünger")
    text = text.replace("Giaube", "Glaube")
    text = text.replace("Giauben", "Glauben")
    
    # Normalize common abbreviations so lookbehinds work
    text = re.sub(r'\bd\.\s+h\.', 'd.h.', text)
    text = re.sub(r'\bz\.\s+B\.', 'z.B.', text)
    return text

def split_into_paragraphs(text, target_len=600):
    # Filter page headers/footers
    lines = text.split('\n')
    filtered_lines = []
    for line in lines:
        line_strip = line.strip()
        # Skip headers/footers
        if re.match(r'^\d+\s+Teil\s+I', line_strip) or re.match(r'^Teil\s+I\.\s+\d+', line_strip):
            continue
        if re.match(r'^\d+\s+Teil\s+II', line_strip) or re.match(r'^Teil\s+II\.\s+\d+', line_strip):
            continue
        if re.match(r'^\d+\s+Die\s+Bergpredigt', line_strip) or re.match(r'^Die\s+Bergpredigt\s+\d+', line_strip):
            continue
        if re.match(r'^\d+\s+Vgl\.', line_strip) or re.match(r'^o\s+\d+', line_strip):
            continue
        filtered_lines.append(line)
    
    cleaned_body = ' '.join(filtered_lines).strip()
    cleaned_body = re.sub(r'\s*\n\s*', ' ', cleaned_body)
    cleaned_body = re.sub(r'(\w+)-\s+(\w+)', r'\1\2', cleaned_body) # merge hyphens
    cleaned_body = re.sub(r'\s+', ' ', cleaned_body)
    
    # Split by sentence ending lookbehind
    sentence_end = re.compile(
        r'(?<!\bv\.)(?<!\bB\.)(?<!\bMt\.)(?<!\bMk\.)(?<!\bLk\.)(?<!\bRöm\.)(?<!\bKor\.)(?<!\bGal\.)'
        r'(?<!\bPs\.)(?<!\bJes\.)(?<!\bEph\.)(?<!\bCol\.)(?<!\bHebr\.)(?<!\bVgl\.)(?<!\b1\.)(?<!\b2\.)'
        r'(?<!\b3\.)(?<!\b4\.)(?<!\b5\.)(?<!\b6\.)(?<!\b7\.)(?<!\b8\.)(?<!\b9\.)(?<!\bd\.h\.)'
        r'(?<!\bz\.B\.)(?<!\bca\.)(?<!\bvs\.)(?<!\bDr\.)(?<!\bpp\.)(?<!\bcf\.)(?<!\bGen\.)(?<!\bEx\.)'
        r'(?<!\bLev\.)(?<!\bNum\.)(?<!\bDeut\.)(?<=[.!?])\s+(?=[A-Z\"“])'
    )
    
    sentences = sentence_end.split(cleaned_body)
    sentences = [s.strip() for s in sentences if s.strip()]
    
    paragraphs = []
    current_para = []
    current_len = 0
    for s in sentences:
        current_para.append(s)
        current_len += len(s)
        if current_len >= target_len:
            paragraphs.append(' '.join(current_para))
            current_para = []
            current_len = 0
    if current_para:
        paragraphs.append(' '.join(current_para))
    return paragraphs

def main():
    pdf_path = "智能朗讀器/raw_data/dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    print("Parsing PDF for full paragraph mapping...")
    pdf_objects = parse_pdf(pdf_path)
    
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    output_chapters = []
    
    for cfg in CHAPTER_CONFIGS:
        print(f"Processing {cfg['title']}...")
        chapter_text = []
        for p_idx in cfg["pages"]:
            if p_idx >= len(page_objects):
                break
            obj_id, body = page_objects[p_idx]
            try:
                text = extract_text_from_page(pdf_objects, p_idx, body)
                chapter_text.append(text)
            except Exception as e:
                print(f"  Error page index {p_idx}: {e}")
        
        full_text = "\n".join(chapter_text)
        cleaned = clean_text(full_text)
        raw_paragraphs = split_into_paragraphs(cleaned)
        
        paras_json = []
        for idx, p_text in enumerate(raw_paragraphs):
            paras_json.append({
                "id": f"{cfg['id']}-p{idx+1}",
                "de": p_text,
                "zh": "" # To be filled by translation loop
            })
            
        output_chapters.append({
            "id": cfg["id"],
            "title": cfg["title"],
            "paragraphs": paras_json
        })
        print(f"  Mapped {len(paras_json)} paragraphs.")
        
    result = {
        "title": "跟隨基督 (Nachfolge) - 完整版",
        "author": "迪特里希·潘霍華 (Dietrich Bonhoeffer)",
        "chapters": output_chapters
    }
    
    output_path = "智能朗讀器/raw_data/translation_progress.json"
    with open(output_path, "w", encoding="utf-8") as out_f:
        json.dump(result, out_f, ensure_ascii=False, indent=2)
    print(f"Successfully initialized progress database at {output_path}")

if __name__ == "__main__":
    main()
