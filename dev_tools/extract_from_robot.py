import json
import os
import re

robot_log_path = "/Users/rlamtw/.gemini/antigravity/brain/89d6a590-e1d1-4848-8d43-4f56353f7b0a/.system_generated/logs/transcript.jsonl"

def search_robot():
    if not os.path.exists(robot_log_path):
        print(f"Log path does not exist: {robot_log_path}")
        return
        
    with open(robot_log_path, 'r', encoding='utf-8') as f:
        for idx, line in enumerate(f):
            try:
                data = json.loads(line)
                step = data.get("step_index", idx)
                content = data.get("content", "")
                
                # If content contains "File Path:" and "AI Studio", print it out
                if "File Path:" in content and "AI Studio" in content:
                    # Find which file it is
                    for name in ["index.html", "app.js", "style.css"]:
                        if name in content:
                            print(f"Step {step} has View output for {name}, length: {len(content)}")
                            # Check if truncated
                            if "truncated" in content:
                                print("  -> Truncated!")
                            else:
                                print("  -> Full/Partial without truncated marker!")
            except Exception as e:
                pass

if __name__ == "__main__":
    search_robot()
