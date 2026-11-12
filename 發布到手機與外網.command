#!/bin/bash
# 一鍵將最新網頁檔案同步發布至 GitHub Pages，讓手機與外網隨時連線使用
set -e
CWD="$(cd "$(dirname "$0")" && pwd)"
cd "$CWD"

echo "=================================================="
echo "  EchoSpeak 雲端同步發布器 (手機與外網專用)"
echo "=================================================="
echo ""

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ 找不到 gh (GitHub CLI)，無法自動同步。"
  read -p "按 Enter 結束..."
  exit 1
fi

/usr/bin/python3 - <<'PYEOF'
import base64
import hashlib
import json
import os
import subprocess
import sys
import time

REPO = "RLamtw/EchoSpeak"
BRANCH = "main"
TARGET_FILES = [
    "index.html",
    "style.css",
    "app.js",
    "reader.html",
    "reader.css",
    "reader_v3.js",
    "book_data_v3.js",
    "book_data_complete.js",
    "apple-touch-icon.png",
    "發布到手機與外網.command",
]

def gh_api(endpoint, method="GET", payload=None):
    cmd = ["gh", "api", endpoint, "-X", method]
    stdin_data = None
    if payload is not None:
        cmd.extend(["--input", "-"])
        stdin_data = json.dumps(payload).encode("utf-8")
    res = subprocess.run(cmd, input=stdin_data, capture_output=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.decode("utf-8", errors="replace"))
    return json.loads(res.stdout.decode("utf-8"))

def git_blob_sha(data):
    header = f"blob {len(data)}\0".encode("utf-8")
    return hashlib.sha1(header + data).hexdigest()

print("🔍 正在比對本地與雲端最新版本...")
ref_info = gh_api(f"repos/{REPO}/git/ref/heads/{BRANCH}")
head_sha = ref_info["object"]["sha"]
commit_info = gh_api(f"repos/{REPO}/git/commits/{head_sha}")
base_tree_sha = commit_info["tree"]["sha"]
tree_info = gh_api(f"repos/{REPO}/git/trees/{base_tree_sha}?recursive=1")
remote_blobs = {
    item["path"]: item["sha"]
    for item in tree_info.get("tree", [])
    if item.get("type") == "blob"
}

tree_updates = []
for path in TARGET_FILES:
    if not os.path.exists(path):
        continue
    with open(path, "rb") as f:
        data = f.read()
    local_sha = git_blob_sha(data)
    if remote_blobs.get(path) == local_sha:
        continue
    print(f"⬆️  上傳更新: {path} ({len(data)} bytes)...")
    blob_res = gh_api(
        f"repos/{REPO}/git/blobs",
        method="POST",
        payload={
            "content": base64.b64encode(data).decode("ascii"),
            "encoding": "base64",
        },
    )
    mode = "100755" if path.endswith(".command") else "100644"
    tree_updates.append({
        "path": path,
        "mode": mode,
        "type": "blob",
        "sha": blob_res["sha"],
    })

if not tree_updates:
    print("✅ 雲端已是最新版本，手機與外網皆可直接使用！")
else:
    new_tree = gh_api(
        f"repos/{REPO}/git/trees",
        method="POST",
        payload={"base_tree": base_tree_sha, "tree": tree_updates},
    )
    msg = f"同步最新 EchoSpeak / 雙語閱讀器更新 ({len(tree_updates)} 個檔案)"
    new_commit = gh_api(
        f"repos/{REPO}/git/commits",
        method="POST",
        payload={
            "message": msg,
            "tree": new_tree["sha"],
            "parents": [head_sha],
        },
    )
    gh_api(
        f"repos/{REPO}/git/refs/heads/{BRANCH}",
        method="PATCH",
        payload={"sha": new_commit["sha"], "force": False},
    )
    print(f"🚀 已提交至 GitHub ({new_commit['sha'][:7]})，正在等待 GitHub Pages 部署...")
    for _ in range(18):
        time.sleep(3)
        pages = gh_api(f"repos/{REPO}/pages")
        if pages.get("status") == "built":
            break
    print("✅ 雲端部署完成！")

print("")
print("📱 手機與外網永久網址：")
print("   主控台：https://rlamtw.github.io/EchoSpeak/")
print("   閱讀器：https://rlamtw.github.io/EchoSpeak/reader.html")
PYEOF

echo ""
echo "=================================================="
if [ -t 0 ]; then
  read -p "完成！按 Enter 關閉視窗..."
fi
