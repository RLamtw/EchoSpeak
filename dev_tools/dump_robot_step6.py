import json

robot_log_path = "/Users/rlamtw/.gemini/antigravity/brain/89d6a590-e1d1-4848-8d43-4f56353f7b0a/.system_generated/logs/transcript.jsonl"

def dump_steps():
    with open(robot_log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if 4 <= step <= 7:
                    print(f"\n--- Step {step} keys: {list(data.keys())} ---")
                    print(f"type: {data.get('type')}, source: {data.get('source')}")
                    content = data.get("content", "")
                    print(f"content length: {len(content)}")
                    if content:
                        print(f"content snippet: {content[:300]}")
                    tool_calls = data.get("tool_calls", [])
                    if tool_calls:
                        print(f"tool_calls: {tool_calls}")
            except Exception as e:
                print(e)

if __name__ == "__main__":
    dump_steps()
