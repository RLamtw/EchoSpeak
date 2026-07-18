// EchoSpeak E-Reader Controller
document.addEventListener('DOMContentLoaded', () => {
  const synth = window.speechSynthesis;
  
  // State
  let currentChapterId = 'ch1';
  let activeParagraphId = null;
  let isPlaying = false;
  let isPaused = false;
  let currentUtterance = null;
  let autoplayEnabled = true;
  let speedRate = 1.0;
  let currentViewMode = 'bilingual'; // 'bilingual', 'de', 'zh'
  let selectedZhVoice = null;
  let selectedDeVoice = null;
  
  // UI Elements
  const bookTitleEl = document.getElementById('book-title');
  const bookAuthorEl = document.getElementById('book-author');
  const chapterListEl = document.getElementById('chapter-list');
  const readingContainer = document.getElementById('reading-container');
  
  const voiceSelectZh = document.getElementById('voice-select-zh');
  const voiceSelectDe = document.getElementById('voice-select-de');
  const sliderRate = document.getElementById('slider-rate');
  const valRate = document.getElementById('val-rate');
  const themeToggle = document.getElementById('theme-toggle');
  
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const playIcon = document.getElementById('play-icon');
  
  const footerTitle = document.getElementById('footer-title');
  const footerChapter = document.getElementById('footer-chapter');
  const progressBarFill = document.getElementById('progress-fill');
  const progressTimeCurrent = document.getElementById('progress-time-current');
  const progressTimeTotal = document.getElementById('progress-time-total');
  
  const toggleAutoplay = document.getElementById('toggle-autoplay');
  const viewBtns = document.querySelectorAll('.view-btn');
  
  // Initialize
  initReader();

  function initReader() {
    // Load lucide icons
    if (window.lucide) {
      window.lucide.createIcons();
    }
    
    // Load Book Meta Info
    if (window.bookData) {
      bookTitleEl.textContent = window.bookData.title;
      bookAuthorEl.textContent = window.bookData.author;
      renderSidebarChapters();
      loadChapter(currentChapterId);
    }
    
    // Setup Settings (Theme & Speed)
    loadSettings();
    
    // Load System Voices
    loadVoices();
    if (synth && synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
    
    // Event Bindings
    bindEvents();
    
    // Restore reading progress from localStorage
    restoreProgress();
  }

  // Render Chapters Sidebar
  function renderSidebarChapters() {
    chapterListEl.innerHTML = '';
    window.bookData.chapters.forEach(ch => {
      const item = document.createElement('div');
      item.className = 'chapter-item';
      item.setAttribute('data-id', ch.id);
      if (ch.id === currentChapterId) {
        item.classList.add('active');
      }
      
      const titleSpan = document.createElement('span');
      titleSpan.textContent = ch.title.split(' (')[0]; // Simple name
      
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
          loadChapter(ch.id);
        }
      });
      
      chapterListEl.appendChild(item);
    });
  }

  // Load Chapter Text
  function loadChapter(chapterId) {
    currentChapterId = chapterId;
    const chapter = window.bookData.chapters.find(ch => ch.id === chapterId);
    if (!chapter) return;
    
    readingContainer.innerHTML = '';
    
    // Render Header meta inside main container
    const metaDiv = document.createElement('div');
    metaDiv.className = 'book-meta';
    
    const h2 = document.createElement('h2');
    h2.textContent = chapter.title;
    
    const authorSpan = document.createElement('span');
    authorSpan.className = 'author';
    authorSpan.textContent = window.bookData.author;
    
    metaDiv.appendChild(h2);
    metaDiv.appendChild(authorSpan);
    readingContainer.appendChild(metaDiv);
    
    // Render Paragraphs
    chapter.paragraphs.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'paragraph-card';
      card.id = p.id;
      card.setAttribute('data-index', idx);
      
      const deText = document.createElement('p');
      deText.className = 'text-de';
      deText.textContent = p.de;
      
      const zhText = document.createElement('p');
      zhText.className = 'text-zh';
      zhText.textContent = p.zh;
      
      card.appendChild(deText);
      card.appendChild(zhText);
      
      // Hover Actions
      const hoverActions = document.createElement('div');
      hoverActions.className = 'card-hover-actions';
      
      const btnPlayZh = document.createElement('button');
      btnPlayZh.className = 'action-btn-sm';
      btnPlayZh.title = '朗讀中文 (Taiwanese Mandarin)';
      btnPlayZh.innerHTML = '<i data-lucide="volume-2" style="width: 14px; height: 14px;"></i>';
      btnPlayZh.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(p.id, 'zh');
      });
      
      const btnPlayDe = document.createElement('button');
      btnPlayDe.className = 'action-btn-sm';
      btnPlayDe.title = '朗讀德文 (German)';
      btnPlayDe.innerHTML = '<i data-lucide="languages" style="width: 14px; height: 14px;"></i>';
      btnPlayDe.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(p.id, 'de');
      });
      
      hoverActions.appendChild(btnPlayZh);
      hoverActions.appendChild(btnPlayDe);
      card.appendChild(hoverActions);
      
      // Clicking the card itself plays based on current view/active mode
      card.addEventListener('click', () => {
        const lang = currentViewMode === 'de' ? 'de' : 'zh';
        playParagraph(p.id, lang);
      });
      
      readingContainer.appendChild(card);
    });
    
    if (window.lucide) {
      window.lucide.createIcons({ container: readingContainer });
    }
    
    updateChapterProgressBadge();
  }

  // Play Paragraph Text via SpeechSynthesis
  function playParagraph(id, lang = 'zh') {
    if (!synth) return;
    
    // Stop previous reading
    stopSpeech();
    
    const card = document.getElementById(id);
    if (!card) return;
    
    // Set active highlight
    document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    activeParagraphId = id;
    
    const chapter = window.bookData.chapters.find(ch => ch.id === currentChapterId);
    const pData = chapter.paragraphs.find(p => p.id === id);
    if (!pData) return;
    
    const textToRead = lang === 'de' ? pData.de : pData.zh;
    
    // Prepare Utterance
    const utter = new SpeechSynthesisUtterance(textToRead);
    currentUtterance = utter;
    
    // Apply Settings
    utter.rate = speedRate;
    
    // Voice Selection
    if (lang === 'zh') {
      if (selectedZhVoice) {
        utter.voice = selectedZhVoice;
      }
    } else {
      if (selectedDeVoice) {
        utter.voice = selectedDeVoice;
      }
    }
    
    // Event callbacks
    utter.onstart = () => {
      isPlaying = true;
      isPaused = false;
      updatePlayerUI();
      // Auto-scroll paragraph card into center of view smoothly
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    
    utter.onend = () => {
      isPlaying = false;
      updatePlayerUI();
      
      // Auto save progress
      saveProgress(currentChapterId, id);
      
      // Autoplay next paragraph
      if (autoplayEnabled) {
        const nextCard = card.nextElementSibling;
        if (nextCard && nextCard.classList.contains('paragraph-card')) {
          setTimeout(() => {
            playParagraph(nextCard.id, lang);
          }, 600); // Small pause between paragraphs
        }
      }
    };
    
    utter.onerror = (e) => {
      // Don't flag error on standard cancellation
      if (e.error !== 'interrupted') {
        isPlaying = false;
        updatePlayerUI();
      }
    };
    
    // Update footer info
    footerTitle.textContent = textToRead.substring(0, 30) + (textToRead.length > 30 ? '...' : '');
    footerChapter.textContent = chapter.title.split(' (')[0] + ` - 第 ${parseInt(card.getAttribute('data-index')) + 1} 段`;
    
    // Update Progress bar based on current index
    const index = parseInt(card.getAttribute('data-index'));
    const total = chapter.paragraphs.length;
    const progressPercent = ((index + 1) / total) * 100;
    progressBarFill.style.width = `${progressPercent}%`;
    progressTimeCurrent.textContent = `${index + 1}`;
    progressTimeTotal.textContent = `${total}`;
    
    // Speak!
    synth.speak(utter);
  }

  // Stop Speech
  function stopSpeech() {
    if (synth) {
      synth.cancel();
    }
    isPlaying = false;
    isPaused = false;
    updatePlayerUI();
  }

  // Toggle Play / Pause
  function togglePlayPause() {
    if (!activeParagraphId) {
      // Play first paragraph
      const firstCard = document.querySelector('.paragraph-card');
      if (firstCard) {
        playParagraph(firstCard.id);
      }
      return;
    }
    
    if (isPlaying) {
      if (isPaused) {
        synth.resume();
        isPaused = false;
        isPlaying = true;
      } else {
        synth.pause();
        isPaused = true;
      }
    } else {
      playParagraph(activeParagraphId);
    }
    updatePlayerUI();
  }

  // Go to Previous Paragraph
  function playPrevious() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const prev = card ? card.previousElementSibling : null;
    if (prev && prev.classList.contains('paragraph-card')) {
      playParagraph(prev.id);
    }
  }

  // Go to Next Paragraph
  function playNext() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const next = card ? card.nextElementSibling : null;
    if (next && next.classList.contains('paragraph-card')) {
      playParagraph(next.id);
    }
  }

  // Update Player UI Play/Pause button icons
  function updatePlayerUI() {
    if (isPlaying && !isPaused) {
      // Change to Pause icon
      playIcon.setAttribute('data-lucide', 'pause');
    } else {
      // Change to Play icon
      playIcon.setAttribute('data-lucide', 'play');
    }
    
    if (window.lucide) {
      window.lucide.createIcons({ container: btnPlayPause });
    }
  }

  // Save progress
  function saveProgress(chapterId, paragraphId) {
    localStorage.setItem('bonhoeffer-reader-chapter', chapterId);
    localStorage.setItem('bonhoeffer-reader-paragraph', paragraphId);
    
    // Add visual bookmark to the card
    document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('last-read'));
    const card = document.getElementById(paragraphId);
    if (card) {
      card.classList.add('last-read');
    }
    
    updateChapterProgressBadge();
  }

  // Update chapter progress badge in sidebar
  function updateChapterProgressBadge() {
    const chapter = window.bookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter) return;
    
    const savedParaId = localStorage.getItem('bonhoeffer-reader-paragraph');
    if (savedParaId) {
      const card = document.getElementById(savedParaId);
      if (card) {
        const index = parseInt(card.getAttribute('data-index'));
        const total = chapter.paragraphs.length;
        const pct = Math.round(((index + 1) / total) * 100);
        
        const badge = document.getElementById(`badge-${currentChapterId}`);
        if (badge) {
          badge.textContent = `${pct}%`;
        }
      }
    }
  }

  // Restore progress on page load
  function restoreProgress() {
    const savedChapter = localStorage.getItem('bonhoeffer-reader-chapter');
    const savedPara = localStorage.getItem('bonhoeffer-reader-paragraph');
    
    if (savedChapter && window.bookData.chapters.some(ch => ch.id === savedChapter)) {
      currentChapterId = savedChapter;
      // Activate sidebar item
      document.querySelectorAll('.chapter-item').forEach(i => i.classList.remove('active'));
      const item = document.querySelector(`.chapter-item[data-id="${savedChapter}"]`);
      if (item) item.classList.add('active');
      
      loadChapter(savedChapter);
      
      if (savedPara) {
        activeParagraphId = savedPara;
        const card = document.getElementById(savedPara);
        if (card) {
          card.classList.add('last-read');
          // Wait slightly for layout to settle, then scroll to it
          setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    }
  }

  // Load Voices & Populate selectors
  function loadVoices() {
    if (!synth) return;
    const allVoices = synth.getVoices();
    
    voiceSelectZh.innerHTML = '';
    voiceSelectDe.innerHTML = '';
    
    // Filter Chinese (zh_TW, zh_HK, zh_CN)
    const zhVoices = allVoices.filter(v => v.lang.includes('zh') || v.lang.includes('ZH'));
    // Filter German (de_DE, de_CH, de_AT)
    const deVoices = allVoices.filter(v => v.lang.includes('de') || v.lang.includes('DE'));
    
    // Chinese selector
    if (zhVoices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '系統預設中文';
      opt.value = '';
      voiceSelectZh.appendChild(opt);
    } else {
      zhVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        voiceSelectZh.appendChild(opt);
      });
      // Try to auto-select Meijia
      const meijia = zhVoices.find(v => v.name.toLowerCase().includes('meijia') || v.lang.includes('zh-TW'));
      if (meijia) {
        voiceSelectZh.value = meijia.name;
        selectedZhVoice = meijia;
      } else {
        selectedZhVoice = zhVoices[0];
      }
    }
    
    // German selector
    if (deVoices.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '系統預設德文';
      opt.value = '';
      voiceSelectDe.appendChild(opt);
    } else {
      deVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        voiceSelectDe.appendChild(opt);
      });
      // Auto-select Grandpa or Reed or first German voice
      const preferredDe = deVoices.find(v => v.name.toLowerCase().includes('grandpa') || v.name.toLowerCase().includes('reed') || v.lang.includes('de-DE'));
      if (preferredDe) {
        voiceSelectDe.value = preferredDe.name;
        selectedDeVoice = preferredDe;
      } else {
        selectedDeVoice = deVoices[0];
      }
    }
  }

  // Bind UI Controls
  function bindEvents() {
    // Voices
    voiceSelectZh.addEventListener('change', () => {
      const allVoices = synth.getVoices();
      selectedZhVoice = allVoices.find(v => v.name === voiceSelectZh.value) || null;
      if (activeParagraphId && isPlaying && currentViewMode !== 'de') {
        playParagraph(activeParagraphId, 'zh');
      }
    });
    
    voiceSelectDe.addEventListener('change', () => {
      const allVoices = synth.getVoices();
      selectedDeVoice = allVoices.find(v => v.name === voiceSelectDe.value) || null;
      if (activeParagraphId && isPlaying && currentViewMode === 'de') {
        playParagraph(activeParagraphId, 'de');
      }
    });
    
    // Playback Speed Slider
    sliderRate.addEventListener('input', () => {
      speedRate = parseFloat(sliderRate.value);
      valRate.textContent = `${speedRate.toFixed(1)}x`;
      localStorage.setItem('bonhoeffer-reader-speed', speedRate);
      if (synth && synth.speaking && currentUtterance) {
        // Unfortunately Web Speech API rate cannot be dynamically adjusted while speaking on some systems.
        // Re-starting active paragraph is the safest way to apply.
        const lang = currentViewMode === 'de' ? 'de' : 'zh';
        playParagraph(activeParagraphId, lang);
      }
    });
    
    // Autoplay toggle
    toggleAutoplay.addEventListener('change', () => {
      autoplayEnabled = toggleAutoplay.checked;
      localStorage.setItem('bonhoeffer-reader-autoplay', autoplayEnabled ? 'true' : 'false');
    });
    
    // View mode buttons (Bilingual / DE / ZH)
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const mode = btn.getAttribute('data-mode');
        currentViewMode = mode;
        localStorage.setItem('bonhoeffer-reader-viewmode', mode);
        
        // Remove old view mode classes
        document.body.classList.remove('view-mode-bilingual', 'view-mode-de', 'view-mode-zh');
        document.body.classList.add(`view-mode-${mode}`);
      });
    });
    
    // Player controls
    btnPlayPause.addEventListener('click', togglePlayPause);
    btnStop.addEventListener('click', stopSpeech);
    btnPrev.addEventListener('click', playPrevious);
    btnNext.addEventListener('click', playNext);
    
    // Theme Toggle
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('bonhoeffer-reader-theme', newTheme);
      updateThemeIcon(newTheme);
    });
  }

  function updateThemeIcon(theme) {
    if (theme === 'dark') {
      themeToggle.innerHTML = '<i data-lucide="sun"></i>';
    } else {
      themeToggle.innerHTML = '<i data-lucide="moon"></i>';
    }
    if (window.lucide) window.lucide.createIcons({ container: themeToggle });
  }

  // Settings Handlers
  function loadSettings() {
    // Theme
    const savedTheme = localStorage.getItem('bonhoeffer-reader-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    // Speed
    const savedSpeed = localStorage.getItem('bonhoeffer-reader-speed');
    if (savedSpeed) {
      speedRate = parseFloat(savedSpeed);
      sliderRate.value = speedRate;
      valRate.textContent = `${speedRate.toFixed(1)}x`;
    }
    
    // Autoplay
    const savedAutoplay = localStorage.getItem('bonhoeffer-reader-autoplay');
    if (savedAutoplay) {
      autoplayEnabled = savedAutoplay === 'true';
      toggleAutoplay.checked = autoplayEnabled;
    }
    
    // View Mode
    const savedViewMode = localStorage.getItem('bonhoeffer-reader-viewmode') || 'bilingual';
    currentViewMode = savedViewMode;
    document.body.classList.add(`view-mode-${savedViewMode}`);
    const activeViewBtn = document.querySelector(`.view-btn[data-mode="${savedViewMode}"]`);
    if (activeViewBtn) {
      viewBtns.forEach(b => b.classList.remove('active'));
      activeViewBtn.classList.add('active');
    }
  }
});
