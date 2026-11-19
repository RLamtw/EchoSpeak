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
    "manifest.webmanifest",
    "book_data_v3.js",
    "book_data_complete.js",
    "audio/essential/manifest.js",
    "apple-touch-icon.png",
    "發布到手機與外網.command",
]

for lang in ("zh", "de"):
    mp3_dir = os.path.join("audio", "essential", lang)
    if os.path.isdir(mp3_dir):
        for fname in sorted(os.listdir(mp3_dir)):
            if fname.endswith(".mp3"):
                TARGET_FILES.append(f"audio/essential/{lang}/{fname}")

def gh_api(endpoint, method="GET", payload=None, retries=3):
    stdin_data = None
    if payload is not None:
        stdin_data = json.dumps(payload).encode("utf-8")
    last_err = ""
    for attempt in range(retries):
        cmd = ["gh", "api", endpoint, "-X", method]
        if payload is not None:
            cmd.extend(["--input", "-"])
        res = subprocess.run(cmd, input=stdin_data, capture_output=True)
        if res.returncode == 0:
            return json.loads(res.stdout.decode("utf-8"))
        last_err = res.stderr.decode("utf-8", errors="replace")
        if attempt < retries - 1:
            time.sleep(2)
    raise RuntimeError(last_err)

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
    target_sha = new_commit["sha"]
    for _ in range(40):
        time.sleep(3)
        build_info = gh_api(f"repos/{REPO}/pages/builds/latest")
        if build_info.get("commit") == target_sha:
            status = build_info.get("status")
            if status == "built":
                print(f"✅ 雲端部署完成！（commit: {target_sha[:7]}）")
                break
            elif status == "errored":
                raise RuntimeError(f"GitHub Pages 建置失敗: {build_info.get('error')}")
    else:
        print(f"⚠️ 等待超時，最新建置狀態：{build_info}")

print("")
print("📱 手機與外網永久網址：")
print("   主控台：https://rlamtw.github.io/EchoSpeak/")
print("   閱讀器：https://rlamtw.github.io/EchoSpeak/reader.html")
PYEOF

echo ""
echo "=================================================="
if [ -t 0 ] && [ "${NO_PAUSE:-0}" != "1" ]; then
  read -p "完成！按 Enter 關閉視窗..."
fi
