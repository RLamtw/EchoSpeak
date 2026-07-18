import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def dump_steps():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            if idx < 10:
                try:
                    data = json.loads(line)
                    print(f"Step {data.get('step_index')}: type={data.get('type')}, source={data.get('source')}, keys={list(data.keys())}")
                    tool_calls = data.get("tool_calls", [])
                    if tool_calls:
                        print(f"  Tool calls: {tool_calls}")
                except Exception as e:
                    print(f"Error at line {idx}: {e}")
            else:
                break

if __name__ == "__main__":
    dump_steps()
