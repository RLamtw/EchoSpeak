import json

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def debug_style():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            if "style.css" in line:
                try:
                    data = json.loads(line)
                    step = data.get("step_index", idx)
                    if step >= 457:
                        continue
                    
                    tool_calls = data.get("tool_calls", [])
                    for tc in tool_calls:
                        args = tc.get("args", tc.get("arguments", {}))
                        # check if style.css is anywhere in the args
                        args_str = json.dumps(args)
                        if "style.css" in args_str:
                            print(f"Step {step}: Tool call {tc.get('name')} has style.css in args.")
                            # Print args summary
                            for k, v in args.items():
                                val_str = str(v)
                                print(f"  {k}: {val_str[:100]} ... len {len(val_str)}")
                except Exception as e:
                    pass

if __name__ == "__main__":
    debug_style()
