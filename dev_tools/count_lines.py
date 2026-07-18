import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def count():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if step == 167:
                    content = data.get('content', '')
                    lines = content.split('\n')
                    print(f"Total lines in content: {len(lines)}")
                    # print first 15 lines
                    print("--- First 15 lines ---")
                    for l in lines[:15]:
                        print(l)
                    # print middle 15 lines
                    print("--- Middle 15 lines ---")
                    mid = len(lines) // 2
                    for l in lines[mid-7:mid+8]:
                        print(l)
                    # print last 15 lines
                    print("--- Last 15 lines ---")
                    for l in lines[-15:]:
                        print(l)
                    break
            except Exception as e:
                pass

if __name__ == "__main__":
    count()
