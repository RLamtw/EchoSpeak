import json
import re
import os

def repair():
    # 1. Run initialize_progress logic to get fresh clean template
    # Instead of running initialize_progress.py as a subprocess, we can import it or just call its main logic
    # But wait, it's easier to just import it since it's in dev_tools/
    import sys
    sys.path.append('智能朗讀器/dev_tools')
    import initialize_progress
    
    # Run the main generator logic of initialize_progress to build output_chapters
    # We will temporarily mock the output path so it doesn't overwrite anything yet
    pdf_path = "智能朗讀器/raw_data/dietrich-bonhoeffer-werke-band-4-nachfolge-9783641106867_compress.pdf"
    pdf_objects = initialize_progress.parse_pdf(pdf_path)
    
    page_objects = []
    for obj_id, body in pdf_objects.items():
        if b'/Type/Page' in body or b'/Type /Page' in body:
            if b'/Type/Pages' not in body and b'/Type /Pages' not in body:
                page_objects.append((obj_id, body))
    page_objects.sort(key=lambda x: x[0])
    
    output_chapters = []
    for cfg in initialize_progress.CHAPTER_CONFIGS:
        chapter_text = []
        for p_idx in cfg["pages"]:
            if p_idx >= len(page_objects):
                break
            obj_id, body = page_objects[p_idx]
            try:
                text = initialize_progress.extract_text_from_page(pdf_objects, p_idx, body)
                chapter_text.append(text)
            except Exception as e:
                print(f"Error page index {p_idx}: {e}")
        
        full_text = "\n".join(chapter_text)
        cleaned = initialize_progress.clean_text(full_text)
        raw_paragraphs = initialize_progress.split_into_paragraphs(cleaned)
        
        paras_json = []
        for idx, p_text in enumerate(raw_paragraphs):
            paras_json.append({
                "id": f"{cfg['id']}-p{idx+1}",
                "de": p_text,
                "zh": ""
            })
            
        output_chapters.append({
            "id": cfg["id"],
            "title": cfg["title"],
            "paragraphs": paras_json
        })
        print(f"Mapped template {cfg['id']}: {len(paras_json)} paragraphs.")

    # 2. Parse book_data_complete.js to extract existing translations
    complete_js_path = "智能朗讀器/book_data_complete.js"
    with open(complete_js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
    
    # Strip javascript variable wrapper
    # window.bookDataComplete = { ... };
    match = re.search(r'window\.bookDataComplete\s*=\s*(\{.*\});?', js_content, re.DOTALL)
    if not match:
        raise Exception("Could not parse book_data_complete.js structure")
    
    s = match.group(1)
    # Use ast.literal_eval to parse since it natively supports JS hex escapes like \xad and unquoted keys
    import ast
    # Wrap keys in double quotes and convert js syntax to python if needed (though not needed here)
    # Actually literal_eval natively supports dicts with string keys, but they must be quoted.
    # Our regex wrapper is still good to ensure keys are quoted, but let's change keys to standard strings.
    # ast.literal_eval expects dict keys to be strings.
    s = re.sub(r'(\b)(title|author|chapters|paragraphs|id|de|zh)(\b)\s*:', r'"\2":', s)
    js_data = ast.literal_eval(s)
    
    # Create mapping of id -> zh translation
    translations = {}
    for ch in js_data["chapters"]:
        for p in ch["paragraphs"]:
            if p.get("zh"):
                translations[p["id"]] = p["zh"]
                
    print(f"Loaded {len(translations)} existing translations from book_data_complete.js")

    # 3. Apply translations to the fresh template
    restored_count = 0
    for ch in output_chapters:
        for p in ch["paragraphs"]:
            p_id = p["id"]
            if p_id in translations:
                p["zh"] = translations[p_id]
                restored_count += 1
                
    print(f"Restored {restored_count} translations back to the progress template.")

    # 4. Save progress file
    progress_path = "智能朗讀器/raw_data/translation_progress.json"
    result = {
        "title": "跟隨基督 (Nachfolge) - 完整版",
        "author": "迪特里希·潘霍華 (Dietrich Bonhoeffer)",
        "chapters": output_chapters
    }
    with open(progress_path, "w", encoding="utf-8") as out_f:
        json.dump(result, out_f, ensure_ascii=False, indent=2)
    print(f"Saved progress file successfully to {progress_path}!")

if __name__ == "__main__":
    repair()
