import json
import os

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
                tool_calls = data.get("tool_calls", [])
                
                # Check for run_command or write_to_file that references mv, cp, backups, or anything related
                for tc in tool_calls:
                    name = tc.get("name")
                    args = tc.get("args", tc.get("arguments", {}))
                    args_str = json.dumps(args)
                    if "backup" in args_str or "cp" in args_str or "mv" in args_str or "index.html" in args_str:
                        print(f"Step {step}: Tool call {name} has references in args.")
                        print(f"  args: {args_str[:200]}")
                        
            except Exception as e:
                pass

if __name__ == "__main__":
    search_robot()
