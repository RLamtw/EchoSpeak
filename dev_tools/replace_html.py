with open('/Volumes/Photos/AI Studio/智能朗讀器/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace the entire <dialog id="guide-dialog" ...> ... </dialog> block.
# Let's locate it by finding '<dialog id="guide-dialog"' and the matching '</dialog>'
start_tag = '<dialog id="guide-dialog"'
start_idx = content.find(start_tag)
if start_idx == -1:
    print("Could not find start tag!")
    exit(1)

# Find the next </dialog> tag after start_idx
end_tag = '</dialog>'
end_idx = content.find(end_tag, start_idx)
if end_idx == -1:
    print("Could not find end tag!")
    exit(1)

# Include the closing tag
end_idx += len(end_tag)

new_dialog = """<dialog id="guide-dialog" class="glass-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3><i data-lucide="help-circle" class="modal-icon"></i> EchoSpeak 使用指南與操作捷徑</h3>
        <button id="btn-close-guide" class="btn-icon-sm" aria-label="關閉對話框" style="background:transparent; cursor:pointer;">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="modal-body">
        <div class="guide-grid">
          <!-- Left Column: Voice Setup Guide -->
          <div class="guide-column">
            <h3 class="guide-col-title"><i data-lucide="mic"></i> 免費高品質語音設定</h3>
            
            <div class="guide-card accent-purple">
              <h4>
                <i data-lucide="monitor"></i> 方案 A：Microsoft Edge 瀏覽器
              </h4>
              <p>在 Edge 瀏覽器中開啟本網頁，可以直接在<b>選擇語音角色</b>選單中選用帶有「<b>Online</b>」的語音：</p>
              <ul>
                <li><b>Microsoft Xiaoxiao Online</b> (自然國語女聲)</li>
                <li><b>Microsoft Yunxi Online</b> (自然國語男聲)</li>
                <li>完全免費、語調擬真，且無 5000 字字數限制！</li>
              </ul>
            </div>

            <div class="guide-card accent-pink">
              <h4>
                <i data-lucide="apple"></i> 方案 B：macOS / iOS Siri 高品質語音
              </h4>
              <p>Apple 提供了極為流暢的 Siri 及提升型語音，可在系統中免費下載：</p>
              <ol>
                <li>開啟 Mac 的 <b>「系統設定」</b> ➔ <b>「輔助使用」</b> ➔ <b>「語音內容」</b>。</li>
                <li>在「系統語音」下拉選單中選擇 <b>「管理語音...」</b>。</li>
                <li>下載中文或英文帶有 <b>「Siri」</b> 或 <b>「提升品質 (Premium)」</b> 的語音（例如：美佳-提升品質）。</li>
                <li>重新整理網頁即可在選項中選用。</li>
              </ol>
            </div>

            <div class="guide-card">
              <h4>
                <i data-lucide="chrome"></i> 方案 C：Chrome 瀏覽器線上語音
              </h4>
              <p>當 Chrome 保持網路連線時，會自動載入帶有 <b>Google</b> 標籤的線上語音，同樣比離線系統語音自然許多，可以直接在選單中選用。</p>
            </div>
          </div>

          <!-- Right Column: Shortcuts & Smart Filtering Guide -->
          <div class="guide-column">
            <h3 class="guide-col-title"><i data-lucide="keyboard"></i> 智慧功能與操作捷徑</h3>
            
            <div class="guide-card accent-purple">
              <h4>
                <i data-lucide="navigation"></i> 句子互動跳轉
              </h4>
              <p>在下方「<b>朗讀進度與句子追蹤</b>」面板中，網頁會即時顯示朗讀句子。您可以<b>直接點擊任意句子</b>，播放器會立即跳轉到該句並繼續朗讀，不論是在播放中或停止狀態均支援。</p>
            </div>

            <div class="guide-card">
              <h4>
                <i data-lucide="keyboard"></i> 鍵盤快捷鍵
              </h4>
              <p>支援以下快速操作捷徑，讓您無需頻繁點擊滑鼠：</p>
              <table class="shortcuts-table">
                <tr>
                  <td><kbd>Space</kbd></td>
                  <td>播放 / 暫停朗讀</td>
                </tr>
                <tr>
                  <td><kbd>←</kbd> 或 <kbd>→</kbd></td>
                  <td>非輸入文字狀態下，往上/下一句跳轉</td>
                </tr>
                <tr>
                  <td><kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd></td>
                  <td>輸入狀態下，免滑鼠跨句跳轉</td>
                </tr>
                <tr>
                  <td><kbd>Ctrl/Cmd</kbd> + <kbd>←</kbd> / <kbd>→</kbd></td>
                  <td>輸入狀態下，免滑鼠跨句跳轉 (同 Alt)</td>
                </tr>
              </table>
            </div>

            <div class="guide-card accent-blue">
              <h4>
                <i data-lucide="sparkles"></i> 智慧貼上與剪貼簿過濾
              </h4>
              <p>當您貼上文章或在輸入框中使用 <kbd>Cmd/Ctrl</kbd> + <kbd>V</kbd> 貼上文章時，EchoSpeak 會自動進行 AI 智慧清潔：</p>
              <ul>
                <li><b>超連結簡化</b>：自動將網址（如 <code>https://youtube.com/...</code>）替換成「（YouTube 影片連結）」，防止語音死板地朗讀網址字母。</li>
                <li><b>Markdown 清理</b>：自動去除標題 <code>#</code>、粗體 <code>**</code>、斜體 <code>*</code>、底線 <code>__</code> 等符號，只保留純文字。</li>
                <li><b>雜訊去除</b>：自動過濾 Wikipedia 的引文標籤 <code>[1]</code> 或新聞中常見的 <code>(圖／翻攝自網路)</code> 等媒體說明。</li>
                <li><b>標點優化</b>：將 <code>--</code> 或長分隔線替換為短暫停頓符號，將多個驚嘆號 <code>!!!</code> 簡化為單個，使朗讀語調更自然。</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </dialog>"""

replaced_content = content[:start_idx] + new_dialog + content[end_idx:]

with open('/Volumes/Photos/AI Studio/智能朗讀器/index.html', 'w', encoding='utf-8') as f:
    f.write(replaced_content)

print("Successfully replaced guide-dialog block!")
