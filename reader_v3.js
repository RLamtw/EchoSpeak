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
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // 直接使用內嵌 SVG 圖示切換播放／暫停與控制鈕（避免 Lucide 取代 <i> 標籤後無法更新的問題）
  const ICON_PLAY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
  const ICON_PAUSE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4.2" height="16" rx="1.4"/><rect x="13.8" y="4" width="4.2" height="16" rx="1.4"/></svg>';
  const ICON_SUN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';
  const ICON_MOON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  const ICON_EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  const ICON_EYE_OFF_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

  // Persistent DOM-attached HTML5 Audio element for iOS Safari & Lock-Screen background playback compatibility
  const SILENT_WAV_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  const sharedApiAudio = document.getElementById('reader-audio') || new Audio();
  sharedApiAudio.playsInline = true;
  sharedApiAudio.preload = 'auto';
  sharedApiAudio.setAttribute('playsinline', '');
  sharedApiAudio.setAttribute('webkit-playsinline', '');
  let isApiAudioUnlocked = false;

  // 宣告為 iOS 媒體播放會話（支援 iOS 16.4+ 鎖屏與背景播放，並忽略側邊靜音開關）
  function ensurePlaybackAudioSession() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
        navigator.audioSession.type = 'playback';
      }
    } catch (e) {}
  }

  function unlockIOSMediaElement() {
    if (isApiAudioUnlocked) return;
    ensurePlaybackAudioSession();
    try {
      sharedApiAudio.src = SILENT_WAV_URI;
      sharedApiAudio.volume = 0.01;
      const playPromise = sharedApiAudio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          // 僅當仍為靜音佔位音訊時才暫停歸零，避免誤停正在播放的真實音訊
          if (sharedApiAudio.src === SILENT_WAV_URI) {
            sharedApiAudio.pause();
            sharedApiAudio.currentTime = 0;
          }
          isApiAudioUnlocked = true;
        }).catch(() => {});
      }
    } catch (e) {}
  }

  // --- IndexedDB Persistent Audio Cache (Zero-Cost Replay for OpenAI TTS) ---
  const DB_NAME = 'EchoReaderAudioCache';
  const DB_VERSION = 1;
  const STORE_NAME = 'tts_blobs';
  let dbPromise = null;
  const memoryBlobCache = new Map();
  const chapterAudioBlobCache = new Map();
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
  let currentEngine = 'audiobook'; // 'audiobook', 'openai', or 'local'
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
  let loadedAudiobookKey = null;
  let currentAudiobookChapterTrack = null;
  let playbackSessionId = 0; // Prevents async race conditions on cancel/switch
  let autoplayTimer = null;
  let keepAliveTimer = null;
  let iosSentenceProgressTimer = null;

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
  const audiobookInfoGroup = document.getElementById('audiobook-info-group');
  const audiobookInfoDesc = document.getElementById('audiobook-info-desc');
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

    ensurePlaybackAudioSession();
    initMediaSessionHandlers();
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
    if (synth) {
      if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
      }
      // iOS Safari / PWA often populates getVoices() asynchronously without firing onvoiceschanged
      if (synth.getVoices().length === 0) {
        setTimeout(loadVoices, 300);
        setTimeout(loadVoices, 1200);
      }
    }

    bindEvents();
    restoreProgress();
    updateLangBadgeUI();
    updateEngineUI();
    updatePlayerUI();
  }

  function getAudiobookTrack(version, lang, chapterId) {
    // 僅中文使用預製免費 MP3 有聲書，德文一律交由裝置內建即時語音輸出
    if (lang !== 'zh' || !window.audiobookManifest) return null;
    const verMap = window.audiobookManifest[version];
    if (!verMap || !verMap.zh) return null;
    return verMap.zh[chapterId] || null;
  }

  function isAudioElementEngine() {
    return currentEngine === 'openai' ||
      (currentEngine === 'audiobook' && !!getAudiobookTrack(currentVersion, currentPlayingLang, currentChapterId));
  }

  // 設定 iPhone 鎖定畫面與控制中心媒體控制 (Media Session API)
  function initMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    const safeBind = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {}
    };

    safeBind('play', () => {
      if (!isPlaying || isPaused) {
        togglePlayPause();
      }
    });
    safeBind('pause', () => {
      if (isPlaying && !isPaused) {
        togglePlayPause();
      }
    });
    safeBind('previoustrack', () => {
      playPrevious();
    });
    safeBind('nexttrack', () => {
      playNext();
    });
    safeBind('stop', () => {
      stopSpeech();
    });
    safeBind('seekbackward', (details) => {
      if (currentApiAudio && !isNaN(currentApiAudio.duration)) {
        const offset = (details && details.seekOffset) || 10;
        currentApiAudio.currentTime = Math.max(0, currentApiAudio.currentTime - offset);
        updateMediaSessionPosition(currentApiAudio);
      }
    });
    safeBind('seekforward', (details) => {
      if (currentApiAudio && !isNaN(currentApiAudio.duration)) {
        const offset = (details && details.seekOffset) || 10;
        currentApiAudio.currentTime = Math.min(currentApiAudio.duration, currentApiAudio.currentTime + offset);
        updateMediaSessionPosition(currentApiAudio);
      }
    });
    safeBind('seekto', (details) => {
      if (currentApiAudio && details && typeof details.seekTime === 'number' && !isNaN(currentApiAudio.duration)) {
        currentApiAudio.currentTime = Math.max(0, Math.min(currentApiAudio.duration, details.seekTime));
        updateMediaSessionPosition(currentApiAudio);
      }
    });
  }

  function updateMediaSessionMetadata(chapter, paraIndex, totalParas, lang) {
    if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
    try {
      const chTitle = chapter ? chapter.title.split(' (')[0] : '跟隨基督';
      const langLabel = lang === 'de' ? '德文原文' : '中文朗讀';
      const artwork512 = new URL('app-icon-512.png?v=20261119c', window.location.href).href;
      const artwork1024 = new URL('app-icon-1024.png?v=20261119c', window.location.href).href;
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${chTitle} • 第 ${paraIndex + 1}/${totalParas} 段`,
        artist: `潘霍華《跟隨基督》(${langLabel})`,
        album: activeBookData ? activeBookData.title : '跟隨基督 (Nachfolge)',
        artwork: [
          { src: artwork512, sizes: '512x512', type: 'image/png' },
          { src: artwork1024, sizes: '1024x1024', type: 'image/png' }
        ]
      });
    } catch (e) {}
  }

  function updateMediaSessionPlaybackState() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = isPlaying ? (isPaused ? 'paused' : 'playing') : 'none';
    } catch (e) {}
  }

  function updateMediaSessionPosition(audioEl) {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    if (!audioEl || !isFinite(audioEl.duration) || audioEl.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audioEl.duration,
        playbackRate: audioEl.playbackRate || 1.0,
        position: Math.max(0, Math.min(audioEl.currentTime || 0, audioEl.duration))
      });
    } catch (e) {}
  }

  function updateEngineUI() {
    if (audiobookInfoGroup) {
      audiobookInfoGroup.style.display = currentEngine === 'audiobook' ? 'flex' : 'none';
    }
    if (openaiSettingsGroup) {
      openaiSettingsGroup.style.display = currentEngine === 'openai' ? 'flex' : 'none';
    }

    const activeAudiobookTrack = currentEngine === 'audiobook'
      ? getAudiobookTrack(currentVersion, currentPlayingLang, currentChapterId)
      : null;

    if (audiobookInfoDesc) {
      audiobookInfoDesc.textContent = '中文（精華版＋完整版全 15 章）皆為免費預製高擬真 MP3，支援 iPhone 關螢幕／切 App 續播與鎖屏控制；德文則自動使用 iPhone 內建即時語音朗讀。';
    }

    if (btnDownloadMp3) {
      const canDownload = (currentEngine === 'openai' && currentApiBlob) || !!activeAudiobookTrack;
      btnDownloadMp3.style.display = canDownload ? 'inline-flex' : 'none';
    }

    if (footerStatusHint) {
      if (currentEngine === 'audiobook') {
        footerStatusHint.textContent = '🎧 免費有聲書 Ready（中文支援鎖屏連播 • 德文即時朗讀）';
      } else if (currentEngine === 'openai') {
        footerStatusHint.textContent = '☁️ OpenAI 智慧快取 Ready（支援關螢幕／鎖屏連播）';
      } else {
        footerStatusHint.textContent = isIOS
          ? '🔊 系統內建語音（僅支援畫面開啟時朗讀）'
          : '雙語按句追蹤系統 Ready';
      }
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
      updateEngineUI();
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
      window.lucide.createIcons();
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

  function clearSpeechTimersAndEvents(opts = {}) {
    const keepAudioPlaying = Boolean(opts && opts.keepAudioPlaying);
    if (autoplayTimer) {
      clearTimeout(autoplayTimer);
      autoplayTimer = null;
    }
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    if (iosSentenceProgressTimer) {
      clearInterval(iosSentenceProgressTimer);
      iosSentenceProgressTimer = null;
    }
    if (currentUtterance) {
      currentUtterance.onstart = null;
      currentUtterance.onboundary = null;
      currentUtterance.onend = null;
      currentUtterance.onerror = null;
      currentUtterance = null;
    }
    if (currentApiAudio && !keepAudioPlaying) {
      try {
        currentApiAudio.onplaying = null;
        currentApiAudio.onwaiting = null;
        currentApiAudio.onpause = null;
        currentApiAudio.onloadedmetadata = null;
        currentApiAudio.oncanplay = null;
        currentApiAudio.ontimeupdate = null;
        currentApiAudio.onended = null;
        currentApiAudio.onerror = null;
        currentApiAudio.pause();
      } catch (e) {}
      currentApiAudio = null;
    }
    if (currentApiAudioUrl && !keepAudioPlaying) {
      URL.revokeObjectURL(currentApiAudioUrl);
      currentApiAudioUrl = null;
    }
    if (!keepAudioPlaying) {
      loadedAudiobookKey = null;
      currentAudiobookChapterTrack = null;
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

  function buildSentenceQueueForParagraph(rawParagraphText, lang) {
    const rawSentences = splitIntoSentences(rawParagraphText, lang);
    const queue = rawSentences
      .map((origText, idx) => ({
        index: idx,
        origText,
        cleanText: cleanTextForSpeech(origText, lang)
      }))
      .filter(item => item.cleanText.length > 0);

    if (queue.length === 0) {
      return [{
        index: 0,
        origText: rawParagraphText,
        cleanText: rawParagraphText
      }];
    }
    return queue;
  }

  function computeSentenceBounds(queue) {
    const totalChars = queue.reduce((acc, item) => acc + item.cleanText.length, 0) || 1;
    let runningChars = 0;
    return queue.map(item => {
      const startRatio = runningChars / totalChars;
      runningChars += item.cleanText.length;
      const endRatio = runningChars / totalChars;
      return { ...item, startRatio, endRatio };
    });
  }

  function buildCleanParagraphForOpenAI(pData, lang) {
    if (!pData) return '';
    const rawText = lang === 'de' ? pData.de : pData.zh;
    const rawSentences = splitIntoSentences(rawText, lang);
    return rawSentences
      .map(s => cleanTextForSpeech(s, lang))
      .filter(Boolean)
      .join(lang === 'de' ? ' ' : '');
  }

  // 提早預抓後續 2 段 OpenAI 音訊（確保鎖屏與背景播放時無斷層接續）
  function prefetchUpcomingOpenAISegments(card, paragraphId, currentLang, count = 2) {
    if (currentEngine !== 'openai' || !autoplayEnabled) return;
    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter) return;

    let simParaId = paragraphId;
    let simLang = currentLang;
    let simCard = card;

    for (let step = 0; step < count; step++) {
      let nextParaId = null;
      let nextLang = simLang;

      if (readMode === 'de-zh' && simLang === 'de') {
        nextParaId = simParaId;
        nextLang = 'zh';
      } else if (readMode === 'zh-de' && simLang === 'zh') {
        nextParaId = simParaId;
        nextLang = 'de';
      } else {
        const nextCard = simCard ? simCard.nextElementSibling : null;
        if (nextCard && nextCard.classList.contains('paragraph-card')) {
          nextParaId = nextCard.id;
          nextLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : simLang);
          simCard = nextCard;
        }
      }

      if (!nextParaId) break;
      simParaId = nextParaId;
      simLang = nextLang;

      const pData = chapter.paragraphs.find(p => p.id === nextParaId);
      const cleaned = buildCleanParagraphForOpenAI(pData, nextLang);
      if (cleaned) {
        getOrSynthesizeOpenAIAudio(cleaned, nextLang).catch(() => {});
      }
    }
  }

  function playParagraph(id, lang = null, startSentenceIdx = 0) {
    ensurePlaybackAudioSession();
    const resolvedLang = lang || (currentViewMode === 'de' ? 'de' : (currentViewMode === 'zh' ? 'zh' : currentPlayingLang));
    currentPlayingLang = resolvedLang;
    updateLangBadgeUI();

    const audiobookTrack = currentEngine === 'audiobook'
      ? getAudiobookTrack(currentVersion, resolvedLang, currentChapterId)
      : null;
    const useAudiobook = Boolean(audiobookTrack && audiobookTrack.paragraphs && audiobookTrack.paragraphs[id]);
    const targetTrackKey = useAudiobook ? `${currentVersion}:${resolvedLang}:${currentChapterId}` : null;
    const reuseLoadedChapterAudio = Boolean(
      targetTrackKey &&
      loadedAudiobookKey === targetTrackKey &&
      currentApiAudio === sharedApiAudio &&
      sharedApiAudio.readyState >= 1
    );

    playbackSessionId++;
    const sessionId = playbackSessionId;
    clearSpeechTimersAndEvents({ keepAudioPlaying: reuseLoadedChapterAudio });
    if (synth && (synth.speaking || synth.pending)) {
      synth.cancel();
    }

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
    activeSentenceQueue = buildSentenceQueueForParagraph(rawParagraphText, resolvedLang);

    let queuePos = activeSentenceQueue.findIndex(item => item.index >= startSentenceIdx);
    if (queuePos === -1) queuePos = 0;

    const index = parseInt(card.getAttribute('data-index'), 10);
    const total = chapter.paragraphs.length;
    const progressPercent = ((index + 1) / total) * 100;
    progressBarFill.style.width = `${progressPercent}%`;
    progressTimeCurrent.textContent = `${index + 1}`;
    progressTimeTotal.textContent = `${total}`;
    footerChapter.textContent = `${chapter.title.split(' (')[0]} - 第 ${index + 1} / ${total} 段 (${resolvedLang === 'de' ? '德文' : '中文'})`;

    if (!document.hidden) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    saveProgress(currentChapterId, id);
    updateMediaSessionMetadata(chapter, index, total, resolvedLang);

    if (currentEngine === 'openai') {
      playParagraphWithOpenAI(sessionId, card, id, resolvedLang, queuePos);
    } else if (useAudiobook) {
      playParagraphWithAudiobook(
        sessionId,
        card,
        id,
        resolvedLang,
        queuePos,
        audiobookTrack,
        targetTrackKey,
        reuseLoadedChapterAudio
      );
    } else {
      if (btnDownloadMp3) btnDownloadMp3.style.display = 'none';
      if (currentEngine === 'audiobook' && footerStatusHint) {
        footerStatusHint.textContent = resolvedLang === 'de'
          ? '🔊 德文使用裝置內建即時語音朗讀'
          : '🔊 改用系統語音朗讀';
      }
      if (isIOS) {
        // On iOS Safari, speak the paragraph in a single synchronous SpeechSynthesisUtterance
        // within the user's tap gesture (matching the working v3.1 behavior) while tracking sentences via onboundary/timer
        speakParagraphUnifiedOnIOS(sessionId, card, id, resolvedLang, queuePos);
      } else {
        speakSentenceInQueue(sessionId, card, id, resolvedLang, queuePos);
      }
    }
  }

  function playParagraphWithAudiobook(
    sessionId,
    card,
    paragraphId,
    lang,
    startQueuePos,
    audiobookTrack,
    targetTrackKey,
    reuseLoadedChapterAudio
  ) {
    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter) return;

    // 整理本章依序排列的段落與時間區間
    const orderedParas = chapter.paragraphs
      .map((p, idx) => {
        const timing = audiobookTrack.paragraphs[p.id];
        if (!timing) return null;
        return {
          id: p.id,
          index: idx,
          start: timing.start,
          end: timing.end,
          data: p
        };
      })
      .filter(Boolean);

    let activeParaMeta = orderedParas.find(p => p.id === paragraphId);
    if (!activeParaMeta) return;

    let sentenceBounds = computeSentenceBounds(activeSentenceQueue);
    const initialBound = sentenceBounds[startQueuePos] || sentenceBounds[0];
    currentSentenceIndex = initialBound.index;
    highlightActiveSentence(card, lang, currentSentenceIndex);
    footerTitle.textContent = initialBound.origText.substring(0, 34) + (initialBound.origText.length > 34 ? '...' : '');

    const paraDuration = Math.max(0.1, activeParaMeta.end - activeParaMeta.start);
    const seekTime = startQueuePos > 0 && initialBound.startRatio > 0
      ? Math.min(activeParaMeta.end - 0.05, activeParaMeta.start + initialBound.startRatio * paraDuration)
      : activeParaMeta.start;

    currentApiBlob = null;
    currentAudiobookChapterTrack = audiobookTrack;
    loadedAudiobookKey = targetTrackKey;
    if (btnDownloadMp3) btnDownloadMp3.style.display = 'inline-flex';
    if (footerStatusHint) {
      footerStatusHint.textContent = '🎧 免費有聲書播放中（支援關螢幕／鎖屏連播）';
    }

    const audio = sharedApiAudio;
    currentApiAudio = audio;
    audio.onplaying = null;
    audio.onwaiting = null;
    audio.onpause = null;
    audio.onloadedmetadata = null;
    audio.oncanplay = null;
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;

    let usedBlobFallback = false;
    const ver = (window.audiobookManifest && window.audiobookManifest.version) || '1';
    const targetUrl = new URL(`${audiobookTrack.src}?v=${ver}`, window.location.href).href;

    const applyInitialSeek = () => {
      if (sessionId !== playbackSessionId) return;
      audio.playbackRate = speedRate;
      if (seekTime > 0.05 && Math.abs(audio.currentTime - seekTime) > 0.25) {
        try {
          audio.currentTime = seekTime;
        } catch (e) {}
      }
      updateMediaSessionPosition(audio);
    };

    const syncParagraphAndSentenceUI = (t) => {
      // 跨段邊界判斷：僅在單語連續朗讀時自動跟隨整章節時間軸往下推進
      let matchedPara = activeParaMeta;
      for (let i = orderedParas.length - 1; i >= 0; i--) {
        if (t >= orderedParas[i].start - 0.08) {
          matchedPara = orderedParas[i];
          break;
        }
      }

      if (matchedPara && matchedPara.id !== activeParagraphId) {
        activeParaMeta = matchedPara;
        activeParagraphId = matchedPara.id;
        const newCard = document.getElementById(matchedPara.id);
        if (newCard) {
          document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('active'));
          newCard.classList.add('active');
          if (!document.hidden) {
            newCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }

        const total = chapter.paragraphs.length;
        const progressPercent = ((matchedPara.index + 1) / total) * 100;
        progressBarFill.style.width = `${progressPercent}%`;
        progressTimeCurrent.textContent = `${matchedPara.index + 1}`;
        progressTimeTotal.textContent = `${total}`;
        footerChapter.textContent = `${chapter.title.split(' (')[0]} - 第 ${matchedPara.index + 1} / ${total} 段 (${lang === 'de' ? '德文' : '中文'})`;

        saveProgress(currentChapterId, matchedPara.id);
        updateMediaSessionMetadata(chapter, matchedPara.index, total, lang);

        const rawParaText = lang === 'de' ? matchedPara.data.de : matchedPara.data.zh;
        activeSentenceQueue = buildSentenceQueueForParagraph(rawParaText, lang);
        sentenceBounds = computeSentenceBounds(activeSentenceQueue);
      }

      const activeCard = document.getElementById(activeParagraphId);
      const dur = Math.max(0.1, activeParaMeta.end - activeParaMeta.start);
      const localRatio = Math.max(0, Math.min(1, (t - activeParaMeta.start) / dur));
      const matchedSent = sentenceBounds.find(b => localRatio <= b.endRatio) || sentenceBounds[sentenceBounds.length - 1];

      if (matchedSent && (matchedSent.index !== currentSentenceIndex || !activeCard?.querySelector('.sentence-span.active-sentence'))) {
        currentSentenceIndex = matchedSent.index;
        highlightActiveSentence(activeCard, lang, currentSentenceIndex);
        footerTitle.textContent = matchedSent.origText.substring(0, 34) + (matchedSent.origText.length > 34 ? '...' : '');
      }
    };

    audio.onplaying = () => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = true;
      isPaused = false;
      audio.playbackRate = speedRate;
      updatePlayerUI();
      updateMediaSessionPosition(audio);
      if (footerStatusHint) {
        footerStatusHint.textContent = '🎧 免費有聲書播放中（支援鎖屏連播）';
      }
    };

    audio.onwaiting = () => {
      if (sessionId !== playbackSessionId) return;
      if (footerStatusHint) {
        footerStatusHint.textContent = '⏳ 緩衝載入音訊中...';
      }
    };

    audio.onpause = () => {
      if (sessionId !== playbackSessionId || audio.ended) return;
      if (isPlaying) {
        isPaused = true;
        updatePlayerUI();
        updateMediaSessionPosition(audio);
      }
    };

    audio.ontimeupdate = () => {
      if (sessionId !== playbackSessionId || audio.paused) return;
      const t = audio.currentTime;

      // 若為雙語交替模式或關閉自動連播，於本段結束時間點切換或停止
      if (readMode !== 'single' || !autoplayEnabled) {
        if (t >= activeParaMeta.end - 0.05) {
          if (readMode === 'single' && !autoplayEnabled) {
            audio.ontimeupdate = null;
            audio.pause();
            isPlaying = false;
            isPaused = false;
            clearSentenceHighlights();
            updatePlayerUI();
            updateMediaSessionPosition(audio);
            return;
          }
          audio.ontimeupdate = null;
          const activeCard = document.getElementById(activeParagraphId) || card;
          handleParagraphFinished(sessionId, activeCard, activeParagraphId, lang);
          return;
        }
      }

      syncParagraphAndSentenceUI(t);
      updateMediaSessionPosition(audio);
    };

    audio.onended = () => {
      if (sessionId !== playbackSessionId) return;
      const lastCard = document.getElementById(activeParagraphId) || card;
      handleParagraphFinished(sessionId, lastCard, activeParagraphId, lang);
    };

    const showPlaybackFailure = (err) => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = false;
      isPaused = false;
      updatePlayerUI();
      if (footerStatusHint) {
        const label = (err && (err.name || err.message)) || '請再點一次播放';
        footerStatusHint.textContent = `⚠️ 播放失敗：${label}`;
      }
    };

    // 若 iOS Safari 因伺服器 MIME (audio/mp3) 拒播，改以標準 audio/mpeg Blob 載入重試
    const fallbackToMpegBlob = async (reason) => {
      if (usedBlobFallback || sessionId !== playbackSessionId) {
        showPlaybackFailure(reason);
        return;
      }
      usedBlobFallback = true;
      if (footerStatusHint) {
        footerStatusHint.textContent = '⏳ 正在切換相容音訊模式載入...';
      }
      try {
        let blob = chapterAudioBlobCache.get(targetTrackKey);
        if (!blob) {
          const res = await fetch(targetUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          if (sessionId !== playbackSessionId) return;
          blob = new Blob([buf], { type: 'audio/mpeg' });
          chapterAudioBlobCache.set(targetTrackKey, blob);
        }
        if (currentApiAudioUrl) {
          URL.revokeObjectURL(currentApiAudioUrl);
        }
        currentApiAudioUrl = URL.createObjectURL(blob);
        audio.src = currentApiAudioUrl;
        audio.playbackRate = speedRate;
        audio.volume = volumeLevel;
        audio.addEventListener('loadedmetadata', applyInitialSeek, { once: true });
        audio.addEventListener('canplay', applyInitialSeek, { once: true });
        audio.load();
        await audio.play();
      } catch (err) {
        if (sessionId !== playbackSessionId) return;
        console.warn('Audiobook Blob fallback error:', err);
        showPlaybackFailure(err);
      }
    };

    audio.onerror = () => {
      if (sessionId !== playbackSessionId) return;
      const errCode = audio.error ? audio.error.code : 0;
      if (!usedBlobFallback && (errCode === 3 || errCode === 4 || errCode === 0)) {
        fallbackToMpegBlob(new Error(`媒體錯誤(${errCode})`));
      } else {
        showPlaybackFailure(new Error(`媒體錯誤(${errCode})`));
      }
    };

    isPlaying = true;
    isPaused = false;
    updatePlayerUI();

    if (reuseLoadedChapterAudio) {
      audio.playbackRate = speedRate;
      audio.volume = volumeLevel;
      try {
        audio.currentTime = seekTime;
      } catch (e) {}
      updateMediaSessionPosition(audio);
      if (audio.paused) {
        audio.play().catch((err) => {
          if (sessionId !== playbackSessionId || (err && err.name === 'AbortError')) return;
          console.warn('Audiobook resume error:', err);
          showPlaybackFailure(err);
        });
      } else if (footerStatusHint) {
        footerStatusHint.textContent = '🎧 免費有聲書播放中（支援鎖屏連播）';
      }
    } else {
      if (footerStatusHint) {
        footerStatusHint.textContent = '⏳ 載入有聲書音訊中...';
      }
      if (currentApiAudioUrl) {
        URL.revokeObjectURL(currentApiAudioUrl);
        currentApiAudioUrl = null;
      }
      if (chapterAudioBlobCache.has(targetTrackKey)) {
        usedBlobFallback = true;
        currentApiAudioUrl = URL.createObjectURL(chapterAudioBlobCache.get(targetTrackKey));
        audio.src = currentApiAudioUrl;
      } else {
        audio.src = targetUrl;
      }
      audio.playbackRate = speedRate;
      audio.volume = volumeLevel;

      audio.addEventListener('loadedmetadata', applyInitialSeek, { once: true });
      audio.addEventListener('canplay', applyInitialSeek, { once: true });
      audio.load();

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => {
          if (sessionId !== playbackSessionId) return;
          audio.playbackRate = speedRate;
          updateMediaSessionPosition(audio);
        }).catch((err) => {
          if (sessionId !== playbackSessionId || (err && err.name === 'AbortError')) return;
          console.warn('Audiobook play error:', err);
          if (!usedBlobFallback && err && (err.name === 'NotSupportedError' || err.name === 'NotAllowedError')) {
            if (err.name === 'NotSupportedError') {
              fallbackToMpegBlob(err);
              return;
            }
          }
          showPlaybackFailure(err);
        });
      }
    }
  }

  function setupOpenAIAudioPlayback(sessionId, card, paragraphId, lang, startQueuePos, blob, fromCache, sentenceBounds) {
    if (sessionId !== playbackSessionId) return;

    currentApiBlob = blob;
    currentAudiobookChapterTrack = null;
    loadedAudiobookKey = null;
    if (btnDownloadMp3) btnDownloadMp3.style.display = 'inline-flex';
    if (footerStatusHint) {
      footerStatusHint.textContent = fromCache
        ? '⚡ OpenAI 快取播放（支援關螢幕／鎖屏連播）'
        : '☁️ OpenAI 已合成並快取（支援關螢幕／鎖屏連播）';
    }

    if (currentApiAudioUrl) {
      URL.revokeObjectURL(currentApiAudioUrl);
    }
    currentApiAudioUrl = URL.createObjectURL(blob);
    const audio = sharedApiAudio;
    audio.onplaying = null;
    audio.onwaiting = null;
    audio.onpause = null;
    audio.onloadedmetadata = null;
    audio.oncanplay = null;
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    audio.src = currentApiAudioUrl;
    currentApiAudio = audio;
    audio.playbackRate = speedRate;
    audio.volume = volumeLevel;

    const initialBound = sentenceBounds[startQueuePos] || sentenceBounds[0];
    currentSentenceIndex = initialBound.index;
    highlightActiveSentence(card, lang, currentSentenceIndex);
    footerTitle.textContent = initialBound.origText.substring(0, 34) + (initialBound.origText.length > 34 ? '...' : '');

    // 播放一開始即預抓後續 2 段，避免鎖屏切段時因網路延遲斷線
    prefetchUpcomingOpenAISegments(card, paragraphId, lang, 2);

    const applySeekAndRate = () => {
      if (sessionId !== playbackSessionId) return;
      audio.playbackRate = speedRate;
      if (startQueuePos > 0 && initialBound.startRatio > 0 && audio.duration && !isNaN(audio.duration)) {
        audio.currentTime = initialBound.startRatio * audio.duration;
      }
      updateMediaSessionPosition(audio);
    };
    audio.addEventListener('loadedmetadata', applySeekAndRate, { once: true });

    audio.onplaying = () => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = true;
      isPaused = false;
      audio.playbackRate = speedRate;
      updatePlayerUI();
      updateMediaSessionPosition(audio);
    };

    audio.onpause = () => {
      if (sessionId !== playbackSessionId || audio.ended) return;
      if (isPlaying) {
        isPaused = true;
        updatePlayerUI();
        updateMediaSessionPosition(audio);
      }
    };

    audio.ontimeupdate = () => {
      if (sessionId !== playbackSessionId || !audio.duration || isNaN(audio.duration)) return;
      const ratio = audio.currentTime / audio.duration;
      const matched = sentenceBounds.find(b => ratio <= b.endRatio) || sentenceBounds[sentenceBounds.length - 1];
      if (matched && matched.index !== currentSentenceIndex) {
        currentSentenceIndex = matched.index;
        highlightActiveSentence(card, lang, currentSentenceIndex);
        footerTitle.textContent = matched.origText.substring(0, 34) + (matched.origText.length > 34 ? '...' : '');
      }
      updateMediaSessionPosition(audio);
    };

    audio.onended = () => {
      if (sessionId !== playbackSessionId) return;
      handleParagraphFinished(sessionId, card, paragraphId, lang);
    };

    audio.onerror = () => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = false;
      isPaused = false;
      updatePlayerUI();
    };

    isPlaying = true;
    isPaused = false;
    updatePlayerUI();

    audio.load();
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => {
        if (sessionId !== playbackSessionId) return;
        audio.playbackRate = speedRate;
        updateMediaSessionPosition(audio);
      }).catch((err) => {
        if (sessionId !== playbackSessionId || (err && err.name === 'AbortError')) return;
        console.warn('OpenAI audio play error:', err);
        isPlaying = false;
        isPaused = false;
        updatePlayerUI();
      });
    }
  }

  async function playParagraphWithOpenAI(sessionId, card, paragraphId, lang, startQueuePos) {
    const fullCleanText = activeSentenceQueue
      .map(item => item.cleanText)
      .join(lang === 'de' ? ' ' : '');

    const sentenceBounds = computeSentenceBounds(activeSentenceQueue);
    const voice = lang === 'de' ? selectedOpenaiDeVoice : selectedOpenaiZhVoice;
    const cacheKey = makeCacheKey(openaiModel, voice, fullCleanText);

    // 記憶體快取命中時同步直播，不經過 await 以完整保留 iOS 背景／鎖屏播放權限
    if (memoryBlobCache.has(cacheKey)) {
      const memBlob = memoryBlobCache.get(cacheKey);
      setupOpenAIAudioPlayback(sessionId, card, paragraphId, lang, startQueuePos, memBlob, true, sentenceBounds);
      return;
    }

    unlockIOSMediaElement();

    footerTitle.textContent = '正在載入 OpenAI 語音...';
    if (footerStatusHint) {
      footerStatusHint.textContent = '☁️ 檢查快取 / 合成語音中...';
    }

    try {
      const { blob, fromCache } = await getOrSynthesizeOpenAIAudio(fullCleanText, lang);
      setupOpenAIAudioPlayback(sessionId, card, paragraphId, lang, startQueuePos, blob, fromCache, sentenceBounds);
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

  function resolveLiveVoice(selectedVoice, lang) {
    if (!selectedVoice || !synth) return null;
    const allVoices = synth.getVoices();
    return allVoices.find(v => v.name === selectedVoice.name && v.lang === selectedVoice.lang)
      || allVoices.find(v => v.name === selectedVoice.name)
      || null;
  }

  // Unified single-utterance paragraph speech for iOS Safari (guarantees synchronous user-gesture execution & full paragraph continuity)
  function speakParagraphUnifiedOnIOS(sessionId, card, paragraphId, lang, startQueuePos) {
    if (!synth || sessionId !== playbackSessionId) return;

    const remaining = activeSentenceQueue.slice(startQueuePos);
    if (remaining.length === 0) {
      handleParagraphFinished(sessionId, card, paragraphId, lang);
      return;
    }

    const sep = lang === 'de' ? ' ' : '';
    let runningChar = 0;
    const sentenceOffsets = remaining.map(item => {
      const startChar = runningChar;
      const endChar = startChar + item.cleanText.length;
      runningChar = endChar + sep.length;
      return {
        ...item,
        startChar,
        endChar
      };
    });
    const totalChars = Math.max(1, runningChar);
    const combinedText = remaining.map(item => item.cleanText).join(sep);

    const firstItem = remaining[0];
    currentSentenceIndex = firstItem.index;
    isPlaying = true;
    isPaused = false;
    updatePlayerUI();
    highlightActiveSentence(card, lang, firstItem.index);
    footerTitle.textContent = firstItem.origText.substring(0, 34) + (firstItem.origText.length > 34 ? '...' : '');

    const utter = new SpeechSynthesisUtterance(combinedText);
    currentUtterance = utter;
    utter.rate = speedRate;
    if (volumeLevel < 1.0) {
      utter.volume = volumeLevel;
    }

    const targetVoice = lang === 'zh' ? selectedZhVoice : selectedDeVoice;
    const appliedVoice = resolveLiveVoice(targetVoice, lang);
    if (appliedVoice) {
      utter.voice = appliedVoice;
      utter.lang = appliedVoice.lang || (lang === 'de' ? 'de-DE' : 'zh-TW');
    } else {
      utter.lang = lang === 'de' ? 'de-DE' : 'zh-TW';
    }

    let boundaryFired = false;
    let startedAt = Date.now();
    const charsPerSec = (lang === 'de' ? 14 : 4.2) * (speedRate || 1.0);
    const estimatedDurationMs = Math.max(1200, (totalChars / charsPerSec) * 1000);

    const startFallbackHighlightTimer = () => {
      if (iosSentenceProgressTimer) clearInterval(iosSentenceProgressTimer);
      startedAt = Date.now();
      iosSentenceProgressTimer = setInterval(() => {
        if (sessionId !== playbackSessionId || !isPlaying || isPaused || boundaryFired) return;
        const elapsed = Date.now() - startedAt;
        const approxChar = Math.min(totalChars - 1, Math.floor((elapsed / estimatedDurationMs) * totalChars));
        const matched = sentenceOffsets.find(s => approxChar < s.endChar) || sentenceOffsets[sentenceOffsets.length - 1];
        if (matched && matched.index !== currentSentenceIndex) {
          currentSentenceIndex = matched.index;
          highlightActiveSentence(card, lang, currentSentenceIndex);
          footerTitle.textContent = matched.origText.substring(0, 34) + (matched.origText.length > 34 ? '...' : '');
        }
      }, 250);
    };

    utter.onstart = () => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = true;
      isPaused = false;
      updatePlayerUI();
      startFallbackHighlightTimer();
    };

    utter.onboundary = (e) => {
      if (sessionId !== playbackSessionId || typeof e.charIndex !== 'number') return;
      boundaryFired = true;
      const cIdx = e.charIndex;
      const matched = sentenceOffsets.find(s => cIdx < s.endChar) || sentenceOffsets[sentenceOffsets.length - 1];
      if (matched && matched.index !== currentSentenceIndex) {
        currentSentenceIndex = matched.index;
        highlightActiveSentence(card, lang, currentSentenceIndex);
        footerTitle.textContent = matched.origText.substring(0, 34) + (matched.origText.length > 34 ? '...' : '');
      }
    };

    utter.onend = () => {
      if (sessionId !== playbackSessionId) return;
      if (iosSentenceProgressTimer) {
        clearInterval(iosSentenceProgressTimer);
        iosSentenceProgressTimer = null;
      }
      handleParagraphFinished(sessionId, card, paragraphId, lang);
    };

    utter.onerror = (e) => {
      if (sessionId !== playbackSessionId) return;
      if (iosSentenceProgressTimer) {
        clearInterval(iosSentenceProgressTimer);
        iosSentenceProgressTimer = null;
      }
      if (e.error !== 'interrupted' && e.error !== 'canceled') {
        console.warn('iOS TTS Utterance error:', e.error);
        isPlaying = false;
        updatePlayerUI();
      }
    };

    startFallbackHighlightTimer();
    synth.speak(utter);
  }

  function speakSentenceInQueue(sessionId, card, paragraphId, lang, queuePos) {
    if (!synth || sessionId !== playbackSessionId) return;

    if (queuePos >= activeSentenceQueue.length) {
      handleParagraphFinished(sessionId, card, paragraphId, lang);
      return;
    }

    const sentenceItem = activeSentenceQueue[queuePos];
    currentSentenceIndex = sentenceItem.index;

    isPlaying = true;
    isPaused = false;
    updatePlayerUI();
    highlightActiveSentence(card, lang, sentenceItem.index);
    const snippet = sentenceItem.origText;
    footerTitle.textContent = snippet.substring(0, 34) + (snippet.length > 34 ? '...' : '');

    const utter = new SpeechSynthesisUtterance(sentenceItem.cleanText);
    currentUtterance = utter;
    utter.rate = speedRate;
    utter.pitch = 1.0;
    utter.volume = volumeLevel;

    const targetVoice = lang === 'zh' ? selectedZhVoice : selectedDeVoice;
    const appliedVoice = resolveLiveVoice(targetVoice, lang);

    if (appliedVoice) {
      utter.voice = appliedVoice;
      utter.lang = appliedVoice.lang || (lang === 'de' ? 'de-DE' : 'zh-TW');
    } else {
      utter.lang = lang === 'de' ? 'de-DE' : 'zh-TW';
    }

    utter.onstart = () => {
      if (sessionId !== playbackSessionId) return;
      isPlaying = true;
      isPaused = false;
      updatePlayerUI();
      highlightActiveSentence(card, lang, sentenceItem.index);
      footerTitle.textContent = snippet.substring(0, 34) + (snippet.length > 34 ? '...' : '');

      if (!isIOS) {
        if (keepAliveTimer) clearInterval(keepAliveTimer);
        keepAliveTimer = setInterval(() => {
          if (synth.speaking && !synth.paused) {
            synth.pause();
            synth.resume();
          }
        }, 10000);
      }
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

    if (synth.paused) {
      synth.resume();
    }
    synth.speak(utter);
  }

  function handleParagraphFinished(sessionId, card, paragraphId, finishedLang) {
    if (sessionId !== playbackSessionId) return;

    isPlaying = false;
    clearSentenceHighlights();
    updatePlayerUI();

    const useImmediateTransition = currentEngine === 'openai' ||
      currentEngine === 'audiobook' ||
      document.hidden;

    const scheduleStep = (delayMs, fn) => {
      if (useImmediateTransition) {
        if (sessionId === playbackSessionId) fn();
      } else {
        autoplayTimer = setTimeout(() => {
          if (sessionId === playbackSessionId) fn();
        }, delayMs);
      }
    };

    if (readMode === 'de-zh' && finishedLang === 'de') {
      scheduleStep(450, () => playParagraph(paragraphId, 'zh', 0));
      return;
    }

    if (readMode === 'zh-de' && finishedLang === 'zh') {
      scheduleStep(450, () => playParagraph(paragraphId, 'de', 0));
      return;
    }

    if (!autoplayEnabled) return;

    const nextParaLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : finishedLang);

    const nextCard = card ? card.nextElementSibling : null;
    if (nextCard && nextCard.classList.contains('paragraph-card')) {
      scheduleStep(550, () => playParagraph(nextCard.id, nextParaLang, 0));
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
          updateEngineUI();

          scheduleStep(750, () => {
            const firstCard = document.querySelector('.paragraph-card');
            if (firstCard && firstCard.id) {
              playParagraph(firstCard.id, nextParaLang, 0);
            }
          });
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
    ensurePlaybackAudioSession();

    if (!activeParagraphId) {
      const firstCard = document.querySelector('.paragraph-card');
      if (firstCard && firstCard.id) {
        const startLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentPlayingLang);
        playParagraph(firstCard.id, startLang, 0);
      }
      return;
    }

    const usingHtmlAudio = isAudioElementEngine() && currentApiAudio;

    if (isPlaying) {
      if (isPaused) {
        if (usingHtmlAudio) {
          currentApiAudio.playbackRate = speedRate;
          currentApiAudio.volume = volumeLevel;
          const p = currentApiAudio.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
          isPaused = false;
          isPlaying = true;
          updateMediaSessionPosition(currentApiAudio);
        } else if (isIOS) {
          // iOS WebKit synth.resume() is unreliable after pause; re-speak from current sentence
          playParagraph(activeParagraphId, currentPlayingLang, currentSentenceIndex);
          return;
        } else if (synth) {
          synth.resume();
          isPaused = false;
          isPlaying = true;
        }
      } else {
        if (usingHtmlAudio) {
          currentApiAudio.pause();
          updateMediaSessionPosition(currentApiAudio);
        } else if (isIOS) {
          playbackSessionId++;
          clearSpeechTimersAndEvents();
          if (synth && (synth.speaking || synth.pending)) {
            synth.cancel();
          }
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
    const targetLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentPlayingLang);
    if (prev && prev.classList.contains('paragraph-card')) {
      playParagraph(prev.id, targetLang, 0);
      return;
    }

    // 若已在該章第一段，嘗試跳至上一章最後一段
    const chapterIndex = activeBookData.chapters.findIndex(ch => ch.id === currentChapterId);
    if (chapterIndex > 0) {
      const prevChapter = activeBookData.chapters[chapterIndex - 1];
      if (prevChapter.paragraphs && prevChapter.paragraphs.length > 0) {
        currentChapterId = prevChapter.id;
        safeStorage.setItem('bonhoeffer-reader-chapter', prevChapter.id);
        document.querySelectorAll('.chapter-item').forEach(i => i.classList.remove('active'));
        const prevItem = document.querySelector(`.chapter-item[data-id="${prevChapter.id}"]`);
        if (prevItem) prevItem.classList.add('active');
        loadChapter(prevChapter.id);
        updateEngineUI();

        const cards = document.querySelectorAll('.paragraph-card');
        const lastCard = cards[cards.length - 1];
        if (lastCard && lastCard.id) {
          playParagraph(lastCard.id, targetLang, 0);
        }
      }
    }
  }

  function playNext() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const next = card ? card.nextElementSibling : null;
    const targetLang = readMode === 'de-zh' ? 'de' : (readMode === 'zh-de' ? 'zh' : currentPlayingLang);
    if (next && next.classList.contains('paragraph-card')) {
      playParagraph(next.id, targetLang, 0);
      return;
    }

    // 若已在該章最後一段，嘗試跳至下一章第一段
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
        updateEngineUI();

        const firstCard = document.querySelector('.paragraph-card');
        if (firstCard && firstCard.id) {
          playParagraph(firstCard.id, targetLang, 0);
        }
      }
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
    if (btnPlayPause) {
      if (isPlaying && !isPaused) {
        btnPlayPause.innerHTML = ICON_PAUSE_SVG;
        btnPlayPause.setAttribute('aria-label', '暫停');
        btnPlayPause.title = '暫停 (快速鍵: Space)';
      } else {
        btnPlayPause.innerHTML = ICON_PLAY_SVG;
        btnPlayPause.setAttribute('aria-label', '播放');
        btnPlayPause.title = '播放 (快速鍵: Space)';
      }
    }
    updateMediaSessionPlaybackState();
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

    if (isIOS) {
      // On iOS Safari, Siri / un-downloaded Enhanced voices frequently stay silent in WebKit;
      // prioritize standard built-in local voices (Mei-Jia, Tingting, Anna, Helena, Martin) just like v3.1
      if (name.includes('siri')) score -= 60;
      if (voice.localService) score += 20;
      if (targetLang === 'zh') {
        if (name.includes('mei-jia') || name.includes('meijia') || name.includes('美佳')) score += 60;
        if (lang.includes('tw') || lang.includes('hant')) score += 35;
        else if (lang.includes('cn') || lang.includes('hans')) score += 20;
        if (name.includes('tingting') || name.includes('婷婷') || name.includes('yating') || name.includes('雅婷')) score += 25;
      } else if (targetLang === 'de') {
        if (name.includes('anna')) score += 60;
        if (lang === 'de-de' || lang === 'de_de') score += 35;
        if (name.includes('helena') || name.includes('martin') || name.includes('markus') || name.includes('petra') || name.includes('yannick')) score += 25;
      }
      return score;
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

    const isAudiobookMode = currentEngine === 'audiobook';
    if (isAudiobookMode) {
      const zhLabel = (window.audiobookManifest && window.audiobookManifest.voices && window.audiobookManifest.voices.zh)
        ? window.audiobookManifest.voices.zh.label
        : '曉臻 (台灣自然女聲)';
      const shortZhLabel = zhLabel.split(' ')[0];
      const optZh = document.createElement('option');
      optZh.value = 'audiobook-zh';
      optZh.textContent = `${shortZhLabel} • 免費有聲書`;
      voiceSelectZh.appendChild(optZh);
    }

    if (!synth) return;
    const allVoices = synth.getVoices();

    const savedZhName = safeStorage.getItem('bonhoeffer-reader-voice-zh-v3');
    const savedDeName = safeStorage.getItem('bonhoeffer-reader-voice-de-v3');

    if (!isAudiobookMode) {
      const autoZhOpt = document.createElement('option');
      autoZhOpt.value = '__auto__';
      autoZhOpt.textContent = '系統預設中文 (Auto)';
      voiceSelectZh.appendChild(autoZhOpt);
    }

    const autoDeOpt = document.createElement('option');
    autoDeOpt.value = '__auto__';
    autoDeOpt.textContent = '系統預設德文 (Auto)';
    voiceSelectDe.appendChild(autoDeOpt);

    if (!allVoices || allVoices.length === 0) {
      if (!isAudiobookMode) {
        selectedZhVoice = null;
        voiceSelectZh.value = '__auto__';
      }
      selectedDeVoice = null;
      voiceSelectDe.value = '__auto__';
      return;
    }

    if (!isAudiobookMode) {
      const zhVoices = allVoices
        .filter(v => {
          const l = (v.lang || '').toLowerCase();
          return l.includes('zh') || l.includes('cmn') || l.includes('yue');
        })
        .sort((a, b) => scoreVoice(b, 'zh') - scoreVoice(a, 'zh'));

      zhVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = formatVoiceLabel(v, 'zh');
        voiceSelectZh.appendChild(opt);
      });

      if (savedZhName === '__auto__') {
        selectedZhVoice = null;
        voiceSelectZh.value = '__auto__';
      } else {
        const matchedSavedZh = savedZhName && zhVoices.find(v => v.name === savedZhName);
        selectedZhVoice = matchedSavedZh || zhVoices[0] || null;
        voiceSelectZh.value = selectedZhVoice ? selectedZhVoice.name : '__auto__';
      }
    }

    const deVoices = allVoices
      .filter(v => {
        const l = (v.lang || '').toLowerCase();
        return l.startsWith('de');
      })
      .sort((a, b) => scoreVoice(b, 'de') - scoreVoice(a, 'de'));

    deVoices.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = formatVoiceLabel(v, 'de');
      voiceSelectDe.appendChild(opt);
    });

    if (savedDeName === '__auto__') {
      selectedDeVoice = null;
      voiceSelectDe.value = '__auto__';
    } else {
      const matchedSavedDe = savedDeName && deVoices.find(v => v.name === savedDeName);
      selectedDeVoice = matchedSavedDe || deVoices[0] || null;
      voiceSelectDe.value = selectedDeVoice ? selectedDeVoice.name : '__auto__';
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
        if (readerOpenaiKey.type === 'password') {
          readerOpenaiKey.type = 'text';
          btnToggleOpenaiKey.innerHTML = ICON_EYE_OFF_SVG;
        } else {
          readerOpenaiKey.type = 'password';
          btnToggleOpenaiKey.innerHTML = ICON_EYE_SVG;
        }
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
        if (currentEngine === 'audiobook' && currentAudiobookChapterTrack) {
          const a = document.createElement('a');
          a.href = currentAudiobookChapterTrack.src;
          a.download = `bonhoeffer-${currentChapterId}-${currentPlayingLang}.mp3`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          return;
        }
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
      if (currentEngine === 'audiobook') {
        return;
      }
      if (currentEngine === 'openai') {
        selectedOpenaiZhVoice = voiceSelectZh.value;
        safeStorage.setItem('bonhoeffer-reader-openai-voice-zh', selectedOpenaiZhVoice);
      } else if (voiceSelectZh.value === '__auto__' || !voiceSelectZh.value) {
        selectedZhVoice = null;
        safeStorage.setItem('bonhoeffer-reader-voice-zh-v3', '__auto__');
      } else {
        const allVoices = synth.getVoices();
        selectedZhVoice = allVoices.find(v => v.name === voiceSelectZh.value) || null;
        if (selectedZhVoice) {
          safeStorage.setItem('bonhoeffer-reader-voice-zh-v3', selectedZhVoice.name);
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
      } else if (voiceSelectDe.value === '__auto__' || !voiceSelectDe.value) {
        selectedDeVoice = null;
        safeStorage.setItem('bonhoeffer-reader-voice-de-v3', '__auto__');
      } else {
        const allVoices = synth.getVoices();
        selectedDeVoice = allVoices.find(v => v.name === voiceSelectDe.value) || null;
        if (selectedDeVoice) {
          safeStorage.setItem('bonhoeffer-reader-voice-de-v3', selectedDeVoice.name);
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

      // HTML5 Audio 模式（免費有聲書 / OpenAI）可直接即時變速不斷音
      if (isAudioElementEngine() && currentApiAudio) {
        currentApiAudio.playbackRate = speedRate;
        updateMediaSessionPosition(currentApiAudio);
      }
    });

    sliderRate.addEventListener('change', () => {
      if (!isAudioElementEngine() && activeParagraphId && isPlaying && !isPaused) {
        playParagraph(activeParagraphId, currentPlayingLang, currentSentenceIndex);
      }
    });

    if (sliderVolume) {
      sliderVolume.addEventListener('input', () => {
        volumeLevel = parseFloat(sliderVolume.value);
        valVolume.textContent = `${Math.round(volumeLevel * 100)}%`;
        safeStorage.setItem('bonhoeffer-reader-volume', volumeLevel);

        if (isAudioElementEngine() && currentApiAudio) {
          currentApiAudio.volume = volumeLevel;
        }
      });

      sliderVolume.addEventListener('change', () => {
        if (!isAudioElementEngine() && activeParagraphId && isPlaying && !isPaused) {
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
      themeToggle.innerHTML = ICON_SUN_SVG;
    } else {
      themeToggle.innerHTML = ICON_MOON_SVG;
    }
  }

  function loadSettings() {
    const savedTheme = safeStorage.getItem('bonhoeffer-reader-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    const savedEngine = safeStorage.getItem('bonhoeffer-reader-engine');
    if (!savedEngine) {
      currentEngine = window.audiobookManifest ? 'audiobook' : 'local';
    } else if (
      isIOS &&
      savedEngine === 'local' &&
      !safeStorage.getItem('bonhoeffer-reader-audiobook-v1-migrated') &&
      window.audiobookManifest
    ) {
      // 為原先在 iOS 上使用系統語音的讀者一次性自動升級至支援鎖屏／背景播放的免費有聲書引擎
      currentEngine = 'audiobook';
      safeStorage.setItem('bonhoeffer-reader-audiobook-v1-migrated', 'true');
      safeStorage.setItem('bonhoeffer-reader-engine', 'audiobook');
    } else {
      currentEngine = savedEngine;
    }
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
