import json
import sys

def get_next_batch(limit=10):
    progress_path = "智能朗讀器/raw_data/translation_progress.json"
    
    with open(progress_path, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    batch = []
    found = 0
    for chapter in db["chapters"]:
        for p in chapter["paragraphs"]:
            if not p["zh"].strip():
                batch.append(p)
                found += 1
                if found >= limit:
                    break
        if found >= limit:
            break
            
    print(json.dumps(batch, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    limit = 10
    if len(sys.argv) > 1:
        limit = int(sys.argv[1])
    get_next_batch(limit)
