// EchoSpeak E-Reader Controller (Version 3.3 - OpenAI Neural TTS + IndexedDB Persistent Cache + Sentence Tracking)
document.addEventListener('DOMContentLoaded', () => {
  // Safe Storage wrapper to prevent SecurityError when opened via file:// protocol
  const safeStorage = {
    _memoryStore: {},
    getItem(key) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        return this._memoryStore[key] || null;
      }
    },
    setItem(key, value) {
      try {
        window.localStorage.setItem(key, String(value));
      } catch (e) {
        this._memoryStore[key] = String(value);
      }
    }
  };

  const synth = window.speechSynthesis;

  // --- IndexedDB Persistent Audio Cache (Zero-Cost Replay for OpenAI TTS) ---
  const DB_NAME = 'EchoReaderAudioCache';
  const DB_VERSION = 1;
  const STORE_NAME = 'tts_blobs';
  let dbPromise = null;
  const memoryBlobCache = new Map();
  const inFlightRequests = new Map();

  function openAudioCacheDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function hashText(str) {
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  function makeCacheKey(model, voice, cleanText) {
    return `openai:${model}:${voice}:${cleanText.length}:${hashText(cleanText)}`;
  }

  async function getCachedBlob(key) {
    if (memoryBlobCache.has(key)) {
      return memoryBlobCache.get(key);
    }
    const db = await openAudioCacheDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          if (req.result && req.result.blob) {
            memoryBlobCache.set(key, req.result.blob);
            resolve(req.result.blob);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function saveCachedBlob(key, blob, charCount) {
    memoryBlobCache.set(key, blob);
    const db = await openAudioCacheDB();
    if (!db) {
      updateCacheStatsUI();
      return;
    }
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          key,
          blob,
          charCount: charCount || 0,
          createdAt: Date.now()
        });
        tx.oncomplete = () => {
          updateCacheStatsUI();
          resolve();
        };
        tx.onerror = () => resolve();
      } catch (e) {
        resolve();
      }
    });
  }

  async function clearAudioCache() {
    memoryBlobCache.clear();
    const db = await openAudioCacheDB();
    if (db) {
      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          tx.objectStore(STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch (e) {
          resolve();
        }
      });
    }
    updateCacheStatsUI();
  }

  async function updateCacheStatsUI() {
    if (!cacheStatsText) return;
    let count = memoryBlobCache.size;
    const db = await openAudioCacheDB();
    if (db) {
      count = await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).count();
          req.onsuccess = () => resolve(req.result || 0);
          req.onerror = () => resolve(memoryBlobCache.size);
        } catch (e) {
          resolve(memoryBlobCache.size);
        }
      });
    }
    cacheStatsText.textContent = `⚡ 已永久快取 ${count} 段 (重播 $0)`;
  }

  // Predefined OpenAI Neural Voices
  const OPENAI_VOICES = [
    { id: 'onyx', labelZh: 'Onyx (沉穩神學男聲)', labelDe: 'Onyx (德國深沉男聲)' },
    { id: 'nova', labelZh: 'Nova (溫柔清晰女聲)', labelDe: 'Nova (德國自然女聲)' },
    { id: 'alloy', labelZh: 'Alloy (均衡流暢中性)', labelDe: 'Alloy (德國標準中性)' },
    { id: 'fable', labelZh: 'Fable (敘事說書男聲)', labelDe: 'Fable (德國敘事男聲)' },
    { id: 'echo', labelZh: 'Echo (溫暖柔和男聲)', labelDe: 'Echo (德國溫和男聲)' },
    { id: 'shimmer', labelZh: 'Shimmer (細膩柔和女聲)', labelDe: 'Shimmer (德國細膩女聲)' }
  ];

  // State
  let currentEngine = 'local'; // 'local' or 'openai'
  let openaiModel = 'tts-1';
  let selectedOpenaiZhVoice = 'nova';
  let selectedOpenaiDeVoice = 'onyx';

  let currentChapterId = 'ch1';
  let activeParagraphId = null;
  let currentPlayingLang = 'zh'; // 'zh' or 'de'
  let currentSentenceIndex = 0;
  let activeSentenceQueue = [];

  let isPlaying = false;
  let isPaused = false;
  let currentUtterance = null;
  let currentApiAudio = null;
  let currentApiAudioUrl = null;
  let currentApiBlob = null;
  let playbackSessionId = 0; // Prevents async race conditions on cancel/switch
  let autoplayTimer = null;
  let keepAliveTimer = null;

  let autoplayEnabled = true;
  let skipNotesEnabled = true;
  let readMode = 'single'; // 'single', 'de-zh', 'zh-de'
  let speedRate = 1.0;
  let volumeLevel = 1.0;
  let currentViewMode = 'bilingual';
  let selectedZhVoice = null;
  let selectedDeVoice = null;

  // Active Database (defaults to window.bookData / Essential version)
  let activeBookData = window.bookData;
  let currentVersion = 'essential'; // 'essential' or 'complete'

  // Novelty / effect voices on macOS/iOS to deprioritize for serious theological reading
  const NOVELTY_VOICE_KEYWORDS = [
    'grandpa', 'grandma', 'reed', 'rocko', 'sandy', 'shelley', 'flo', 'eddy',
    'bells', 'bubbles', 'bad news', 'good news', 'bahh', 'boing', 'cellos',
    'deranged', 'hysterical', 'organ', 'trinoids', 'whisper', 'zarvox',
    'albert', 'fred', 'junior', 'kathy', 'princess', 'ralph', 'superstar', 'wobble', 'jester'
  ];

  // UI Elements
  const bookTitleEl = document.getElementById('book-title');
  const bookAuthorEl = document.getElementById('book-author');
  const chapterListEl = document.getElementById('chapter-list');
  const readingContainer = document.getElementById('reading-container');

  const selectEngine = document.getElementById('select-engine');
  const openaiSettingsGroup = document.getElementById('openai-settings-group');
  const readerOpenaiKey = document.getElementById('reader-openai-key');
  const btnToggleOpenaiKey = document.getElementById('btn-toggle-openai-key');
  const selectOpenaiModel = document.getElementById('select-openai-model');
  const cacheStatsText = document.getElementById('cache-stats-text');
  const btnClearCache = document.getElementById('btn-clear-cache');

  const voiceSelectZh = document.getElementById('voice-select-zh');
  const voiceSelectDe = document.getElementById('voice-select-de');
  const selectReadMode = document.getElementById('select-read-mode');
  const toggleAutoplay = document.getElementById('toggle-autoplay');
  const toggleSkipNotes = document.getElementById('toggle-skip-notes');
  const sliderRate = document.getElementById('slider-rate');
  const valRate = document.getElementById('val-rate');
  const sliderVolume = document.getElementById('slider-volume');
  const valVolume = document.getElementById('val-volume');
  const themeToggle = document.getElementById('theme-toggle');

  const btnPlayingLang = document.getElementById('btn-playing-lang');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnDownloadMp3 = document.getElementById('btn-download-mp3');
  const playIcon = document.getElementById('play-icon');

  const footerTitle = document.getElementById('footer-title');
  const footerChapter = document.getElementById('footer-chapter');
  const footerStatusHint = document.getElementById('footer-status-hint');
  const progressTrack = document.getElementById('progress-track');
  const progressBarFill = document.getElementById('progress-fill');
  const progressTimeCurrent = document.getElementById('progress-time-current');
  const progressTimeTotal = document.getElementById('progress-time-total');

  const viewBtns = document.querySelectorAll('.view-btn[data-mode]');

  // Version Toggle UI Elements
  const versionToggleContainer = document.getElementById('version-toggle-container');
  const btnVerEssential = document.getElementById('btn-ver-essential');
  const btnVerComplete = document.getElementById('btn-ver-complete');

  // Initialize
  initReader();

  function initReader() {
    if (window.lucide) {
      window.lucide.createIcons();
    }

    loadSettings();
    updateEngineUI();
    updateCacheStatsUI();

    // Check saved version choice
    const savedVersion = safeStorage.getItem('bonhoeffer-reader-version') || 'essential';
    setBookVersion(savedVersion);

    // Show version toggle if complete database is loaded
    if (window.bookDataComplete && versionToggleContainer) {
      versionToggleContainer.style.display = 'flex';
      updateVersionToggleUI();
    }

    loadVoices();
    if (synth && synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    bindEvents();
    restoreProgress();
    updateLangBadgeUI();
  }

  function updateEngineUI() {
    if (openaiSettingsGroup) {
      openaiSettingsGroup.style.display = currentEngine === 'openai' ? 'flex' : 'none';
    }
    if (btnDownloadMp3) {
      btnDownloadMp3.style.display = (currentEngine === 'openai' && currentApiBlob) ? 'inline-flex' : 'none';
    }
    if (footerStatusHint) {
      footerStatusHint.textContent = currentEngine === 'openai'
        ? '☁️ OpenAI 智慧快取模式 Ready'
        : '雙語按句追蹤系統 Ready';
    }
    loadVoices();
  }

  function setBookVersion(version) {
    currentVersion = version;
    safeStorage.setItem('bonhoeffer-reader-version', version);

    if (version === 'complete' && window.bookDataComplete) {
      activeBookData = window.bookDataComplete;
    } else {
      activeBookData = window.bookData;
      currentVersion = 'essential';
    }

    if (activeBookData) {
      bookTitleEl.textContent = activeBookData.title;
      bookAuthorEl.textContent = activeBookData.author;
      renderSidebarChapters();

      if (!activeBookData.chapters.some(ch => ch.id === currentChapterId)) {
        currentChapterId = activeBookData.chapters[0].id;
      }
      loadChapter(currentChapterId);
    }
  }

  function updateVersionToggleUI() {
    if (!btnVerEssential || !btnVerComplete) return;
    if (currentVersion === 'complete') {
      btnVerComplete.classList.add('active');
      btnVerEssential.classList.remove('active');
    } else {
      btnVerEssential.classList.add('active');
      btnVerComplete.classList.remove('active');
    }
  }

  function renderSidebarChapters() {
    chapterListEl.innerHTML = '';
    activeBookData.chapters.forEach(ch => {
      const item = document.createElement('div');
      item.className = 'chapter-item';
      item.setAttribute('data-id', ch.id);
      if (ch.id === currentChapterId) {
        item.classList.add('active');
      }

      const titleSpan = document.createElement('span');
      titleSpan.textContent = ch.title.split(' (')[0];

      const badge = document.createElement('span');
      badge.className = 'progress-badge';
      badge.id = `badge-${ch.id}`;
      badge.textContent = '0%';

      item.appendChild(titleSpan);
      item.appendChild(badge);

      item.addEventListener('click', () => {
        if (ch.id !== currentChapterId) {
          stopSpeech();
          document.querySelectorAll('.chapter-item').forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          currentChapterId = ch.id;
          loadChapter(ch.id);
          safeStorage.setItem('bonhoeffer-reader-chapter', ch.id);
        }
        document.body.classList.remove('sidebar-open');
      });

      chapterListEl.appendChild(item);
    });
    updateAllChapterBadges();
  }

  // Split paragraph text into natural sentences for smooth TTS & live tracking
  function splitIntoSentences(text, lang = 'zh') {
    if (!text || !text.trim()) return [];
    if (lang === 'zh') {
      const matches = text.match(/[^。！？；!?;]+[。！？；!?;」』”"）)]*/g);
      return matches ? matches.map(s => s.trim()).filter(Boolean) : [text.trim()];
    } else {
      const protectedText = text
        .replace(/\b(Mt|Mk|Lk|Joh|Röm|Kor|Gal|Eph|Phil|Kol|Thess|Tim|Tit|Hebr|Jak|Petr|Offb|Ps|vgl|Vgl|z\.B|d\.h|u\.a|usw|ca|Anm|Kap|Nr|Bd|hrsg|ed|St|Dr|Prof|M|E|G|B|H|J|F|L|W)\./g, '$1\u0000')
        .replace(/(\d+)\./g, '$1\u0000');
      const rawParts = protectedText.match(/[^.!?]+[.!?]+["”'»)]*|\S[^.!?]*$/g) || [protectedText];
      return rawParts
        .map(s => s.replace(/\u0000/g, '.').trim())
        .filter(Boolean);
    }
  }

  // Clean OCR artifacts, soft hyphens, and optional editorial footnotes before speaking
  function cleanTextForSpeech(rawText, lang = 'zh') {
    if (!rawText) return '';
    let text = rawText
      .replace(/\u00ad\s*/g, '')
      .replace(/\ufffd/g, '')
      .replace(/\s+I\s+/g, ' ');

    if (lang === 'de') {
      text = text
        .replace(/\bie\b/g, 'sie')
        .replace(/\bJ\s+esu\b/g, 'Jesu')
        .replace(/([a-zäöüß])[0-9]+(?=[,.;:!?\s]|$)/gi, '$1')
        .replace(/([.!?])[0-9]+/g, '$1')
        .replace(/hatteS;/g, 'hatte;')
        .replace(/darf!!,/g, 'darf,')
        .replace(/!\s*2\b/g, '');

      if (skipNotesEnabled) {
        text = text
          .replace(/\b[D0]\s*\d+\s+(?:Siehe|Vgl\.|Zitate|Ort|Mt|Mk|Lk|Joh|Im Wort|Das lateinische)[^.!?]*[.!?]/g, ' ')
          .replace(/\(\s*(?:vgl\.|Mt|Mk|Lk|Joh|Röm|Kor|DBW|EG)[^)]*\)/gi, ' ');
      }
    } else if (lang === 'zh') {
      if (skipNotesEnabled) {
        text = text
          .replace(/（註：[^）]*）/g, '')
          .replace(/\(註：[^)]*\)/g, '')
          .replace(/（(?:馬太|馬可|路加|約翰|使徒|羅馬|哥林多|加拉太|以弗所|腓立比|歌羅西|帖撒羅尼迦|提摩太|提多|希伯來|雅各|彼得|猶大|啟示錄|詩篇|創世記|出埃及記)[^）]*）/g, '');
      }
    }

    text = text
      .replace(/——/g, '，')
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }

  function renderParagraphSentences(containerEl, text, lang, paragraphId) {
    containerEl.innerHTML = '';
    const sentences = splitIntoSentences(text, lang);
    sentences.forEach((sentence, sIdx) => {
      const span = document.createElement('span');
      span.className = 'sentence-span';
      span.setAttribute('data-sidx', sIdx);
      span.setAttribute('data-lang', lang);
      span.textContent = sentence + (lang === 'de' ? ' ' : '');
      span.title = lang === 'de' ? '點擊從此句開始朗讀德文' : '點擊從此句開始朗讀中文';

      span.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(paragraphId, lang, sIdx);
      });

      containerEl.appendChild(span);
    });
  }

  function loadChapter(chapterId) {
    currentChapterId = chapterId;
    const chapter = activeBookData.chapters.find(ch => ch.id === chapterId);
    if (!chapter) return;

    readingContainer.innerHTML = '';

    const metaDiv = document.createElement('div');
    metaDiv.className = 'book-meta';

    const h2 = document.createElement('h2');
    h2.textContent = chapter.title;

    const authorSpan = document.createElement('span');
    authorSpan.className = 'author';
    authorSpan.textContent = activeBookData.author;

    metaDiv.appendChild(h2);
    metaDiv.appendChild(authorSpan);
    readingContainer.appendChild(metaDiv);

    if (chapter.paragraphs.length === 0) {
      const noContent = document.createElement('div');
      noContent.className = 'paragraph-card';
      noContent.style.textAlign = 'center';
      noContent.style.padding = '40px 20px';
      noContent.innerHTML = `<p style="color: var(--text-secondary); margin-bottom: 12px;">此章節完整版尚在翻譯中</p>
                            <p style="font-size: 13px; color: var(--accent-color);">請先切換至「精華版」閱讀此章節</p>`;
      readingContainer.appendChild(noContent);
      return;
    }

    chapter.paragraphs.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'paragraph-card';
      card.id = p.id;
      card.setAttribute('data-index', idx);

      const deText = document.createElement('p');
      deText.className = 'text-de';
      renderParagraphSentences(deText, p.de, 'de', p.id);

      const zhText = document.createElement('p');
      zhText.className = 'text-zh';
      renderParagraphSentences(zhText, p.zh, 'zh', p.id);

      card.appendChild(deText);
      card.appendChild(zhText);

      const hoverActions = document.createElement('div');
      hoverActions.className = 'card-hover-actions';

      const btnPlayZh = document.createElement('button');
      btnPlayZh.className = 'action-btn-sm btn-card-zh';
      btnPlayZh.title = '朗讀此段中文';
      btnPlayZh.innerHTML = '<i data-lucide="volume-2" style="width: 13px; height: 13px;"></i><span>中文</span>';
      btnPlayZh.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(p.id, 'zh', 0);
      });

      const btnPlayDe = document.createElement('button');
      btnPlayDe.className = 'action-btn-sm btn-card-de';
      btnPlayDe.title = '朗讀此段德文';
      btnPlayDe.innerHTML = '<i data-lucide="languages" style="width: 13px; height: 13px;"></i><span>德文</span>';
      btnPlayDe.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(p.id, 'de', 0);
      });

      hoverActions.appendChild(btnPlayZh);
      hoverActions.appendChild(btnPlayDe);
      card.appendChild(hoverActions);

      card.addEventListener('click', () => {
        let targetLang = currentPlayingLang;
        if (currentViewMode === 'de') {
          targetLang = 'de';
        } else if (currentViewMode === 'zh') {
          targetLang = 'zh';
        } else if (readMode === 'de-zh') {
          targetLang = 'de';
        } else if (readMode === 'zh-de') {
          targetLang = 'zh';
        }
        playParagraph(p.id, targetLang, 0);
      });

      readingContainer.appendChild(card);
    });

    if (window.lucide) {
      window.lucide.createIcons({ container: readingContainer });
    }

    const progressMap = getProgressMap();
    const chapterKey = `${currentVersion}:${currentChapterId}`;
    if (progressMap[chapterKey] && progressMap[chapterKey].paragraphId) {
      const savedCard = document.getElementById(progressMap[chapterKey].paragraphId);
      if (savedCard) {
        savedCard.classList.add('last-read');
      }
    }

    updateAllChapterBadges();
    updateFooterProgressDisplay();
  }

  function clearSpeechTimersAndEvents() {
    if (autoplayTimer) {
      clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    if (currentUtterance) {
      currentUtterance.onstart = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
      currentUtterance = null;
    }
    if (currentApiAudio) {
      try {
        currentApiAudio.ontimeupdate = null;
        currentApiAudio.onended = null;
        currentApiAudio.onerror = null;
        currentApiAudio.pause();
      } catch (e) {}
      currentApiAudio = null;
    }
    if (currentApiAudioUrl) {
      URL.revokeObjectURL(currentApiAudioUrl);
      currentApiAudioUrl = null;
    }
  }

  function clearSentenceHighlights() {
    document.querySelectorAll('.sentence-span.active-sentence').forEach(el => {
      el.classList.remove('active-sentence');
    });
    document.querySelectorAll('.action-btn-sm.active-lang').forEach(el => {
      el.classList.remove('active-lang');
    });
  }

  function highlightActiveSentence(card, lang, sentenceIndex) {
    clearSentenceHighlights();
    if (!card) return;

    const btnSelector = lang === 'de' ? '.btn-card-de' : '.btn-card-zh';
    const activeBtn = card.querySelector(btnSelector);
    if (activeBtn) activeBtn.classList.add('active-lang');

    const span = card.querySelector(`.sentence-span[data-lang="${lang}"][data-sidx="${sentenceIndex}"]`);
    if (span) {
      span.classList.add('active-sentence');
    }
  }

  function updateLangBadgeUI() {
    if (!btnPlayingLang) return;
    if (readMode === 'de-zh') {
      btnPlayingLang.textContent = currentPlayingLang === 'de' ? '雙語 (德➔中) • 德文' : '雙語 (德➔中) • 中文';
    } else if (readMode === 'zh-de') {
      btnPlayingLang.textContent = currentPlayingLang === 'zh' ? '雙語 (中➔德) • 中文' : '雙語 (中➔德) • 德文';
    } else {
      btnPlayingLang.textContent = currentPlayingLang === 'de' ? '德文朗讀' : '中文朗讀';
    }
  }

  // Fetch or retrieve from IndexedDB cache for OpenAI TTS
  async function getOrSynthesizeOpenAIAudio(cleanText, lang) {
    const voice = lang === 'de' ? selectedOpenaiDeVoice : selectedOpenaiZhVoice;
    const cacheKey = makeCacheKey(openaiModel, voice, cleanText);

    const cached = await getCachedBlob(cacheKey);
    if (cached) {
      return { blob: cached, fromCache: true };
    }

    if (inFlightRequests.has(cacheKey)) {
      const blob = await inFlightRequests.get(cacheKey);
      return { blob, fromCache: true };
    }

    const apiKey = (readerOpenaiKey ? readerOpenaiKey.value.trim() : '') || safeStorage.getItem('tts-openai-key') || '';
    if (!apiKey) {
      throw new Error('請先在左側「朗讀設置」輸入您的 OpenAI API 金鑰！');
    }

    const fetchPromise = (async () => {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: openaiModel,
          input: cleanText,
          voice,
          response_format: 'mp3'
        })
      });

      if (!response.ok) {
        let errMsg = `OpenAI API 錯誤 (${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMsg += `: ${errData.error.message}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      await saveCachedBlob(cacheKey, blob, cleanText.length);
      return blob;
    })();

    inFlightRequests.set(cacheKey, fetchPromise);
    try {
      const blob = await fetchPromise;
      return { blob, fromCache: false };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  }

  // Background prefetch next segment in OpenAI mode when autoplay is enabled
  function prefetchNextOpenAISegment(card, paragraphId, currentLang) {
    if (currentEngine !== 'openai' || !autoplayEnabled) return;

    let nextParaId = null;
    let nextLang = currentLang;

    if (readMode === 'de-zh' && currentLang === 'de') {
      nextParaId = paragraphId;
      nextLang = 'zh';
    } else if (readMode === 'zh-de' && currentLang === 'zh') {
      nextParaId = paragraphId;
      nextLang = 'de';
    } else {
      const nextCard = card ? card.nextElementSibling : null;
      if (nextCard && nextCard.classList.contains('paragraph-card')) {
        nextParaId = nextCard.id;
        nextLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentLang);
      }
    }

    if (!nextParaId) return;
    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter) return;
    const pData = chapter.paragraphs.find(p => p.id === nextParaId);
    if (!pData) return;

    const rawText = nextLang === 'de' ? pData.de : pData.zh;
    const rawSentences = splitIntoSentences(rawText, nextLang);
    const cleanedParagraph = rawSentences
      .map(s => cleanTextForSpeech(s, nextLang))
      .filter(Boolean)
      .join(nextLang === 'de' ? ' ' : '');

    if (cleanedParagraph) {
      getOrSynthesizeOpenAIAudio(cleanedParagraph, nextLang).catch(() => {});
    }
  }

  function playParagraph(id, lang = null, startSentenceIdx = 0) {
    const resolvedLang = lang || (currentViewMode === 'de' ? 'de' : (currentViewMode === 'zh' ? 'zh' : currentPlayingLang));
    currentPlayingLang = resolvedLang;
    updateLangBadgeUI();

    playbackSessionId++;
    const sessionId = playbackSessionId;
    clearSpeechTimersAndEvents();
    if (synth) synth.cancel();

    const card = document.getElementById(id);
    if (!card) return;

    document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    activeParagraphId = id;

    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter) return;
    const pData = chapter.paragraphs.find(p => p.id === id);
    if (!pData) return;

    const rawParagraphText = resolvedLang === 'de' ? pData.de : pData.zh;
    const rawSentences = splitIntoSentences(rawParagraphText, resolvedLang);

    activeSentenceQueue = rawSentences
      .map((origText, idx) => ({
        index: idx,
        origText,
        cleanText: cleanTextForSpeech(origText, resolvedLang)
      }))
      .filter(item => item.cleanText.length > 0);

    if (activeSentenceQueue.length === 0) {
      activeSentenceQueue = [{
        index: 0,
        origText: rawParagraphText,
        cleanText: rawParagraphText
      }];
    }

    let queuePos = activeSentenceQueue.findIndex(item => item.index >= startSentenceIdx);
    if (queuePos === -1) queuePos = 0;

    const index = parseInt(card.getAttribute('data-index'), 10);
    const total = chapter.paragraphs.length;
    const progressPercent = ((index + 1) / total) * 100;
    progressBarFill.style.width = `${progressPercent}%`;
    progressTimeCurrent.textContent = `${index + 1}`;
    progressTimeTotal.textContent = `${total}`;
    footerChapter.textContent = `${chapter.title.split(' (')[0]} - 第 ${index + 1} / ${total} 段 (${resolvedLang === 'de' ? '德文' : '中文'})`;

    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    saveProgress(currentChapterId, id);

    if (currentEngine === 'openai') {
      playParagraphWithOpenAI(sessionId, card, id, resolvedLang, queuePos);
    } else {
      if (btnDownloadMp3) btnDownloadMp3.style.display = 'none';
      speakSentenceInQueue(sessionId, card, id, resolvedLang, queuePos);
    }
  }

  async function playParagraphWithOpenAI(sessionId, card, paragraphId, lang, startQueuePos) {
    const fullCleanText = activeSentenceQueue
      .map(item => item.cleanText)
      .join(lang === 'de' ? ' ' : '');

    // Precompute cumulative character ratios for accurate sentence-level live highlighting
    const totalChars = activeSentenceQueue.reduce((acc, item) => acc + item.cleanText.length, 0) || 1;
    let runningChars = 0;
    const sentenceBounds = activeSentenceQueue.map(item => {
      const startRatio = runningChars / totalChars;
      runningChars += item.cleanText.length;
      const endRatio = runningChars / totalChars;
      return { ...item, startRatio, endRatio };
    });

    footerTitle.textContent = '正在載入 OpenAI 語音...';
    if (footerStatusHint) {
      footerStatusHint.textContent = '☁️ 檢查快取 / 合成語音中...';
    }

    try {
      const { blob, fromCache } = await getOrSynthesizeOpenAIAudio(fullCleanText, lang);
      if (sessionId !== playbackSessionId) return;

      currentApiBlob = blob;
      if (btnDownloadMp3) btnDownloadMp3.style.display = 'inline-flex';
      if (footerStatusHint) {
        footerStatusHint.textContent = fromCache
          ? '⚡ 本地快取播放 (本次 $0)'
          : '☁️ OpenAI 已合成並存入永久快取';
      }

      currentApiAudioUrl = URL.createObjectURL(blob);
      const audio = new Audio(currentApiAudioUrl);
      currentApiAudio = audio;
      audio.playbackRate = speedRate;
      audio.volume = volumeLevel;

      let prefetchedNext = false;
      const initialBound = sentenceBounds[startQueuePos] || sentenceBounds[0];
      currentSentenceIndex = initialBound.index;
      highlightActiveSentence(card, lang, currentSentenceIndex);
      footerTitle.textContent = initialBound.origText.substring(0, 34) + (initialBound.origText.length > 34 ? '...' : '');

      if (startQueuePos > 0 && initialBound.startRatio > 0) {
        const applySeek = () => {
          if (audio.duration && !isNaN(audio.duration)) {
            audio.currentTime = initialBound.startRatio * audio.duration;
          }
        };
        audio.addEventListener('loadedmetadata', applySeek, { once: true });
      }

      audio.ontimeupdate = () => {
        if (sessionId !== playbackSessionId || !audio.duration || isNaN(audio.duration)) return;
        const ratio = audio.currentTime / audio.duration;

        if (!prefetchedNext && ratio > 0.45) {
          prefetchedNext = true;
          prefetchNextOpenAISegment(card, paragraphId, lang);
        }

        const matched = sentenceBounds.find(b => ratio <= b.endRatio) || sentenceBounds[sentenceBounds.length - 1];
        if (matched && matched.index !== currentSentenceIndex) {
          currentSentenceIndex = matched.index;
          highlightActiveSentence(card, lang, currentSentenceIndex);
          footerTitle.textContent = matched.origText.substring(0, 34) + (matched.origText.length > 34 ? '...' : '');
        }
      };

      audio.onended = () => {
        if (sessionId !== playbackSessionId) return;
        handleParagraphFinished(sessionId, card, paragraphId, lang);
      };

      audio.onerror = () => {
        if (sessionId !== playbackSessionId) return;
        isPlaying = false;
        updatePlayerUI();
      };

      isPlaying = true;
      isPaused = false;
      updatePlayerUI();
      await audio.play();
    } catch (err) {
      if (sessionId !== playbackSessionId) return;
      console.error('OpenAI TTS Error:', err);
      isPlaying = false;
      updatePlayerUI();
      footerTitle.textContent = '語音合成失敗';
      if (footerStatusHint) {
        footerStatusHint.textContent = '⚠️ 請檢查 OpenAI 金鑰';
      }
      alert(err.message || 'OpenAI 語音合成失敗，請檢查 API 金鑰與網路連線。');
    }
  }

  function speakSentenceInQueue(sessionId, card, paragraphId, lang, queuePos) {
    if (!synth || sessionId !== playbackSessionId) return;

    if (queuePos >= activeSentenceQueue.length) {
      handleParagraphFinished(sessionId, card, paragraphId, lang);
      return;
    }

    const sentenceItem = activeSentenceQueue[queuePos];
    currentSentenceIndex = sentenceItem.index;

    const utter = new SpeechSynthesisUtterance(sentenceItem.cleanText);
    currentUtterance = utter;
    utter.rate = speedRate;
    utter.volume = volumeLevel;

    if (lang === 'zh') {
      if (selectedZhVoice) {
        utter.voice = selectedZhVoice;
        utter.lang = selectedZhVoice.lang || 'zh-TW';
      } else {
        utter.lang = 'zh-TW';
      }
    } else {
      if (selectedDeVoice) {
        utter.voice = selectedDeVoice;
        utter.lang = selectedDeVoice.lang || 'de-DE';
      } else {
        utter.lang = 'de-DE';
      }
    }

    utter.onstart = () => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = true;
      isPaused = false;
      updatePlayerUI();
      highlightActiveSentence(card, lang, sentenceItem.index);

      const snippet = sentenceItem.origText;
      footerTitle.textContent = snippet.substring(0, 34) + (snippet.length > 34 ? '...' : '');

      if (keepAliveTimer) clearInterval(keepAliveTimer);
      keepAliveTimer = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, 10000);
    };

    utter.onend = () => {
      if (sessionId !== playbackSessionId) return;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      speakSentenceInQueue(sessionId, card, paragraphId, lang, queuePos + 1);
    };

    utter.onerror = (e) => {
      if (sessionId !== playbackSessionId) return;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('TTS Utterance error:', e.error);
        isPlaying = false;
        updatePlayerUI();
      }
    };

    synth.speak(utter);
  }

  function handleParagraphFinished(sessionId, card, paragraphId, finishedLang) {
    if (sessionId !== playbackSessionId) return;

    isPlaying = false;
    clearSentenceHighlights();
    updatePlayerUI();

    if (readMode === 'de-zh' && finishedLang === 'de') {
      autoplayTimer = setTimeout(() => {
        if (sessionId === playbackSessionId) {
          playParagraph(paragraphId, 'zh', 0);
        }
      }, 450);
      return;
    }

    if (readMode === 'zh-de' && finishedLang === 'zh') {
      autoplayTimer = setTimeout(() => {
        if (sessionId === playbackSessionId) {
          playParagraph(paragraphId, 'de', 0);
        }
      }, 450);
      return;
    }

    if (!autoplayEnabled) return;

    const nextParaLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : finishedLang);

    const nextCard = card.nextElementSibling;
    if (nextCard && nextCard.classList.contains('paragraph-card')) {
      autoplayTimer = setTimeout(() => {
        if (sessionId === playbackSessionId) {
          playParagraph(nextCard.id, nextParaLang, 0);
        }
      }, 550);
    } else {
      const chapterIndex = activeBookData.chapters.findIndex(ch => ch.id === currentChapterId);
      if (chapterIndex < activeBookData.chapters.length - 1) {
        const nextChapter = activeBookData.chapters[chapterIndex + 1];
        if (nextChapter.paragraphs && nextChapter.paragraphs.length > 0) {
          currentChapterId = nextChapter.id;
          safeStorage.setItem('bonhoeffer-reader-chapter', nextChapter.id);
          document.querySelectorAll('.chapter-item').forEach(i => i.classList.remove('active'));
          const nextItem = document.querySelector(`.chapter-item[data-id="${nextChapter.id}"]`);
          if (nextItem) nextItem.classList.add('active');
          loadChapter(nextChapter.id);

          autoplayTimer = setTimeout(() => {
            if (sessionId === playbackSessionId) {
              const firstCard = document.querySelector('.paragraph-card');
              if (firstCard && firstCard.id) {
                playParagraph(firstCard.id, nextParaLang, 0);
              }
            }
          }, 750);
        }
      }
    }
  }

  function stopSpeech() {
    playbackSessionId++;
    clearSpeechTimersAndEvents();
    if (synth) synth.cancel();
    isPlaying = false;
    isPaused = false;
    clearSentenceHighlights();
    updatePlayerUI();
  }

  function togglePlayPause() {
    if (!activeParagraphId) {
      const firstCard = document.querySelector('.paragraph-card');
      if (firstCard && firstCard.id) {
        const startLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentPlayingLang);
        playParagraph(firstCard.id, startLang, 0);
      }
      return;
    }

    if (isPlaying) {
      if (isPaused) {
        if (currentEngine === 'openai' && currentApiAudio) {
          currentApiAudio.play().catch(() => {});
        } else if (synth) {
          synth.resume();
        }
        isPaused = false;
        isPlaying = true;
      } else {
        if (currentEngine === 'openai' && currentApiAudio) {
          currentApiAudio.pause();
        } else if (synth) {
          synth.pause();
        }
        isPaused = true;
      }
      updatePlayerUI();
    } else {
      playParagraph(activeParagraphId, currentPlayingLang, currentSentenceIndex);
    }
  }

  function playPrevious() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const prev = card ? card.previousElementSibling : null;
    if (prev && prev.classList.contains('paragraph-card')) {
      const targetLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentPlayingLang);
      playParagraph(prev.id, targetLang, 0);
    }
  }

  function playNext() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const next = card ? card.nextElementSibling : null;
    if (next && next.classList.contains('paragraph-card')) {
      const targetLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentPlayingLang);
      playParagraph(next.id, targetLang, 0);
    }
  }

  function toggleActiveLanguage() {
    const nextLang = currentPlayingLang === 'de' ? 'zh' : 'de';
    currentPlayingLang = nextLang;
    updateLangBadgeUI();
    if (activeParagraphId && (isPlaying || isPaused)) {
      playParagraph(activeParagraphId, nextLang, 0);
    }
  }

  function updatePlayerUI() {
    if (isPlaying && !isPaused) {
      playIcon.setAttribute('data-lucide', 'pause');
    } else {
      playIcon.setAttribute('data-lucide', 'play');
    }
    if (window.lucide) window.lucide.createIcons({ container: btnPlayPause });
  }

  function getProgressMap() {
    try {
      const raw = safeStorage.getItem('bonhoeffer-reader-progress-map');
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveProgress(chapterId, paragraphId) {
    safeStorage.setItem('bonhoeffer-reader-chapter', chapterId);
    safeStorage.setItem('bonhoeffer-reader-paragraph', paragraphId);

    const chapter = activeBookData.chapters.find(ch => ch.id === chapterId);
    if (chapter && chapter.paragraphs.length > 0) {
      const idx = chapter.paragraphs.findIndex(p => p.id === paragraphId);
      if (idx !== -1) {
        const pct = Math.round(((idx + 1) / chapter.paragraphs.length) * 100);
        const map = getProgressMap();
        map[`${currentVersion}:${chapterId}`] = {
          paragraphId,
          index: idx,
          pct
        };
        safeStorage.setItem('bonhoeffer-reader-progress-map', JSON.stringify(map));
      }
    }

    document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('last-read'));
    const card = document.getElementById(paragraphId);
    if (card) card.classList.add('last-read');

    updateAllChapterBadges();
  }

  function updateAllChapterBadges() {
    if (!activeBookData) return;
    const map = getProgressMap();
    const legacyChapter = safeStorage.getItem('bonhoeffer-reader-chapter');
    const legacyPara = safeStorage.getItem('bonhoeffer-reader-paragraph');

    activeBookData.chapters.forEach(ch => {
      const badge = document.getElementById(`badge-${ch.id}`);
      if (!badge) return;

      const key = `${currentVersion}:${ch.id}`;
      if (map[key] && typeof map[key].pct === 'number') {
        badge.textContent = `${map[key].pct}%`;
      } else if (legacyChapter === ch.id && legacyPara && ch.paragraphs.length > 0) {
        const idx = ch.paragraphs.findIndex(p => p.id === legacyPara);
        badge.textContent = idx !== -1 ? `${Math.round(((idx + 1) / ch.paragraphs.length) * 100)}%` : '0%';
      } else {
        badge.textContent = '0%';
      }
    });
  }

  function updateFooterProgressDisplay() {
    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter || chapter.paragraphs.length === 0) {
      progressBarFill.style.width = '0%';
      progressTimeCurrent.textContent = '0';
      progressTimeTotal.textContent = '0';
      return;
    }
    progressTimeTotal.textContent = `${chapter.paragraphs.length}`;
  }

  function restoreProgress() {
    const savedChapter = safeStorage.getItem('bonhoeffer-reader-chapter');
    const savedPara = safeStorage.getItem('bonhoeffer-reader-paragraph');

    if (savedChapter && activeBookData.chapters.some(ch => ch.id === savedChapter)) {
      currentChapterId = savedChapter;
      document.querySelectorAll('.chapter-item').forEach(i => i.classList.remove('active'));
      const item = document.querySelector(`.chapter-item[data-id="${savedChapter}"]`);
      if (item) item.classList.add('active');

      loadChapter(savedChapter);

      if (savedPara) {
        activeParagraphId = savedPara;
        const card = document.getElementById(savedPara);
        if (card) {
          card.classList.add('last-read');
          const index = parseInt(card.getAttribute('data-index'), 10);
          const chapter = activeBookData.chapters.find(ch => ch.id === savedChapter);
          if (chapter && !isNaN(index)) {
            const total = chapter.paragraphs.length;
            progressBarFill.style.width = `${((index + 1) / total) * 100}%`;
            progressTimeCurrent.textContent = `${index + 1}`;
            progressTimeTotal.textContent = `${total}`;
            footerChapter.textContent = `${chapter.title.split(' (')[0]} - 上次讀到第 ${index + 1} 段`;
          }
          setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    }
  }

  function isNoveltyVoice(voice) {
    const lower = voice.name.toLowerCase();
    return NOVELTY_VOICE_KEYWORDS.some(k => lower.includes(k));
  }

  function scoreVoice(voice, targetLang) {
    const name = voice.name.toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;

    if (isNoveltyVoice(voice)) {
      return -100;
    }

    if (name.includes('natural') || name.includes('online')) score += 50;
    if (name.includes('premium') || name.includes('enhanced') || name.includes('siri')) score += 45;
    if (name.includes('google')) score += 30;

    if (targetLang === 'zh') {
      if (lang.includes('tw') || lang.includes('hant')) score += 25;
      else if (lang.includes('cn') || lang.includes('hans')) score += 15;
      if (name.includes('hsiaochen') || name.includes('hsiaoyu') || name.includes('yunjhe')) score += 20;
      if (name.includes('xiaoxiao') || name.includes('yunxi')) score += 18;
      if (name.includes('mei-jia') || name.includes('meijia') || name.includes('美佳')) score += 20;
      if (name.includes('yating') || name.includes('雅婷') || name.includes('tingting') || name.includes('婷婷')) score += 12;
    } else if (targetLang === 'de') {
      if (lang === 'de-de' || lang === 'de_de') score += 25;
      if (name.includes('katja') || name.includes('conrad') || name.includes('amala') || name.includes('killian')) score += 20;
      if (name.includes('anna') || name.includes('helena') || name.includes('martin') || name.includes('markus') || name.includes('petra') || name.includes('yannick')) score += 18;
    }

    return score;
  }

  function formatVoiceLabel(voice, targetLang) {
    const name = voice.name;
    const isEffect = isNoveltyVoice(voice);
    let prefix = '';

    if (name.includes('Mei-Jia') || name.includes('Meijia')) prefix = '美佳 (台灣女聲) - ';
    else if (name.includes('Yating')) prefix = '雅婷 (台灣女聲) - ';
    else if (name.includes('Tingting')) prefix = '婷婷 (國語女聲) - ';
    else if (name.includes('Sinji')) prefix = '仙姬 (粵語女聲) - ';
    else if (name.includes('HsiaoChen')) prefix = '曉臻 (台灣自然女聲) - ';
    else if (name.includes('YunJhe')) prefix = '允哲 (台灣自然男聲) - ';
    else if (name.includes('Xiaoxiao')) prefix = '曉曉 (自然女聲) - ';
    else if (name.includes('Yunxi')) prefix = '雲希 (自然男聲) - ';
    else if (targetLang === 'de' && name.includes('Anna')) prefix = 'Anna (德國標準女聲) - ';
    else if (targetLang === 'de' && name.includes('Markus')) prefix = 'Markus (德國標準男聲) - ';
    else if (targetLang === 'de' && name.includes('Petra')) prefix = 'Petra (德國女聲) - ';
    else if (targetLang === 'de' && name.includes('Yannick')) prefix = 'Yannick (德國男聲) - ';
    else if (targetLang === 'de' && name.includes('Helena')) prefix = 'Helena (德國女聲) - ';
    else if (targetLang === 'de' && name.includes('Martin')) prefix = 'Martin (德國男聲) - ';
    else if (targetLang === 'de' && name.includes('Katja')) prefix = 'Katja (德國自然女聲) - ';
    else if (targetLang === 'de' && name.includes('Conrad')) prefix = 'Conrad (德國自然男聲) - ';

    const effectTag = isEffect ? ' [特效音]' : '';
    return `${prefix}${name} (${voice.lang})${effectTag}`;
  }

  function loadVoices() {
    voiceSelectZh.innerHTML = '';
    voiceSelectDe.innerHTML = '';

    if (currentEngine === 'openai') {
      OPENAI_VOICES.forEach(v => {
        const optZh = document.createElement('option');
        optZh.value = v.id;
        optZh.textContent = `OpenAI ${v.labelZh}`;
        voiceSelectZh.appendChild(optZh);

        const optDe = document.createElement('option');
        optDe.value = v.id;
        optDe.textContent = `OpenAI ${v.labelDe}`;
        voiceSelectDe.appendChild(optDe);
      });
      voiceSelectZh.value = selectedOpenaiZhVoice;
      voiceSelectDe.value = selectedOpenaiDeVoice;
      return;
    }

    if (!synth) return;
    const allVoices = synth.getVoices();
    if (!allVoices || allVoices.length === 0) return;

    const savedZhName = safeStorage.getItem('bonhoeffer-reader-voice-zh');
    const savedDeName = safeStorage.getItem('bonhoeffer-reader-voice-de');

    const zhVoices = allVoices
      .filter(v => {
        const l = (v.lang || '').toLowerCase();
        return l.includes('zh') || l.includes('cmn') || l.includes('yue');
      })
      .sort((a, b) => scoreVoice(b, 'zh') - scoreVoice(a, 'zh'));

    const deVoices = allVoices
      .filter(v => {
        const l = (v.lang || '').toLowerCase();
        return l.startsWith('de');
      })
      .sort((a, b) => scoreVoice(b, 'de') - scoreVoice(a, 'de'));

    if (zhVoices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '系統預設中文';
      opt.value = '';
      voiceSelectZh.appendChild(opt);
    } else {
      zhVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = formatVoiceLabel(v, 'zh');
        voiceSelectZh.appendChild(opt);
      });
      const matchedSavedZh = savedZhName && zhVoices.find(v => v.name === savedZhName);
      selectedZhVoice = matchedSavedZh || zhVoices[0];
      voiceSelectZh.value = selectedZhVoice.name;
    }

    if (deVoices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '系統預設德文';
      opt.value = '';
      voiceSelectDe.appendChild(opt);
    } else {
      deVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = formatVoiceLabel(v, 'de');
        voiceSelectDe.appendChild(opt);
      });
      const matchedSavedDe = savedDeName && deVoices.find(v => v.name === savedDeName);
      selectedDeVoice = matchedSavedDe || deVoices[0];
      voiceSelectDe.value = selectedDeVoice.name;
    }
  }

  function bindEvents() {
    if (selectEngine) {
      selectEngine.addEventListener('change', () => {
        stopSpeech();
        currentEngine = selectEngine.value;
        safeStorage.setItem('bonhoeffer-reader-engine', currentEngine);
        updateEngineUI();
      });
    }

    if (readerOpenaiKey) {
      readerOpenaiKey.addEventListener('input', () => {
        safeStorage.setItem('tts-openai-key', readerOpenaiKey.value.trim());
      });
    }

    if (btnToggleOpenaiKey && readerOpenaiKey) {
      btnToggleOpenaiKey.addEventListener('click', () => {
        const icon = btnToggleOpenaiKey.querySelector('i');
        if (readerOpenaiKey.type === 'password') {
          readerOpenaiKey.type = 'text';
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
        } else {
          readerOpenaiKey.type = 'password';
          if (icon) icon.setAttribute('data-lucide', 'eye');
        }
        if (window.lucide) window.lucide.createIcons({ container: btnToggleOpenaiKey });
      });
    }

    if (selectOpenaiModel) {
      selectOpenaiModel.addEventListener('change', () => {
        openaiModel = selectOpenaiModel.value;
        safeStorage.setItem('bonhoeffer-reader-openai-model', openaiModel);
      });
    }

    if (btnClearCache) {
      btnClearCache.addEventListener('click', async () => {
        if (confirm('確定要清除所有已快取的 OpenAI 語音檔案嗎？')) {
          await clearAudioCache();
        }
      });
    }

    if (btnDownloadMp3) {
      btnDownloadMp3.addEventListener('click', () => {
        if (!currentApiBlob || !activeParagraphId) return;
        const url = URL.createObjectURL(currentApiBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bonhoeffer-${activeParagraphId}-${currentPlayingLang}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    voiceSelectZh.addEventListener('change', () => {
      if (currentEngine === 'openai') {
        selectedOpenaiZhVoice = voiceSelectZh.value;
        safeStorage.setItem('bonhoeffer-reader-openai-voice-zh', selectedOpenaiZhVoice);
      } else {
        const allVoices = synth.getVoices();
        selectedZhVoice = allVoices.find(v => v.name === voiceSelectZh.value) || null;
        if (selectedZhVoice) {
          safeStorage.setItem('bonhoeffer-reader-voice-zh', selectedZhVoice.name);
        }
      }
      if (activeParagraphId && isPlaying && currentPlayingLang === 'zh') {
        playParagraph(activeParagraphId, 'zh', currentSentenceIndex);
      }
    });

    voiceSelectDe.addEventListener('change', () => {
      if (currentEngine === 'openai') {
        selectedOpenaiDeVoice = voiceSelectDe.value;
        safeStorage.setItem('bonhoeffer-reader-openai-voice-de', selectedOpenaiDeVoice);
      } else {
        const allVoices = synth.getVoices();
        selectedDeVoice = allVoices.find(v => v.name === voiceSelectDe.value) || null;
        if (selectedDeVoice) {
          safeStorage.setItem('bonhoeffer-reader-voice-de', selectedDeVoice.name);
        }
      }
      if (activeParagraphId && isPlaying && currentPlayingLang === 'de') {
        playParagraph(activeParagraphId, 'de', currentSentenceIndex);
      }
    });

    if (selectReadMode) {
      selectReadMode.addEventListener('change', () => {
        readMode = selectReadMode.value;
        safeStorage.setItem('bonhoeffer-reader-readmode', readMode);
        updateLangBadgeUI();
      });
    }

    if (toggleSkipNotes) {
      toggleSkipNotes.addEventListener('change', () => {
        skipNotesEnabled = toggleSkipNotes.checked;
        safeStorage.setItem('bonhoeffer-reader-skipnotes', skipNotesEnabled ? 'true' : 'false');
        if (activeParagraphId && isPlaying) {
          playParagraph(activeParagraphId, currentPlayingLang, currentSentenceIndex);
        }
      });
    }

    sliderRate.addEventListener('input', () => {
      speedRate = parseFloat(sliderRate.value);
      valRate.textContent = `${speedRate.toFixed(1)}x`;
      safeStorage.setItem('bonhoeffer-reader-speed', speedRate);

      // In OpenAI mode, adjust HTML5 Audio playbackRate directly without re-fetching!
      if (currentEngine === 'openai' && currentApiAudio) {
        currentApiAudio.playbackRate = speedRate;
      } else if (activeParagraphId && isPlaying) {
        playParagraph(activeParagraphId, currentPlayingLang, currentSentenceIndex);
      }
    });

    if (sliderVolume) {
      sliderVolume.addEventListener('input', () => {
        volumeLevel = parseFloat(sliderVolume.value);
        valVolume.textContent = `${Math.round(volumeLevel * 100)}%`;
        safeStorage.setItem('bonhoeffer-reader-volume', volumeLevel);

        if (currentEngine === 'openai' && currentApiAudio) {
          currentApiAudio.volume = volumeLevel;
        } else if (activeParagraphId && isPlaying) {
          playParagraph(activeParagraphId, currentPlayingLang, currentSentenceIndex);
        }
      });
    }

    toggleAutoplay.addEventListener('change', () => {
      autoplayEnabled = toggleAutoplay.checked;
      safeStorage.setItem('bonhoeffer-reader-autoplay', autoplayEnabled ? 'true' : 'false');
    });

    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        currentViewMode = mode;
        safeStorage.setItem('bonhoeffer-reader-viewmode', mode);
        document.body.classList.remove('view-mode-bilingual', 'view-mode-de', 'view-mode-zh');
        document.body.classList.add(`view-mode-${mode}`);

        if (!isPlaying) {
          if (mode === 'de') currentPlayingLang = 'de';
          else if (mode === 'zh') currentPlayingLang = 'zh';
          updateLangBadgeUI();
        }
      });
    });

    if (btnPlayingLang) {
      btnPlayingLang.addEventListener('click', toggleActiveLanguage);
    }

    btnPlayPause.addEventListener('click', togglePlayPause);
    btnStop.addEventListener('click', stopSpeech);
    btnPrev.addEventListener('click', playPrevious);
    btnNext.addEventListener('click', playNext);

    if (progressTrack) {
      progressTrack.addEventListener('click', (e) => {
        const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
        if (!chapter || chapter.paragraphs.length === 0) return;

        const rect = progressTrack.getBoundingClientRect();
        const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetIndex = Math.min(
          chapter.paragraphs.length - 1,
          Math.floor(clickRatio * chapter.paragraphs.length)
        );
        const targetPara = chapter.paragraphs[targetIndex];
        if (targetPara) {
          playParagraph(targetPara.id, currentPlayingLang, 0);
        }
      });
    }

    document.addEventListener('keydown', (e) => {
      const tag = document.activeElement ? document.activeElement.tagName : '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playPrevious();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playNext();
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        toggleActiveLanguage();
      }
    });

    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      safeStorage.setItem('bonhoeffer-reader-theme', newTheme);
      updateThemeIcon(newTheme);
    });

    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    if (btnSidebarToggle) {
      btnSidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        document.body.classList.toggle('sidebar-open');
      });
    }

    const readerMain = document.querySelector('.reader-main');
    if (readerMain) {
      readerMain.addEventListener('click', () => {
        document.body.classList.remove('sidebar-open');
      });
    }

    if (btnVerEssential && btnVerComplete) {
      btnVerEssential.addEventListener('click', () => {
        if (currentVersion !== 'essential') {
          stopSpeech();
          setBookVersion('essential');
          updateVersionToggleUI();
        }
      });
      btnVerComplete.addEventListener('click', () => {
        if (currentVersion !== 'complete') {
          stopSpeech();
          setBookVersion('complete');
          updateVersionToggleUI();
        }
      });
    }
  }

  function updateThemeIcon(theme) {
    if (theme === 'dark') {
      themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    } else {
      themeToggle.innerHTML = '<i data-lucide="moon"></i>';
    }
    if (window.lucide) window.lucide.createIcons({ container: themeToggle });
  }

  function loadSettings() {
    const savedTheme = safeStorage.getItem('bonhoeffer-reader-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    const savedEngine = safeStorage.getItem('bonhoeffer-reader-engine') || 'local';
    currentEngine = savedEngine;
    if (selectEngine) selectEngine.value = currentEngine;

    const savedOpenaiKey = safeStorage.getItem('tts-openai-key') || '';
    if (readerOpenaiKey) readerOpenaiKey.value = savedOpenaiKey;

    const savedOpenaiModel = safeStorage.getItem('bonhoeffer-reader-openai-model') || 'tts-1';
    openaiModel = savedOpenaiModel;
    if (selectOpenaiModel) selectOpenaiModel.value = openaiModel;

    selectedOpenaiZhVoice = safeStorage.getItem('bonhoeffer-reader-openai-voice-zh') || 'nova';
    selectedOpenaiDeVoice = safeStorage.getItem('bonhoeffer-reader-openai-voice-de') || 'onyx';

    const savedSpeed = safeStorage.getItem('bonhoeffer-reader-speed');
    if (savedSpeed) {
      speedRate = parseFloat(savedSpeed);
      sliderRate.value = speedRate;
      valRate.textContent = `${speedRate.toFixed(1)}x`;
    }

    const savedVolume = safeStorage.getItem('bonhoeffer-reader-volume');
    if (savedVolume && sliderVolume && valVolume) {
      volumeLevel = parseFloat(savedVolume);
      sliderVolume.value = volumeLevel;
      valVolume.textContent = `${Math.round(volumeLevel * 100)}%`;
    }

    const savedAutoplay = safeStorage.getItem('bonhoeffer-reader-autoplay');
    if (savedAutoplay !== null) {
      autoplayEnabled = savedAutoplay === 'true';
      toggleAutoplay.checked = autoplayEnabled;
    }

    const savedSkipNotes = safeStorage.getItem('bonhoeffer-reader-skipnotes');
    if (savedSkipNotes !== null && toggleSkipNotes) {
      skipNotesEnabled = savedSkipNotes === 'true';
      toggleSkipNotes.checked = skipNotesEnabled;
    }

    const savedReadMode = safeStorage.getItem('bonhoeffer-reader-readmode');
    if (savedReadMode && selectReadMode) {
      readMode = savedReadMode;
      selectReadMode.value = savedReadMode;
      if (readMode === 'de-zh') currentPlayingLang = 'de';
      else if (readMode === 'zh-de') currentPlayingLang = 'zh';
    }

    const savedViewMode = safeStorage.getItem('bonhoeffer-reader-viewmode') || 'bilingual';
    currentViewMode = savedViewMode;
    document.body.classList.remove('view-mode-bilingual', 'view-mode-de', 'view-mode-zh');
    document.body.classList.add(`view-mode-${savedViewMode}`);
    if (savedViewMode === 'de') currentPlayingLang = 'de';
    else if (savedViewMode === 'zh') currentPlayingLang = 'zh';

    const activeViewBtn = document.querySelector(`.view-btn[data-mode="${savedViewMode}"]`);
    if (activeViewBtn) {
      viewBtns.forEach(b => b.classList.remove('active'));
      activeViewBtn.classList.add('active');
    }
  }
});
