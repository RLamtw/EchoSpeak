import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def debug_step23():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if 20 <= step <= 80:
                    tool_calls = data.get("tool_calls", [])
                    for tc in tool_calls:
                        args = tc.get("args", tc.get("arguments", {}))
                        args_str = json.dumps(args)
                        if "style.css" in args_str or tc.get("name") in ["write_to_file", "replace_file_content", "multi_replace_file_content"]:
                            print(f"Step {step}: Tool call {tc.get('name')}, args keys: {list(args.keys())}")
                            if "TargetFile" in args:
                                print(f"  TargetFile: {args.get('TargetFile')}")
                            if "CodeContent" in args:
                                print(f"  CodeContent length: {len(args.get('CodeContent'))}")
                            if "ReplacementContent" in args:
                                print(f"  ReplacementContent length: {len(args.get('ReplacementContent'))}")
            except Exception as e:
                pass

if __name__ == "__main__":
    debug_step23()
