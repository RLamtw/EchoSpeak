/* ==========================================
   EchoSpeak JS Application Logic
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Safe Storage wrapper to handle environments where localStorage is blocked (e.g. file:// protocol in Safari/Chrome)
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
        window.localStorage.setItem(key, value);
      } catch (e) {
        this._memoryStore[key] = String(value);
      }
    },
    removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (e) {
        delete this._memoryStore[key];
      }
    }
  };
  const localStorage = safeStorage;

  // --- UI Elements ---
  const textInput = document.getElementById('text-input');
  const currentCharCount = document.getElementById('current-char-count');
  
  // Controls
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnDownload = document.getElementById('btn-download');
  const playIcon = document.getElementById('play-icon');
  const playBtnText = document.getElementById('play-btn-text');
  const speechIndicator = document.getElementById('speech-indicator');
  const indicatorText = document.getElementById('indicator-text');
  
  // Settings & Engine selectors
  const engineSelect = document.getElementById('engine-select');
  const voiceSelect = document.getElementById('voice-select');
  const langChips = document.getElementById('lang-chips');
  const sliderRate = document.getElementById('slider-rate');
  const sliderPitch = document.getElementById('slider-pitch');
  const sliderVolume = document.getElementById('slider-volume');
  const valRate = document.getElementById('val-rate');
  const valPitch = document.getElementById('val-pitch');
  const valVolume = document.getElementById('val-volume');
  const volumeIcon = document.getElementById('volume-icon');
  const toggleAutoread = document.getElementById('toggle-autoread');
  const themeToggle = document.getElementById('theme-toggle');
  
  // API Keys Card Components
  const apiCard = document.getElementById('api-card');
  const groupOpenaiKey = document.getElementById('group-openai-key');
  const groupElevenlabsKey = document.getElementById('group-elevenlabs-key');
  const openaiKey = document.getElementById('openai-key');
  const elevenlabsKey = document.getElementById('elevenlabs-key');
  
  // Subtitles & Waveform
  const subtitleDisplay = document.getElementById('subtitle-display');
  const canvas = document.getElementById('waveform-canvas');
  const waveformOverlay = document.getElementById('waveform-overlay');
  
  // Header / Status / Guides
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  const btnGuideModal = document.getElementById('btn-guide-modal');
  const guideDialog = document.getElementById('guide-dialog');
  const btnCloseGuide = document.getElementById('btn-close-guide');
  
  // Dialog / Samples
  const sampleDialog = document.getElementById('sample-dialog');
  const btnSample = document.getElementById('btn-sample');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const sampleItems = document.querySelectorAll('.sample-item');
  
  // Toolbar Actions
  const btnPaste = document.getElementById('btn-paste');
  const btnClear = document.getElementById('btn-clear');
  
  // History & Bookmarks Tabs
  const tabHistory = document.getElementById('tab-history');
  const tabSaved = document.getElementById('tab-saved');
  const tabContentHistory = document.getElementById('tab-content-history');
  const tabContentSaved = document.getElementById('tab-content-saved');
  const historyList = document.getElementById('history-list');
  const savedList = document.getElementById('saved-list');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnSaveCurrent = document.getElementById('btn-save-current');

  // --- App State ---
  const synth = window.speechSynthesis;
  let voices = [];
  let currentLanguageFilter = 'all';
  let currentEngine = 'local'; // 'local', 'openai', 'elevenlabs'
  
  let isPlaying = false; // Is the queue active
  let isPaused = false;  // Is the synth or audio paused
  
  let currentChunks = [];
  let currentChunkIndex = 0;
  let currentUtterance = null;
  let autoReadTimeout = null;

  // HTML5 Audio API objects
  let apiAudio = null;
  let apiAudioUrl = null;
  let audioBlob = null; // unified blob for download
  let lastSynthesizedText = '';
  let lastSynthesizedVoice = '';
  let lastSynthesizedEngine = '';

  // API sequential playback variables
  let apiChunks = [];
  let apiCurrentChunkIndex = 0;
  let apiBlobs = [];
  let apiAudioUrls = [];
  let apiPrefetchPromises = [];

  // Waveform canvas variables
  const ctx = canvas.getContext('2d');
  let animationFrameId = null;
  let wavePhase = 0;
  let waveTargetActivity = 0; // 0 = flat, 1 = maximum activity
  let waveCurrentActivity = 0;
  let feedbackTimeout = null;

  // Sound effects logic (UI Feedback)
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playClickSound(frequency = 800, duration = 0.05, type = 'sine') {
    if (sliderVolume.value === '0') return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.01 * parseFloat(sliderVolume.value), audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Audio context might be suspended
    }
  }

  // --- Initial Setup & Event Listeners ---
  initApp();

  function initApp() {
    // 1. Initialize Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // 2. Browser SpeechSynthesis check
    if (!synth) {
      statusDot.className = 'status-dot offline';
      statusText.textContent = 'SpeechSynthesis Not Supported';
      alert('抱歉，您的瀏覽器不支援 Web Speech API (SpeechSynthesis)，請使用 Chrome, Safari, 或 Edge 瀏覽器。');
      return;
    }

    // 3. Load Settings from LocalStorage
    loadSettings();

    // 4. Load Voices (and attach events because Chrome loads voices asynchronously)
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }

    // 5. Setup Canvas dimensions
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Start wave animation loop
    animateWaveform();

    // 6. Bind UI Controls
    bindControls();

    // 7. Load History & Bookmarks
    renderHistory();
    renderSaved();

    // Trigger initial input event to count characters and initialize subtitle preview
    textInput.dispatchEvent(new Event('input'));
  }

  // --- Predefined API Voices ---
  const openaiVoices = [
    { name: 'alloy', label: 'Alloy (中性 - 均衡流暢)' },
    { name: 'echo', label: 'Echo (男聲 - 暖男音色)' },
    { name: 'fable', label: 'Fable (男聲 - 說書敘事)' },
    { name: 'onyx', label: 'Onyx (男聲 - 磁性渾厚)' },
    { name: 'nova', label: 'Nova (女聲 - 活潑明快)' },
    { name: 'shimmer', label: 'Shimmer (女聲 - 溫柔細膩)' }
  ];

  const elevenlabsVoices = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', label: 'Rachel (女聲 - 甜美日常)' },
    { id: 'AZnzlk1XhkjNs5lCWBOG', name: 'Domi', label: 'Domi (女聲 - 專業播報)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', label: 'Bella (女聲 - 溫柔旁白)' },
    { id: 'ErXwobaYiN019vkySvjV', name: 'Antoni', label: 'Antoni (男聲 - 深情磁性)' },
    { id: 'TxGEqn7nUa6kb86xUsIP', name: 'Josh', label: 'Josh (男聲 - 陽光開朗)' },
    { id: 'pNInz6obpgq5epa5UR3f', name: 'Adam', label: 'Adam (男聲 - 沉穩商務)' }
  ];

  // --- Voice Loading & Filtering ---
  function loadVoices() {
    voices = synth.getVoices();
    
    // Populate voices dropdown based on filter
    populateVoiceSelect();
  }

  function populateVoiceSelect() {
    const selectedVoiceName = voiceSelect.value || localStorage.getItem('tts-voice');
    voiceSelect.innerHTML = '';

    // If using OpenAI API
    if (currentEngine === 'openai') {
      openaiVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.name;
        option.textContent = voice.label;
        if (voice.name === selectedVoiceName) option.selected = true;
        voiceSelect.appendChild(option);
      });
      if (!voiceSelect.value && openaiVoices.length > 0) {
        voiceSelect.value = 'nova';
      }
      return;
    }

    // If using ElevenLabs API
    if (currentEngine === 'elevenlabs') {
      elevenlabsVoices.forEach(voice => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.label;
        if (voice.id === selectedVoiceName) option.selected = true;
        voiceSelect.appendChild(option);
      });
      if (!voiceSelect.value && elevenlabsVoices.length > 0) {
        voiceSelect.value = '21m00Tcm4TlvDq8ikWAM';
      }
      return;
    }

    // Filter local voices based on selected filter tag
    const filteredVoices = voices.filter(voice => {
      if (currentLanguageFilter === 'all') return true;
      if (currentLanguageFilter === 'zh') return voice.lang.startsWith('zh') || voice.lang.includes('CHT') || voice.lang.includes('CHS');
      if (currentLanguageFilter === 'en') return voice.lang.startsWith('en');
      if (currentLanguageFilter === 'ja') return voice.lang.startsWith('ja');
      return true;
    });

    if (filteredVoices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '此類別無可用語音角色';
      option.disabled = true;
      voiceSelect.appendChild(option);
      return;
    }

    filteredVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.name;
      
      // Enhance voice label display
      let localName = voice.name;
      if (voice.name.includes('Tingting')) localName = '婷婷 (zh-CN) - 國語女聲';
      else if (voice.name.includes('Mei-Jia')) localName = '美佳 (zh-TW) - 台灣女聲';
      else if (voice.name.includes('Sinji')) localName = '仙姬 (zh-HK) - 粵語女聲';
      else if (voice.name.includes('Yating')) localName = '雅婷 (zh-TW) - 台灣女聲';
      else if (voice.name.includes('Samantha')) localName = 'Samantha (en-US) - English Female';
      else if (voice.name.includes('Daniel')) localName = 'Daniel (en-GB) - English Male';
      else if (voice.name.includes('Kyoko')) localName = 'Kyoko (ja-JP) - 日本語女声';
      else if (voice.name.includes('Otoya')) localName = 'Otoya (ja-JP) - 日本語男声';
      else {
        localName = `${voice.name} (${voice.lang})`;
      }

      option.textContent = `${localName} ${voice.localService ? '• 本地' : ''}`;
      
      if (voice.name === selectedVoiceName) {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });

    // If no matching voice is selected, auto-select the best default
    if (!voiceSelect.value && filteredVoices.length > 0) {
      const defaultZh = filteredVoices.find(v => v.lang.includes('TW') || v.lang.includes('HK') || v.lang.includes('CN'));
      if (defaultZh) {
        voiceSelect.value = defaultZh.name;
      } else {
        voiceSelect.value = filteredVoices[0].name;
      }
    }
  }

  // --- Settings & LocalStorage Handling ---
  function saveSettings() {
    localStorage.setItem('tts-rate', sliderRate.value);
    localStorage.setItem('tts-pitch', sliderPitch.value);
    localStorage.setItem('tts-volume', sliderVolume.value);
    localStorage.setItem('tts-voice', voiceSelect.value);
    localStorage.setItem('tts-autoread', toggleAutoread.checked ? 'true' : 'false');
    localStorage.setItem('tts-theme', document.documentElement.getAttribute('data-theme'));
    localStorage.setItem('tts-engine', currentEngine);
    localStorage.setItem('tts-openai-key', openaiKey.value);
    localStorage.setItem('tts-elevenlabs-key', elevenlabsKey.value);
  }

  function loadSettings() {
    if (localStorage.getItem('tts-rate')) {
      sliderRate.value = localStorage.getItem('tts-rate');
      valRate.textContent = `${sliderRate.value}x`;
    }
    if (localStorage.getItem('tts-pitch')) {
      sliderPitch.value = localStorage.getItem('tts-pitch');
      valPitch.textContent = sliderPitch.value;
    }
    if (localStorage.getItem('tts-volume')) {
      sliderVolume.value = localStorage.getItem('tts-volume');
      updateVolumeUI(parseFloat(sliderVolume.value));
    }
    if (localStorage.getItem('tts-autoread')) {
      toggleAutoread.checked = localStorage.getItem('tts-autoread') === 'true';
    }
    
    currentEngine = localStorage.getItem('tts-engine') || 'local';
    engineSelect.value = currentEngine;
    updateApiUiState();

    openaiKey.value = localStorage.getItem('tts-openai-key') || '';
    elevenlabsKey.value = localStorage.getItem('tts-elevenlabs-key') || '';

    const savedTheme = localStorage.getItem('tts-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  // Helper to toggle API Card visibility based on selected engine
  function updateApiUiState() {
    if (currentEngine === 'local') {
      apiCard.style.display = 'none';
      langChips.parentElement.style.display = 'flex'; // show lang chips
      btnDownload.disabled = true;
    } else {
      apiCard.style.display = 'block';
      langChips.parentElement.style.display = 'none'; // hide lang chips for API engines
      
      if (currentEngine === 'openai') {
        groupOpenaiKey.style.display = 'flex';
        groupElevenlabsKey.style.display = 'none';
      } else if (currentEngine === 'elevenlabs') {
        groupOpenaiKey.style.display = 'none';
        groupElevenlabsKey.style.display = 'flex';
      }
    }
    // Update voice select options
    populateVoiceSelect();
  }

  function updateVolumeUI(volume) {
    valVolume.textContent = `${Math.round(volume * 100)}%`;
    if (volume === 0) {
      volumeIcon.setAttribute('data-lucide', 'volume-x');
    } else if (volume < 0.4) {
      volumeIcon.setAttribute('data-lucide', 'volume');
    } else if (volume < 0.7) {
      volumeIcon.setAttribute('data-lucide', 'volume-1');
    } else {
      volumeIcon.setAttribute('data-lucide', 'volume-2');
    }
    if (window.lucide) {
      window.lucide.createIcons({ attrs: { id: 'volume-icon', class: 'slider-icon' } });
    }
  }

  // --- Event Bindings ---
  function bindControls() {
    // Textarea changes
    textInput.addEventListener('input', () => {
      const count = textInput.value.length;
      currentCharCount.textContent = count;

      // Update subtitle preview immediately
      updateSubtitlePreview();

      if (toggleAutoread.checked) {
        triggerAutoRead();
      }
    });

    // Theme Toggle
    themeToggle.addEventListener('click', () => {
      playClickSound(1000, 0.08);
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      saveSettings();
    });

    // Sliders
    sliderRate.addEventListener('input', () => {
      valRate.textContent = `${sliderRate.value}x`;
      saveSettings();
      if (apiAudio) {
        apiAudio.playbackRate = parseFloat(sliderRate.value);
      }
    });

    sliderPitch.addEventListener('input', () => {
      valPitch.textContent = sliderPitch.value;
      saveSettings();
    });

    sliderVolume.addEventListener('input', () => {
      const val = parseFloat(sliderVolume.value);
      updateVolumeUI(val);
      saveSettings();
      if (apiAudio) {
        apiAudio.volume = val;
      }
    });
    
    // Play sound click on sliders release
    [sliderRate, sliderPitch, sliderVolume].forEach(slider => {
      slider.addEventListener('change', () => {
        playClickSound(600, 0.04);
      });
    });

    voiceSelect.addEventListener('change', () => {
      playClickSound(700, 0.06);
      saveSettings();
      // If playing, restart with new voice
      if (isPlaying) {
        if (currentEngine === 'local') {
          restartPlaybackFromCurrent();
        } else {
          stopPlayback();
          setTimeout(startPlayback, 100);
        }
      }
    });

    // Language Filter Chips
    langChips.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip')) {
        playClickSound(900, 0.05);
        langChips.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        currentLanguageFilter = e.target.getAttribute('data-lang');
        populateVoiceSelect();
      }
    });

    // Main Control Buttons
    btnPlayPause.addEventListener('click', handlePlayPauseClick);
    btnStop.addEventListener('click', () => {
      playClickSound(400, 0.1);
      stopPlayback();
    });
    btnPrev.addEventListener('click', () => {
      playClickSound(800, 0.05);
      jumpPrev();
    });
    btnNext.addEventListener('click', () => {
      playClickSound(800, 0.05);
      jumpNext();
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // If user is typing in inputs or textarea, ignore simple keys
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
        // Option/Alt or Cmd/Ctrl shortcuts
        if (e.metaKey || e.ctrlKey || e.altKey) {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            playClickSound(800, 0.05);
            jumpPrev();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            playClickSound(800, 0.05);
            jumpNext();
          }
        }
        return;
      }
      
      // If focus is not in textarea
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playClickSound(800, 0.05);
        jumpPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playClickSound(800, 0.05);
        jumpNext();
      } else if (e.key === ' ') {
        e.preventDefault();
        handlePlayPauseClick();
      }
    });

    // Toolbar Actions
    btnClear.addEventListener('click', () => {
      playClickSound(400, 0.08);
      textInput.value = '';
      currentCharCount.textContent = '0';
      stopPlayback();
      clearSubtitles();
    });

    btnPaste.addEventListener('click', async () => {
      playClickSound(800, 0.05);
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
          alert('瀏覽器安全性限制：在目前的瀏覽方式下（例如直接開啟 HTML 檔案使用 file:// 協定），不支援直接讀取剪貼簿。請使用鍵盤快速鍵 (Cmd+V 或 Ctrl+V) 進行貼上！');
          return;
        }
        const text = await navigator.clipboard.readText();
        if (text) {
          const cleanedText = cleanTextIntelligently(text);
          textInput.value = cleanedText;
          textInput.dispatchEvent(new Event('input'));
          showStatusFeedback('已智慧過濾連結與雜訊文字！');
        }
      } catch (err) {
        alert('無法讀取剪貼簿，請手動貼上！');
      }
    });

    // Native Paste Event Listener for TextInput (Command+V / Control+V)
    textInput.addEventListener('paste', (e) => {
      // Get pasted text from clipboard
      e.preventDefault();
      const pastedText = (e.clipboardData || window.clipboardData).getData('text');
      
      // Clean the text
      const cleanedText = cleanTextIntelligently(pastedText);
      
      // Insert the cleaned text at the current cursor position
      const start = textInput.selectionStart;
      const end = textInput.selectionEnd;
      const originalText = textInput.value;
      const before = originalText.substring(0, start);
      const after = originalText.substring(end);
      
      textInput.value = before + cleanedText + after;
      
      // Put cursor after the inserted text
      textInput.selectionStart = textInput.selectionEnd = start + cleanedText.length;
      
      // Trigger input event to update characters count, subtitles, etc.
      textInput.dispatchEvent(new Event('input'));
      
      // Show feedback in indicator
      showStatusFeedback('已智慧過濾連結與雜訊文字！');
    });

    // Dialog Modal triggers
    btnSample.addEventListener('click', () => {
      playClickSound(800, 0.05);
      sampleDialog.showModal();
    });

    btnCloseModal.addEventListener('click', () => {
      playClickSound(500, 0.05);
      sampleDialog.close();
    });

    // Sample list item clicks
    sampleItems.forEach(item => {
      item.addEventListener('click', () => {
        playClickSound(900, 0.06);
        const text = item.getAttribute('data-text');
        textInput.value = text;
        currentCharCount.textContent = text.length;
        sampleDialog.close();
        
        // Trigger speech or preview
        textInput.dispatchEvent(new Event('input'));
        
        // Auto-play the sample
        stopPlayback();
        setTimeout(startPlayback, 100);
      });
    });

    // Sidebar tab buttons
    tabHistory.addEventListener('click', () => switchTab('history'));
    tabSaved.addEventListener('click', () => switchTab('saved'));

    // Sidebar Clear History & Save Current
    btnClearHistory.addEventListener('click', () => {
      playClickSound(300, 0.1, 'sawtooth');
      if (confirm('確定要清除所有歷史紀錄嗎？')) {
        localStorage.setItem('tts-history', JSON.stringify([]));
        renderHistory();
      }
    });

    btnSaveCurrent.addEventListener('click', () => {
      playClickSound(1000, 0.07);
      const text = textInput.value.trim();
      if (!text) {
        alert('請先輸入一些文字再進行收藏！');
        return;
      }
      saveSnippet(text);
    });

    // Checkbox autoread touch event (for Apple TTS activation)
    toggleAutoread.addEventListener('change', () => {
      playClickSound(900, 0.05);
      saveSettings();
      // Unlock AudioContext & Synth for mobile iOS
      if (toggleAutoread.checked) {
        unlockAudio();
      }
    });

    // Engine select listener
    engineSelect.addEventListener('change', () => {
      playClickSound(800, 0.05);
      currentEngine = engineSelect.value;
      updateApiUiState();
      saveSettings();
      stopPlayback();
      cleanupApiAudio(true);
      updateSubtitlePreview();
    });

    // API Key input listeners to save keys
    openaiKey.addEventListener('input', () => {
      saveSettings();
    });
    elevenlabsKey.addEventListener('input', () => {
      saveSettings();
    });

    // Toggle Password Visibility
    document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
      btn.addEventListener('click', () => {
        playClickSound(700, 0.05);
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        const icon = btn.querySelector('i');
        
        if (input.type === 'password') {
          input.type = 'text';
          if (icon) icon.setAttribute('data-lucide', 'eye-off');
        } else {
          input.type = 'password';
          if (icon) icon.setAttribute('data-lucide', 'eye');
        }
        
        if (window.lucide) {
          window.lucide.createIcons({ container: btn });
        }
      });
    });

    // Guide Modal triggers
    btnGuideModal.addEventListener('click', () => {
      playClickSound(800, 0.05);
      guideDialog.showModal();
    });

    btnCloseGuide.addEventListener('click', () => {
      playClickSound(500, 0.05);
      guideDialog.close();
    });

    // Download Button handler
    btnDownload.addEventListener('click', () => {
      if (currentEngine !== 'local' && apiChunks.length > 0) {
        downloadMergedAudio();
      }
    });
  }

  // Mobile Web Speech Unlock Helper
  function unlockAudio() {
    try {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      synth.speak(u);
    } catch (e) {}
  }

  // Switch tab utility
  function switchTab(tabName) {
    playClickSound(750, 0.03);
    if (tabName === 'history') {
      tabHistory.classList.add('active');
      tabSaved.classList.remove('active');
      tabContentHistory.classList.add('active');
      tabContentSaved.classList.remove('active');
    } else {
      tabHistory.classList.remove('active');
      tabSaved.classList.add('active');
      tabContentHistory.classList.remove('active');
      tabContentSaved.classList.add('active');
    }
  }

  // --- TTS Queue & Playback Mechanics ---

  function handlePlayPauseClick() {
    playClickSound(800, 0.05);
    
    if (isPlaying) {
      if (isPaused) {
        resumePlayback();
      } else {
        pausePlayback();
      }
    } else {
      startPlayback();
    }
  }

  function triggerAutoRead() {
    clearTimeout(autoReadTimeout);
    autoReadTimeout = setTimeout(() => {
      const text = textInput.value.trim();
      if (text) {
        startPlayback();
      }
    }, 1000); // 1-second debounce
  }

  // Parse text into sentences
  function splitTextIntoSentences(text) {
    if (!text.trim()) return [];
    
    // Regular expression to match sentences with their ending punctuations
    // Supports Traditional/Simplified Chinese and English/Japanese punctuation
    const matches = text.match(/[^。！？：；.!?;\n\r]+[。！？：；.!?;\n\r]*/g);
    
    if (!matches) return [text];
    
    return matches
      .map(sentence => sentence.trim())
      .filter(Boolean);
  }

  async function startPlayback() {
    const text = textInput.value.trim();
    if (!text) {
      alert('請先輸入需要發音的文字！');
      return;
    }

    // Cancel anything currently playing
    if (synth && synth.speaking) {
      synth.cancel();
    }
    if (apiAudio) {
      apiAudio.pause();
    }

    // Save to history
    addToHistory(text);

    if (currentEngine === 'local') {
      currentChunks = splitTextIntoChunks(text, 1000);
      if (currentChunks.length === 0) return;

      isPlaying = true;
      isPaused = false;
      currentChunkIndex = 0;

      btnStop.disabled = false;
      btnPrev.disabled = false;
      btnNext.disabled = false;
      waveformOverlay.classList.add('hidden');

      playNextChunk();
    } else {
      // API speech engine
      const voiceVal = voiceSelect.value;
      
      // Check if we can reuse cache
      const isCached = (
        text === lastSynthesizedText &&
        voiceVal === lastSynthesizedVoice &&
        currentEngine === lastSynthesizedEngine &&
        apiChunks.length > 0 &&
        apiBlobs.length > 0 &&
        apiBlobs.every(b => b !== null)
      );

      isPlaying = true;
      isPaused = false;
      btnStop.disabled = false;
      btnPrev.disabled = false;
      btnNext.disabled = false;
      waveformOverlay.classList.add('hidden');

      if (isCached) {
        apiCurrentChunkIndex = 0;
        playApiChunk(0);
      } else {
        // Clean cache
        cleanupApiAudio(true);

        lastSynthesizedText = text;
        lastSynthesizedVoice = voiceVal;
        lastSynthesizedEngine = currentEngine;

        // Split text
        const maxChunkSize = currentEngine === 'openai' ? 3000 : 4000;
        apiChunks = splitTextIntoChunks(text, maxChunkSize);
        apiBlobs = new Array(apiChunks.length).fill(null);
        apiAudioUrls = new Array(apiChunks.length).fill(null);
        apiPrefetchPromises = new Array(apiChunks.length).fill(null);
        apiCurrentChunkIndex = 0;

        playApiChunk(0);
      }
    }
  }

  function splitTextIntoChunks(text, maxChunkSize = 4000) {
    const sentences = splitTextIntoSentences(text);
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (sentence.length > maxChunkSize) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        // Force split when a single sentence exceeds the chunk size limit
        let temp = sentence;
        while (temp.length > maxChunkSize) {
          chunks.push(temp.substring(0, maxChunkSize));
          temp = temp.substring(maxChunkSize);
        }
        currentChunk = temp;
      } else if ((currentChunk + sentence).length > maxChunkSize) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    return chunks;
  }

  function setApiLoadingProgress(current, total) {
    indicatorText.textContent = `正在進行高品質語音合成（第 ${current}/${total} 段），請稍候...`;
    waveformOverlay.querySelector('span').textContent = `高品質語音生成中（${current}/${total}）...`;
  }

  async function fetchSingleChunkApiSpeech(chunkText) {
    if (currentEngine === 'openai') {
      const key = openaiKey.value.trim();
      if (!key) {
        throw new Error('請輸入 OpenAI API 金鑰！');
      }
      
      const selectedVoice = voiceSelect.value || 'nova';
      
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: chunkText,
          voice: selectedVoice,
          response_format: 'mp3'
        })
      });
      
      if (!response.ok) {
        let errMsg = `OpenAI API 錯誤 (狀態碼 ${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.error?.message) {
            errMsg += `: ${errData.error.message}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }
      
      return await response.blob();
    } else if (currentEngine === 'elevenlabs') {
      const key = elevenlabsKey.value.trim();
      if (!key) {
        throw new Error('請輸入 ElevenLabs API 金鑰！');
      }
      
      const voiceId = voiceSelect.value || '21m00Tcm4TlvDq8ikWAM';
      
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text: chunkText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });
      
      if (!response.ok) {
        let errMsg = `ElevenLabs API 錯誤 (狀態碼 ${response.status})`;
        try {
          const errData = await response.json();
          if (errData?.detail?.message) {
            errMsg += `: ${errData.detail.message}`;
          }
        } catch (_) {}
        throw new Error(errMsg);
      }
      
      return await response.blob();
    }
    
    throw new Error('未定義的 API 語音引擎');
  }

  async function playApiChunk(index, startProgress = 0) {
    if (!isPlaying) return;
    if (index >= apiChunks.length) {
      stopPlayback();
      return;
    }

    apiCurrentChunkIndex = index;

    // Check if we have the blob for this chunk
    if (apiBlobs[index]) {
      // Play from cache
      startPlayingAudioElement(index, startProgress);
      // Pre-fetch next chunk
      prefetchApiChunk(index + 1);
    } else {
      // Fetch now
      setApiLoadingState(true);
      setApiLoadingProgress(index + 1, apiChunks.length);

      try {
        let fetchPromise = apiPrefetchPromises[index];
        if (!fetchPromise) {
          fetchPromise = fetchSingleChunkApiSpeech(apiChunks[index]);
          apiPrefetchPromises[index] = fetchPromise;
        }
        
        const blob = await fetchPromise;
        apiBlobs[index] = blob;
        apiAudioUrls[index] = URL.createObjectURL(blob);
        
        setApiLoadingState(false);
        startPlayingAudioElement(index, startProgress);
        
        // Pre-fetch next chunk
        prefetchApiChunk(index + 1);
      } catch (err) {
        console.error(`API chunk ${index} fetch error:`, err);
        alert(err.message || '語音合成失敗！請確認您的 API Key 與網路連線。');
        setApiLoadingState(false);
        stopPlayback();
      }
    }
  }

  function prefetchApiChunk(index) {
    if (index >= apiChunks.length) return;
    if (apiBlobs[index] || apiPrefetchPromises[index]) return; // Already fetched or fetching

    // Start fetching in the background
    apiPrefetchPromises[index] = fetchSingleChunkApiSpeech(apiChunks[index])
      .then(blob => {
        apiBlobs[index] = blob;
        apiAudioUrls[index] = URL.createObjectURL(blob);
        return blob;
      })
      .catch(err => {
        console.error(`Background prefetch error for chunk ${index}:`, err);
        apiPrefetchPromises[index] = null;
      });
  }

  function startPlayingAudioElement(index, startProgress = 0) {
    if (!isPlaying) return;
    
    // Cleanup active audio if any (pause it)
    if (apiAudio) {
      try { apiAudio.pause(); } catch(e){}
    }

    const url = apiAudioUrls[index];
    apiAudio = new Audio(url);
    
    apiAudio.volume = parseFloat(sliderVolume.value);
    apiAudio.playbackRate = parseFloat(sliderRate.value);

    waveTargetActivity = 1.0;
    
    setPlayPauseButtonState('playing');
    btnStop.disabled = false;
    btnPrev.disabled = false;
    btnNext.disabled = false;
    btnDownload.disabled = false;
    waveformOverlay.classList.add('hidden');
    speechIndicator.classList.add('playing');

    // Setup sentence split for highlight
    const text = textInput.value.trim();
    currentChunks = splitTextIntoSentences(text);
    renderSubtitleProgress();

    // Setup cumulative characters for subtitle mapping
    const chunkLengths = currentChunks.map(c => c.length);
    const totalLength = chunkLengths.reduce((sum, len) => sum + len, 0);
    let cumulative = 0;
    const cumulativePercentages = chunkLengths.map(len => {
      cumulative += len;
      return totalLength > 0 ? cumulative / totalLength : 0;
    });

    // Calculate characters of chunks preceding this one
    let precedingChars = 0;
    for (let i = 0; i < index; i++) {
      precedingChars += apiChunks[i].length;
    }
    const currentChunkLength = apiChunks[index].length;

    // Apply start progress on load
    if (startProgress > 0) {
      const applyProgress = () => {
        const duration = apiAudio.duration;
        if (duration && !isNaN(duration)) {
          apiAudio.currentTime = startProgress * duration;
        }
      };
      apiAudio.addEventListener('loadedmetadata', applyProgress, { once: true });
      apiAudio.addEventListener('canplay', applyProgress, { once: true });
    }

    // Timeupdate listener
    apiAudio.ontimeupdate = () => {
      if (!apiAudio || apiAudio.paused || apiAudio.ended) return;
      
      const duration = apiAudio.duration;
      if (!duration || isNaN(duration)) return;
      
      const progress = apiAudio.currentTime / duration;
      const estimatedCharPos = precedingChars + progress * currentChunkLength;
      const overallProgress = totalLength > 0 ? estimatedCharPos / totalLength : 0;
      
      let targetIndex = 0;
      for (let i = 0; i < cumulativePercentages.length; i++) {
        if (overallProgress <= cumulativePercentages[i]) {
          targetIndex = i;
          break;
        }
        targetIndex = i;
      }
      
      if (currentChunkIndex !== targetIndex) {
        currentChunkIndex = targetIndex;
        indicatorText.textContent = `正在播放第 ${currentChunkIndex + 1}/${currentChunks.length} 句`;
        renderSubtitleProgress();
      }
    };

    apiAudio.onended = () => {
      // Transition to next chunk
      playApiChunk(index + 1);
    };

    apiAudio.onerror = (e) => {
      console.error(`API Audio Playback Error for chunk ${index}:`, e);
      alert('播放音訊時出錯！');
      stopPlayback();
    };

    apiAudio.play().catch(err => {
      console.error(`API Play Failed for chunk ${index}:`, err);
      alert('無法播放音訊，請再試一次！');
      stopPlayback();
    });
  }

  async function downloadMergedAudio() {
    playClickSound(1000, 0.08);

    // If some chunks aren't fetched yet, let's fetch them
    const missingIndices = [];
    for (let i = 0; i < apiChunks.length; i++) {
      if (!apiBlobs[i]) {
        missingIndices.push(i);
      }
    }

    if (missingIndices.length > 0) {
      // Show loading status for download compilation
      setApiLoadingState(true);
      indicatorText.textContent = `正在準備下載檔案，合成剩餘的語音段落...`;
      
      try {
        for (const idx of missingIndices) {
          let fetchPromise = apiPrefetchPromises[idx];
          if (!fetchPromise) {
            fetchPromise = fetchSingleChunkApiSpeech(apiChunks[idx]);
            apiPrefetchPromises[idx] = fetchPromise;
          }
          const blob = await fetchPromise;
          apiBlobs[idx] = blob;
          apiAudioUrls[idx] = URL.createObjectURL(blob);
        }
        setApiLoadingState(false);
      } catch (err) {
        console.error('Download preparation failed:', err);
        alert('準備下載檔案時，語音合成失敗！');
        setApiLoadingState(false);
        return;
      }
    }

    // Now merge all blobs
    const finalBlob = new Blob(apiBlobs, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echospeak-${Date.now()}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function setApiLoadingState(active) {
    if (active) {
      btnPlayPause.disabled = true;
      btnStop.disabled = true;
      btnDownload.disabled = true;
      playBtnText.textContent = '語音合成中...';
      indicatorText.textContent = '正在連線至 API 進行高品質語音合成，請稍候...';
      speechIndicator.classList.add('playing');
      waveformOverlay.classList.remove('hidden');
      waveformOverlay.querySelector('span').textContent = '高品質語音生成中，請稍候...';
      waveTargetActivity = 0.5;
    } else {
      btnPlayPause.disabled = false;
      btnStop.disabled = false;
      playBtnText.textContent = '播放語音';
      waveformOverlay.querySelector('span').textContent = '點擊下方播放開始合成語音';
    }
  }

  function cleanupApiAudio(full = false) {
    if (apiAudio) {
      try {
        apiAudio.pause();
      } catch (e) {}
      apiAudio = null;
    }
    if (full) {
      apiAudioUrls.forEach(url => {
        if (url) URL.revokeObjectURL(url);
      });
      apiAudioUrls = [];
      apiBlobs = [];
      apiChunks = [];
      apiPrefetchPromises = [];
      apiCurrentChunkIndex = 0;
      audioBlob = null;
      btnDownload.disabled = true;
    }
  }

  function playNextChunk() {
    if (!isPlaying) return;

    if (currentChunkIndex >= currentChunks.length) {
      stopPlayback();
      return;
    }

    const chunkText = currentChunks[currentChunkIndex];
    
    // Create new utterance
    currentUtterance = new SpeechSynthesisUtterance(chunkText);
    
    // Apply Settings
    const selectedVoiceName = voiceSelect.value;
    if (selectedVoiceName) {
      const v = voices.find(voice => voice.name === selectedVoiceName);
      if (v) currentUtterance.voice = v;
    }
    
    currentUtterance.rate = parseFloat(sliderRate.value);
    currentUtterance.pitch = parseFloat(sliderPitch.value);
    currentUtterance.volume = parseFloat(sliderVolume.value);

    // Event listeners
    currentUtterance.onstart = () => {
      if (!isPlaying) return;
      
      // Update speech indicators
      speechIndicator.classList.add('playing');
      indicatorText.textContent = `正在播放第 ${currentChunkIndex + 1}/${currentChunks.length} 句`;
      
      // Render subtitle highlight
      renderSubtitleProgress();
      
      // Turn up waveform visualizer activity
      waveTargetActivity = 1.0;
      
      // Set Pause icon
      setPlayPauseButtonState('playing');
    };

    currentUtterance.onend = () => {
      if (!isPlaying) return;
      
      currentChunkIndex++;
      playNextChunk();
    };

    currentUtterance.onerror = (e) => {
      // Note: 'interrupted' error is thrown when synth.cancel() or new speech starts, which is normal
      if (e.error !== 'interrupted') {
        console.error('TTS Utterance Error:', e);
        stopPlayback();
      }
    };

    // Speak!
    synth.speak(currentUtterance);
  }

  function pausePlayback() {
    if (!isPlaying || isPaused) return;
    
    if (currentEngine === 'local') {
      synth.pause();
    } else if (apiAudio) {
      apiAudio.pause();
    }
    
    isPaused = true;
    waveTargetActivity = 0.1; // Slow wave down
    setPlayPauseButtonState('paused');
    indicatorText.textContent = '暫停播放';
    speechIndicator.classList.remove('playing');
  }

  function resumePlayback() {
    if (!isPlaying || !isPaused) return;
    
    if (currentEngine === 'local') {
      synth.resume();
    } else if (apiAudio) {
      apiAudio.play().catch(err => console.error('API Audio Resume Failed:', err));
    }
    
    isPaused = false;
    waveTargetActivity = 1.0; // Wave active
    setPlayPauseButtonState('playing');
    indicatorText.textContent = `正在播放第 ${currentChunkIndex + 1}/${currentChunks.length} 句`;
    speechIndicator.classList.add('playing');
  }

  function stopPlayback() {
    isPlaying = false;
    isPaused = false;
    currentChunkIndex = 0;
    
    if (currentEngine === 'local') {
      synth.cancel();
    } else if (apiAudio) {
      apiAudio.pause();
      apiAudio.currentTime = 0;
    }
    
    btnStop.disabled = true;
    btnPrev.disabled = true;
    btnNext.disabled = true;
    waveformOverlay.classList.remove('hidden');
    
    // Wave to flat
    waveTargetActivity = 0;
    
    setPlayPauseButtonState('stopped');
    indicatorText.textContent = '準備就緒';
    speechIndicator.classList.remove('playing');
    
    // Clear subtitle highlight styling but keep sentences rendered
    renderSubtitleStopped();
  }

  function restartPlaybackFromCurrent() {
    synth.cancel();
    if (isPlaying) {
      isPaused = false;
      playNextChunk();
    }
  }

  // --- Navigation & Skipping Mechanics ---

  function jumpToSentenceIndex(targetIndex) {
    if (currentChunks.length === 0) return;
    
    // Clamp targetIndex
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= currentChunks.length) targetIndex = currentChunks.length - 1;

    // If not currently playing, start playing from this sentence
    if (!isPlaying) {
      const text = textInput.value.trim();
      if (!text) {
        alert('請先輸入需要發音的文字！');
        return;
      }
      
      addToHistory(text);
      isPlaying = true;
      isPaused = false;
      btnStop.disabled = false;
      btnPrev.disabled = false;
      btnNext.disabled = false;
      waveformOverlay.classList.add('hidden');
      
      if (currentEngine === 'local') {
        currentChunks = splitTextIntoChunks(text, 1000);
        currentChunkIndex = targetIndex;
        playNextChunk();
      } else {
        const voiceVal = voiceSelect.value;
        const isCached = (
          text === lastSynthesizedText &&
          voiceVal === lastSynthesizedVoice &&
          currentEngine === lastSynthesizedEngine &&
          apiChunks.length > 0 &&
          apiBlobs.length > 0 &&
          apiBlobs.every(b => b !== null)
        );
        
        if (isCached) {
          apiCurrentChunkIndex = 0;
          let targetCharPos = 0;
          for (let i = 0; i < targetIndex; i++) {
            targetCharPos += currentChunks[i].length;
          }
          
          let chunkIdx = 0;
          let precedingChars = 0;
          for (let i = 0; i < apiChunks.length; i++) {
            if (targetCharPos >= precedingChars && targetCharPos < precedingChars + apiChunks[i].length) {
              chunkIdx = i;
              break;
            }
            precedingChars += apiChunks[i].length;
            chunkIdx = i;
          }
          
          const localCharPos = targetCharPos - precedingChars;
          const progressInChunk = apiChunks[chunkIdx].length > 0 ? localCharPos / apiChunks[chunkIdx].length : 0;
          
          currentChunkIndex = targetIndex;
          playApiChunk(chunkIdx, progressInChunk);
        } else {
          cleanupApiAudio(true);
          lastSynthesizedText = text;
          lastSynthesizedVoice = voiceVal;
          lastSynthesizedEngine = currentEngine;
          
          const maxChunkSize = currentEngine === 'openai' ? 3000 : 4000;
          apiChunks = splitTextIntoChunks(text, maxChunkSize);
          apiBlobs = new Array(apiChunks.length).fill(null);
          apiAudioUrls = new Array(apiChunks.length).fill(null);
          apiPrefetchPromises = new Array(apiChunks.length).fill(null);
          
          currentChunks = splitTextIntoSentences(text);
          currentChunkIndex = targetIndex;
          
          let targetCharPos = 0;
          for (let i = 0; i < targetIndex; i++) {
            targetCharPos += currentChunks[i].length;
          }
          
          let chunkIdx = 0;
          let precedingChars = 0;
          for (let i = 0; i < apiChunks.length; i++) {
            if (targetCharPos >= precedingChars && targetCharPos < precedingChars + apiChunks[i].length) {
              chunkIdx = i;
              break;
            }
            precedingChars += apiChunks[i].length;
            chunkIdx = i;
          }
          
          const localCharPos = targetCharPos - precedingChars;
          const progressInChunk = apiChunks[chunkIdx].length > 0 ? localCharPos / apiChunks[chunkIdx].length : 0;
          
          playApiChunk(chunkIdx, progressInChunk);
        }
      }
      return;
    }

    // If already playing, perform quick jump
    if (currentEngine === 'local') {
      if (currentUtterance) {
        currentUtterance.onend = null;
        currentUtterance.onerror = null;
      }
      synth.cancel();
      currentChunkIndex = targetIndex;
      playNextChunk();
    } else {
      // API Engine Jump
      let targetCharPos = 0;
      for (let i = 0; i < targetIndex; i++) {
        targetCharPos += currentChunks[i].length;
      }
      
      let chunkIdx = 0;
      let precedingChars = 0;
      for (let i = 0; i < apiChunks.length; i++) {
        if (targetCharPos >= precedingChars && targetCharPos < precedingChars + apiChunks[i].length) {
          chunkIdx = i;
          break;
        }
        precedingChars += apiChunks[i].length;
        chunkIdx = i;
      }
      
      const localCharPos = targetCharPos - precedingChars;
      const progressInChunk = apiChunks[chunkIdx].length > 0 ? localCharPos / apiChunks[chunkIdx].length : 0;
      
      if (chunkIdx === apiCurrentChunkIndex) {
        if (apiAudio) {
          const duration = apiAudio.duration;
          if (duration && !isNaN(duration)) {
            apiAudio.currentTime = progressInChunk * duration;
          } else {
            apiAudio.addEventListener('loadedmetadata', () => {
              apiAudio.currentTime = progressInChunk * apiAudio.duration;
            }, { once: true });
          }
          currentChunkIndex = targetIndex;
          renderSubtitleProgress();
        }
      } else {
        if (apiAudio) {
          try { apiAudio.pause(); } catch(e){}
        }
        currentChunkIndex = targetIndex;
        playApiChunk(chunkIdx, progressInChunk);
      }
    }
  }

  function jumpPrev() {
    if (currentChunks && currentChunks.length > 0) {
      const prevIdx = currentChunkIndex - 1;
      if (prevIdx >= 0) {
        jumpToSentenceIndex(prevIdx);
      }
    }
  }

  function jumpNext() {
    if (currentChunks && currentChunks.length > 0) {
      const nextIdx = currentChunkIndex + 1;
      if (nextIdx < currentChunks.length) {
        jumpToSentenceIndex(nextIdx);
      }
    }
  }

  function updateSubtitlePreview() {
    if (isPlaying) return;
    const text = textInput.value.trim();
    if (!text) {
      clearSubtitles();
      return;
    }
    
    if (currentEngine === 'local') {
      currentChunks = splitTextIntoChunks(text, 1000);
    } else {
      currentChunks = splitTextIntoSentences(text);
    }
    renderSubtitleStopped();
  }

  // --- Subtitle Rendering & Highlighting ---

  function renderSubtitleProgress() {
    subtitleDisplay.innerHTML = '';
    
    currentChunks.forEach((chunk, index) => {
      const span = document.createElement('span');
      span.textContent = chunk + ' ';
      
      if (index < currentChunkIndex) {
        span.className = 'sentence-spoken';
      } else if (index === currentChunkIndex) {
        span.className = 'sentence-highlight';
      } else {
        span.className = 'sentence-pending';
      }
      
      // Make sentences clickable
      span.addEventListener('click', () => {
        playClickSound(900, 0.05);
        jumpToSentenceIndex(index);
      });
      
      subtitleDisplay.appendChild(span);
      
      // Auto-scroll the subtitle container to keep active sentence visible
      if (index === currentChunkIndex) {
        span.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  function renderSubtitleStopped() {
    if (currentChunks.length > 0) {
      subtitleDisplay.innerHTML = '';
      currentChunks.forEach((chunk, index) => {
        const span = document.createElement('span');
        span.textContent = chunk + ' ';
        span.className = 'sentence-pending';
        
        // Click to play from this sentence
        span.addEventListener('click', () => {
          playClickSound(900, 0.05);
          jumpToSentenceIndex(index);
        });
        
        subtitleDisplay.appendChild(span);
      });
    } else {
      clearSubtitles();
    }
  }

  function clearSubtitles() {
    subtitleDisplay.innerHTML = '<span class="subtitle-placeholder">播放語音時，這裡會以醒目方式即時顯示目前朗讀的句子。</span>';
    currentChunks = [];
  }

  // Change UI Play/Pause button style dynamically
  function setPlayPauseButtonState(state) {
    if (state === 'playing') {
      playIcon.setAttribute('data-lucide', 'pause');
      playBtnText.textContent = '暫停播放';
    } else if (state === 'paused') {
      playIcon.setAttribute('data-lucide', 'play');
      playBtnText.textContent = '繼續播放';
    } else {
      playIcon.setAttribute('data-lucide', 'play');
      playBtnText.textContent = '播放語音';
    }
    
    if (window.lucide) {
      window.lucide.createIcons({ attrs: { id: 'play-icon' } });
    }
  }

  // --- Canvas Audio Waveform Simulation ---
  
  function resizeCanvas() {
    // Get actual layout sizes
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  function animateWaveform() {
    animationFrameId = requestAnimationFrame(animateWaveform);
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Width and Height in CSS coordinates
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    
    // Smoothly transition wave activity
    waveCurrentActivity += (waveTargetActivity - waveCurrentActivity) * 0.1;
    
    // Background glow/gradient
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    // Let's draw 3 layered sine waves
    const wavesCount = 3;
    const colors = isDark ? [
      'rgba(139, 92, 246, 0.45)', // Violet
      'rgba(236, 72, 153, 0.35)',  // Pink
      'rgba(99, 102, 241, 0.2)'    // Indigo
    ] : [
      'rgba(99, 102, 241, 0.3)',
      'rgba(217, 70, 239, 0.25)',
      'rgba(79, 70, 229, 0.15)'
    ];

    for (let i = 0; i < wavesCount; i++) {
      ctx.beginPath();
      
      const speedOffset = (i + 1) * 0.05;
      const frequency = 0.015 - (i * 0.003);
      // Scale amplitude based on activity and wave layer
      const amplitude = waveCurrentActivity * (18 - (i * 4)) * (Math.sin(wavePhase * 0.5) * 0.3 + 0.8);
      
      ctx.moveTo(0, h / 2);
      
      for (let x = 0; x < w; x++) {
        // Compose waves
        const y = h / 2 + Math.sin(x * frequency + wavePhase * (1 + speedOffset)) * amplitude;
        ctx.lineTo(x, y);
      }
      
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2.5 - (i * 0.5);
      ctx.stroke();
    }
    
    // Flat line center reference (very subtle)
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(15, 23, 42, 0.03)';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Update wave phase
    // Rate slider controls the wave animation speed slightly too!
    const rateVal = parseFloat(sliderRate.value) || 1.0;
    wavePhase += 0.08 * (waveCurrentActivity > 0 ? rateVal : 0.2);
  }

  // --- History & Favorites Management ---

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('tts-history')) || [];
    } catch (e) {
      return [];
    }
  }

  function getSaved() {
    try {
      return JSON.parse(localStorage.getItem('tts-saved')) || [];
    } catch (e) {
      return [];
    }
  }

  function addToHistory(text) {
    if (!text.trim()) return;
    
    let history = getHistory();
    
    // Remove if duplicate to keep order clean
    history = history.filter(item => item.text !== text);
    
    // Add to start
    history.unshift({
      id: Date.now().toString(),
      text: text,
      timestamp: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      voice: voiceSelect.value
    });
    
    // Cap at 20 entries
    if (history.length > 20) {
      history.pop();
    }
    
    localStorage.setItem('tts-history', JSON.stringify(history));
    renderHistory();
  }

  function saveSnippet(text) {
    if (!text.trim()) return;
    
    const saved = getSaved();
    // Check duplicate
    if (saved.some(item => item.text === text)) {
      alert('此段文字已在您的收藏清單中！');
      return;
    }
    
    saved.unshift({
      id: Date.now().toString(),
      text: text,
      timestamp: new Date().toLocaleDateString('zh-TW'),
      voice: voiceSelect.value
    });
    
    localStorage.setItem('tts-saved', JSON.stringify(saved));
    renderSaved();
  }

  function renderHistory() {
    const history = getHistory();
    historyList.innerHTML = '';
    
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <i data-lucide="clock" class="empty-icon"></i>
          <p>尚無歷史紀錄，快來試試文字轉語音吧！</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ container: historyList });
      return;
    }
    
    history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';
      
      div.innerHTML = `
        <div class="item-text" title="點擊載入此文字">${escapeHTML(item.text)}</div>
        <div class="item-meta">
          <span>${item.timestamp} • ${item.voice.split(' ')[0]}</span>
          <div class="item-actions">
            <button class="item-btn play-btn" title="立刻播放" data-action="play">
              <i data-lucide="play-circle"></i>
            </button>
            <button class="item-btn save-btn" title="加入收藏" data-action="save">
              <i data-lucide="star"></i>
            </button>
            <button class="item-btn delete-btn" title="刪除歷史" data-action="delete">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </div>
      `;
      
      // Load on text click
      div.querySelector('.item-text').addEventListener('click', () => {
        loadListItemText(item.text, item.voice);
      });
      
      // Bind Action Buttons
      div.querySelector('[data-action="play"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playClickSound(800, 0.05);
        loadListItemText(item.text, item.voice);
        stopPlayback();
        setTimeout(startPlayback, 100);
      });
      
      div.querySelector('[data-action="save"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playClickSound(1000, 0.05);
        saveSnippet(item.text);
      });
      
      div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playClickSound(300, 0.08);
        deleteHistoryItem(item.id);
      });
      
      historyList.appendChild(div);
    });
    
    if (window.lucide) window.lucide.createIcons({ container: historyList });
  }

  function renderSaved() {
    const saved = getSaved();
    savedList.innerHTML = '';
    
    if (saved.length === 0) {
      savedList.innerHTML = `
        <div class="empty-state">
          <i data-lucide="folder-heart" class="empty-icon"></i>
          <p>尚無收藏片段，可點擊上方按鈕收藏當前文字。</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons({ container: savedList });
      return;
    }
    
    saved.forEach(item => {
      const div = document.createElement('div');
      div.className = 'list-item';
      
      div.innerHTML = `
        <div class="item-text" title="點擊載入此文字">${escapeHTML(item.text)}</div>
        <div class="item-meta">
          <span>${item.timestamp}</span>
          <div class="item-actions">
            <button class="item-btn play-btn" title="立刻播放" data-action="play">
              <i data-lucide="play-circle"></i>
            </button>
            <button class="item-btn delete-btn" title="取消收藏" data-action="delete">
              <i data-lucide="x-circle"></i>
            </button>
          </div>
        </div>
      `;
      
      // Load on text click
      div.querySelector('.item-text').addEventListener('click', () => {
        loadListItemText(item.text, item.voice);
      });
      
      // Bind Action Buttons
      div.querySelector('[data-action="play"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playClickSound(800, 0.05);
        loadListItemText(item.text, item.voice);
        stopPlayback();
        setTimeout(startPlayback, 100);
      });
      
      div.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
        e.stopPropagation();
        playClickSound(300, 0.08);
        deleteSavedItem(item.id);
      });
      
      savedList.appendChild(div);
    });
    
    if (window.lucide) window.lucide.createIcons({ container: savedList });
  }

  function loadListItemText(text, voiceName) {
    textInput.value = text;
    currentCharCount.textContent = text.length;
    
    // Try to restore voice if still available
    if (voiceName) {
      const voiceExists = Array.from(voiceSelect.options).some(o => o.value === voiceName);
      if (voiceExists) {
        voiceSelect.value = voiceName;
      }
    }
    
    textInput.dispatchEvent(new Event('input'));
  }

  function deleteHistoryItem(id) {
    let history = getHistory();
    history = history.filter(item => item.id !== id);
    localStorage.setItem('tts-history', JSON.stringify(history));
    renderHistory();
  }

  function deleteSavedItem(id) {
    let saved = getSaved();
    saved = saved.filter(item => item.id !== id);
    localStorage.setItem('tts-saved', JSON.stringify(saved));
    renderSaved();
  }

  // --- Helper Functions ---
  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showStatusFeedback(message) {
    clearTimeout(feedbackTimeout);
    
    // Temporarily show message in indicator
    indicatorText.textContent = message;
    
    // Style indicatorText for feedback
    indicatorText.style.color = 'var(--accent-secondary)';
    
    feedbackTimeout = setTimeout(() => {
      if (indicatorText.textContent === message) {
        indicatorText.textContent = isPlaying ? `正在播放第 ${currentChunkIndex + 1}/${currentChunks.length} 句` : '準備就緒';
        indicatorText.style.color = '';
      }
    }, 3000);
  }

  function cleanTextIntelligently(text) {
    if (!text) return '';

    let cleaned = text;

    // 0. Handle Markdown headers like ## Heading -> "Heading"
    cleaned = cleaned.replace(/(?:^|\r?\n)#{1,6}\s+/g, '\n');

    // 0b. Handle emphasis symbols, e.g. **bold**, __bold__, *italic*, _italic_, ~~strikethrough~~, `code`
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
    cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
    cleaned = cleaned.replace(/~~([^~]+)~~/g, '$1');
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');

    // 0c. Replace double dashes -- with a natural comma pause
    cleaned = cleaned.replace(/--+/g, '，');

    // 1. Handle Markdown links like [Google](https://google.com) -> "Google"
    cleaned = cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1');

    // 2. Handle HTML links like <a href="...">Google</a> -> "Google"
    cleaned = cleaned.replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1');

    // 3. Handle raw URLs (http:// or https://)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    cleaned = cleaned.replace(urlRegex, (url) => {
      try {
        let cleanUrl = url.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]+$/, '');
        const urlObj = new URL(cleanUrl);
        let hostname = urlObj.hostname.toLowerCase();
        
        if (hostname.startsWith('www.')) {
          hostname = hostname.substring(4);
        }
        
        const domainMap = {
          'youtube.com': 'YouTube 影片',
          'youtu.be': 'YouTube 影片',
          'github.com': 'GitHub 頁面',
          'facebook.com': '臉書',
          'fb.com': '臉書',
          'instagram.com': 'IG',
          'wikipedia.org': '維基百科',
          'medium.com': 'Medium 文章',
          'google.com': 'Google',
          'twitter.com': '推特',
          'x.com': '推特',
          'reddit.com': 'Reddit 論壇',
          'apple.com': '蘋果官網',
          'microsoft.com': '微軟官網',
          'amazon.com': '亞馬遜'
        };
        
        if (domainMap[hostname]) {
          return `（${domainMap[hostname]}連結）`;
        }
        
        return `（${hostname} 網頁連結）`;
      } catch (e) {
        return '（網頁連結）';
      }
    });

    // 4. Clean up article citation brackets, e.g. [1], [2], [13], [1a]
    cleaned = cleaned.replace(/\[\d+[a-zA-Z]?\]/g, '');

    // 5. Clean up picture/media descriptors often found in copied news
    cleaned = cleaned.replace(/[\(（]圖[／\/][^\)）]+[\)）]/g, '');
    cleaned = cleaned.replace(/[\(（]示意圖[／\/][^\)）]+[\)）]/g, '');
    cleaned = cleaned.replace(/[\(（]圖片來源[：:][^\)）]+[\)）]/g, '');

    // 6. Replace divider lines like ====, ----, ____, ***** with a clean break/comma
    cleaned = cleaned.replace(/([=\-_*])\1{2,}/g, '，');

    // 7. Simplify repeated punctuation marks (e.g., !!! -> !, ??? -> ?)
    cleaned = cleaned.replace(/!{2,}/g, '！');
    cleaned = cleaned.replace(/\?{2,}/g, '？');
    cleaned = cleaned.replace(/！{2,}/g, '！');
    cleaned = cleaned.replace(/？{2,}/g, '？');
    cleaned = cleaned.replace(/~{2,}/g, '～');

    // 8. Strip decorative leading symbols or layout tags
    cleaned = cleaned.replace(/(?:^|\s)[◆■●▲▼◀▶★☆◆◆◆◆●●●●◆◇◇◇■□▲△▼▽★☆◆]\s?/g, ' ');

    // 9. Clean up whitespace
    cleaned = cleaned.replace(/ {2,}/g, ' ');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    return cleaned.trim();
  }
});
