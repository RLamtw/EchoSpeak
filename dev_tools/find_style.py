import json
import os

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def find_style():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            if "style.css" in line:
                try:
                    data = json.loads(line)
                    step = data.get("step_index", idx)
                    content = data.get("content", "")
                    
                    # Print metadata
                    tc_names = [tc.get("name") for tc in data.get("tool_calls", [])]
                    print(f"Step {step}: Contains style.css. Tool calls: {tc_names}, content_len: {len(content)}")
                    if content and "Showing lines" in content:
                        print(f"  -> Content has: {content[:100]} ... Showing lines {content.split('Showing lines')[1][:50]}")
                except Exception:
                    pass

if __name__ == "__main__":
    find_style()
