import json
import os

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def trace_file_history():
    files_info = {}
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                # We only want to look at steps before 457 (the TTS project steps)
                if step >= 457:
                    continue
                
                # Check tool calls
                tool_calls = data.get("tool_calls", [])
                for tc in tool_calls:
                    name = tc.get("name")
                    args = tc.get("arguments", {})
                    if not args:
                        continue
                    
                    target = args.get("TargetFile", "")
                    if target:
                        filename = os.path.basename(target)
                        if filename in ["index.html", "app.js", "style.css"]:
                            if filename not in files_info:
                                files_info[filename] = []
                            files_info[filename].append((step, name, args))
            except Exception:
                pass
                
    for filename, history in files_info.items():
        print(f"\n--- History for {filename} ({len(history)} events) ---")
        for step, name, args in history[-10:]:  # Print last 10 modifications
            print(f"Step {step}: Tool: {name}")
            if name == "write_to_file":
                print(f"  Overwrite: {args.get('Overwrite')}, Content len: {len(args.get('CodeContent', ''))}")
            elif name == "replace_file_content":
                print(f"  Range: {args.get('StartLine')}-{args.get('EndLine')}, Target len: {len(args.get('TargetContent', ''))}, Replacement len: {len(args.get('ReplacementContent', ''))}")
            elif name == "multi_replace_file_content":
                chunks = args.get("ReplacementChunks", [])
                print(f"  Multi chunks: {len(chunks)}")
                for j, chunk in enumerate(chunks):
                    print(f"    Chunk {j}: lines {chunk.get('StartLine')}-{chunk.get('EndLine')}, target len: {len(chunk.get('TargetContent', ''))}, rep len: {len(chunk.get('ReplacementContent', ''))}")

if __name__ == "__main__":
    trace_file_history()
