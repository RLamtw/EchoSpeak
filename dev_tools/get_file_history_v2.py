import json
import os
import re

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def clean_arg(val):
    if isinstance(val, str):
        # strip outer quotes if present
        if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
            val = val[1:-1]
        # unescape
        val = val.replace('\\"', '"').replace('\\\\', '\\')
    return val

def trace_file_history():
    files_info = {}
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if step >= 457:
                    # After step 457 is the robot game and current session files
                    continue
                
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    name = tc.get("name")
                    args = tc.get("args", tc.get("arguments", {}))
                    if not args:
                        continue
                    
                    target = clean_arg(args.get("TargetFile", ""))
                    if target:
                        filename = os.path.basename(target)
                        if filename in ["index.html", "app.js", "style.css"]:
                            if filename not in files_info:
                                files_info[filename] = []
                            # clean all string args
                            cleaned_args = {}
                            for k, v in args.items():
                                cleaned_args[k] = clean_arg(v)
                            files_info[filename].append((step, name, cleaned_args))
            except Exception as e:
                pass
                
    for filename, history in files_info.items():
        print(f"\n--- History for {filename} ({len(history)} events) ---")
        for step, name, args in history:
            print(f"Step {step}: Tool: {name}")
            if name == "write_to_file":
                print(f"  Overwrite: {args.get('Overwrite')}, Content len: {len(args.get('CodeContent', ''))}")
            elif name == "replace_file_content":
                print(f"  StartLine: {args.get('StartLine')}, EndLine: {args.get('EndLine')}, Target len: {len(args.get('TargetContent', ''))}, Replacement len: {len(args.get('ReplacementContent', ''))}")
            elif name == "multi_replace_file_content":
                chunks = args.get("ReplacementChunks", [])
                if isinstance(chunks, str):
                    try:
                        chunks = json.loads(chunks)
                    except:
                        pass
                print(f"  Multi chunks: {len(chunks) if isinstance(chunks, list) else 1}")

if __name__ == "__main__":
    trace_file_history()
