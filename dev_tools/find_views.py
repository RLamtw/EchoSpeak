import json
import os
import re

log_path = "/Users/rlamtw/.gemini/antigravity/brain/5768d3af-b971-4ce2-8e6f-1dd4e4d81346/.system_generated/logs/transcript.jsonl"

def find_views():
    with open(log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                if step >= 457:
                    continue
                
                # Check if it is a view_file tool call or its result
                content = data.get("content", "")
                if content and "File Path:" in content:
                    path_match = re.search(r'File Path:\s*`file://(.*?)`', content)
                    if path_match:
                        filepath = path_match.group(1)
                        filename = os.path.basename(filepath)
                        if filename in ["index.html", "app.js", "style.css"]:
                            # Find showing lines range
                            range_match = re.search(r'Showing lines\s*(\d+)\s*to\s*(\d+)', content)
                            lines_str = range_match.group(0) if range_match else "unknown range"
                            total_lines_match = re.search(r'Total Lines:\s*(\d+)', content)
                            total_str = total_lines_match.group(0) if total_lines_match else "unknown total"
                            print(f"Step {step}: View for {filename}, {lines_str}, {total_str}")
            except Exception as e:
                pass

if __name__ == "__main__":
    find_views()
