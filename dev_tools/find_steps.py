import json
import re
import os

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def find_tts_files():
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    print(f"Total steps in log: {len(lines)}")
    
    # We want to search for tool_calls that call write_to_file or replace_file_content, 
    # or view_file outputs that show files from the previous conversation.
    # Let's inspect each line in reverse order.
    
    for i, line in enumerate(reversed(lines)):
        orig_idx = len(lines) - 1 - i
        try:
            data = json.loads(line)
            step_idx = data.get("step_index", orig_idx)
            
            # Check tool_calls in this step
            tool_calls = data.get("tool_calls", [])
            for tc in tool_calls:
                func_name = tc.get("name")
                args = tc.get("arguments", {})
                if not args:
                    continue
                
                # Check write_to_file or replace_file_content or multi_replace_file_content
                target_file = args.get("TargetFile", "")
                if not target_file:
                    continue
                
                filename = os.path.basename(target_file)
                if filename in ["index.html", "app.js", "style.css"]:
                    # Check if this is from the TTS project
                    # Since the robot game files are also index.html etc., 
                    # let's look at the content.
                    code_content = args.get("CodeContent", "") or args.get("ReplacementContent", "")
                    if not code_content:
                        # might be in multiple replacement chunks
                        chunks = args.get("ReplacementChunks", [])
                        if chunks:
                            code_content = "\n".join([c.get("ReplacementContent", "") for c in chunks])
                    
                    # We can print some metadata to identify it
                    snippet = code_content[:200].replace('\n', ' ')
                    print(f"Step {step_idx}: Tool Call {func_name} on {target_file}, len: {len(code_content)}, snippet: {snippet}")
            
            # Also check content of view_file tool output
            content = data.get("content", "")
            if content and "File Path:" in content:
                # This could be a tool response or a step output
                # Let's print information about it
                # Extract file path from content
                path_match = re.search(r'File Path:\s*`file://(.*?)`', content)
                if path_match:
                    filepath = path_match.group(1)
                    filename = os.path.basename(filepath)
                    if filename in ["index.html", "app.js", "style.css"]:
                        snippet = content[:300].replace('\n', ' ')
                        print(f"Step {step_idx}: View output for {filename}, len: {len(content)}, snippet: {snippet}")
                        
        except Exception as e:
            # print(f"Error parsing line {orig_idx}: {e}")
            pass

if __name__ == "__main__":
    find_tts_files()
