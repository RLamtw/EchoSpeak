import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def inspect_step():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if step == 167:
                    print(f"Step 167 content length: {len(data.get('content', ''))}")
                    print("First 500 chars:")
                    print(data.get('content', '')[:500])
                    print("Last 500 chars:")
                    print(data.get('content', '')[-500:])
                    break
            except Exception as e:
                pass

if __name__ == "__main__":
    inspect_step()
