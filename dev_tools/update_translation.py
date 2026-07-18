import sys
import json

def update_translation(translations_dict):
    progress_path = "智能朗讀器/raw_data/translation_progress.json"
    
    with open(progress_path, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    updated_count = 0
    for chapter in db["chapters"]:
        for p in chapter["paragraphs"]:
            if p["id"] in translations_dict:
                p["zh"] = translations_dict[p["id"]]
                updated_count += 1
                
    with open(progress_path, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
        
    print(f"Updated {updated_count} paragraphs in progress database.")
    
    # Check total completion
    total = 0
    translated = 0
    for chapter in db["chapters"]:
        for p in chapter["paragraphs"]:
            total += 1
            if p["zh"].strip():
                translated += 1
                
    print(f"Total progress: {translated}/{total} ({translated/total*100:.1f}%)")
    
    # Export to book_data_complete.js
    export_to_js(db)

def export_to_js(db):
    js_content = f"// EchoSpeak E-Reader Complete Bilingual Database\n"
    js_content += f"window.bookDataComplete = {{\n"
    js_content += f"  title: \"{db['title']}\",\n"
    js_content += f"  author: \"{db['author']}\",\n"
    js_content += f"  chapters: [\n"
    
    for ch_idx, chapter in enumerate(db["chapters"]):
        js_content += "    {\n"
        js_content += f"      id: \"{chapter['id']}\",\n"
        js_content += f"      title: \"{chapter['title']}\",\n"
        js_content += "      paragraphs: [\n"
        
        # Only export paragraphs that have translations to avoid empty/broken views
        translated_paras = [p for p in chapter["paragraphs"] if p["zh"].strip()]
        for p_idx, p in enumerate(translated_paras):
            de_esc = p["de"].replace('"', '\\"').replace('\n', '\\n')
            zh_esc = p["zh"].replace('"', '\\"').replace('\n', '\\n')
            js_content += "        {\n"
            js_content += f"          id: \"{p['id']}\",\n"
            js_content += f"          de: \"{de_esc}\",\n"
            js_content += f"          zh: \"{zh_esc}\"\n"
            js_content += "        }"
            if p_idx < len(translated_paras) - 1:
                js_content += ",\n"
            else:
                js_content += "\n"
                
        js_content += "      ]\n"
        js_content += "    }"
        if ch_idx < len(db["chapters"]) - 1:
            js_content += ",\n"
        else:
            js_content += "\n"
            
    js_content += "  ]\n"
    js_content += "};\n"
    
    with open("智能朗讀器/book_data_complete.js", "w", encoding="utf-8") as f:
        f.write(js_content)
    print("Exported complete database to 智能朗讀器/book_data_complete.js")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 update_translation.py <json_string_or_filepath>")
        sys.exit(1)
        
    arg = sys.argv[1]
    try:
        # Check if arg is a file path
        with open(arg, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        # Otherwise parse as direct json string
        data = json.loads(arg)
        
    update_translation(data)
