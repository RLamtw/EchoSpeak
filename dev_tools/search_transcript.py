import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def search_text():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            if "提示詞" in line or "prompt" in line.lower():
                try:
                    data = json.loads(line)
                    step = data.get("step_index", idx)
                    content = data.get("content", "")
                    # print type and snippet
                    print(f"Step {step}: Type: {data.get('type')}, Content snippet: {content[:300]}")
                    
                    # If it's a USER_INPUT, print the whole thing
                    if data.get("type") == "USER_INPUT" or data.get("source") == "USER_EXPLICIT":
                        print(f"  --> USER INPUT: {content}")
                except Exception:
                    pass

if __name__ == "__main__":
    search_text()
