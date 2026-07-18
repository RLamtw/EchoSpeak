import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def debug_commands():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if 20 <= step <= 80:
                    tool_calls = data.get("tool_calls", [])
                    for tc in tool_calls:
                        if tc.get("name") == "run_command":
                            args = tc.get("args", tc.get("arguments", {}))
                            print(f"Step {step}: run_command: {args.get('CommandLine')}")
            except Exception as e:
                pass

if __name__ == "__main__":
    debug_commands()
