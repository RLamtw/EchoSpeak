// EchoSpeak E-Reader Controller (Version 3.1 - Multi-Chapter & Essential/Complete versions)
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
  let currentViewMode = 'bilingual';
  let selectedZhVoice = null;
  let selectedDeVoice = null;
  
  // Active Database (defaults to window.bookData / Essential version)
  let activeBookData = window.bookData;
  let currentVersion = 'essential'; // 'essential' or 'complete'
  
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
    
    // Check saved version choice
    const savedVersion = localStorage.getItem('bonhoeffer-reader-version') || 'essential';
    setBookVersion(savedVersion);
    
    // Show version toggle if complete database is loaded
    if (window.bookDataComplete) {
      versionToggleContainer.style.display = 'flex';
      updateVersionToggleUI();
    }
    
    loadSettings();
    loadVoices();
    if (synth && synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = loadVoices;
    }
    
    bindEvents();
    restoreProgress();
  }

  function setBookVersion(version) {
    currentVersion = version;
    localStorage.setItem('bonhoeffer-reader-version', version);
    
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
      
      // Keep active chapter if it exists in the active book data, else default to first
      if (!activeBookData.chapters.some(ch => ch.id === currentChapterId)) {
        currentChapterId = activeBookData.chapters[0].id;
      }
      loadChapter(currentChapterId);
    }
  }

  function updateVersionToggleUI() {
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
          // Save chapter switch
          localStorage.setItem('bonhoeffer-reader-chapter', ch.id);
        }
      });
      
      chapterListEl.appendChild(item);
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
      deText.textContent = p.de;
      
      const zhText = document.createElement('p');
      zhText.className = 'text-zh';
      zhText.textContent = p.zh;
      
      card.appendChild(deText);
      card.appendChild(zhText);
      
      const hoverActions = document.createElement('div');
      hoverActions.className = 'card-hover-actions';
      
      const btnPlayZh = document.createElement('button');
      btnPlayZh.className = 'action-btn-sm';
      btnPlayZh.title = '朗讀中文';
      btnPlayZh.innerHTML = '<i data-lucide="volume-2" style="width: 14px; height: 14px;"></i>';
      btnPlayZh.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(p.id, 'zh');
      });
      
      const btnPlayDe = document.createElement('button');
      btnPlayDe.className = 'action-btn-sm';
      btnPlayDe.title = '朗讀德文';
      btnPlayDe.innerHTML = '<i data-lucide="languages" style="width: 14px; height: 14px;"></i>';
      btnPlayDe.addEventListener('click', (e) => {
        e.stopPropagation();
        playParagraph(p.id, 'de');
      });
      
      hoverActions.appendChild(btnPlayZh);
      hoverActions.appendChild(btnPlayDe);
      card.appendChild(hoverActions);
      
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

  function playParagraph(id, lang = 'zh') {
    if (!synth) return;
    stopSpeech();
    
    const card = document.getElementById(id);
    if (!card) return;
    
    document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    activeParagraphId = id;
    
    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    const pData = chapter.paragraphs.find(p => p.id === id);
    if (!pData) return;
    
    const textToRead = lang === 'de' ? pData.de : pData.zh;
    
    const utter = new SpeechSynthesisUtterance(textToRead);
    currentUtterance = utter;
    utter.rate = speedRate;
    
    if (lang === 'zh') {
      if (selectedZhVoice) utter.voice = selectedZhVoice;
    } else {
      if (selectedDeVoice) utter.voice = selectedDeVoice;
    }
    
    utter.onstart = () => {
      isPlaying = true;
      isPaused = false;
      updatePlayerUI();
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    
    utter.onend = () => {
      isPlaying = false;
      updatePlayerUI();
      saveProgress(currentChapterId, id);
      
      if (autoplayEnabled) {
        const nextCard = card.nextElementSibling;
        if (nextCard && nextCard.classList.contains('paragraph-card')) {
          setTimeout(() => {
            playParagraph(nextCard.id, lang);
          }, 600);
        } else {
          // Auto-advance to next chapter
          const chapterIndex = activeBookData.chapters.findIndex(ch => ch.id === currentChapterId);
          if (chapterIndex < activeBookData.chapters.length - 1) {
            const nextChapter = activeBookData.chapters[chapterIndex + 1];
            currentChapterId = nextChapter.id;
            // Update sidebar
            document.querySelectorAll('.chapter-item').forEach(i => i.classList.remove('active'));
            const nextItem = document.querySelector(`.chapter-item[data-id="${nextChapter.id}"]`);
            if (nextItem) nextItem.classList.add('active');
            loadChapter(nextChapter.id);
            setTimeout(() => {
              const firstCard = document.querySelector('.paragraph-card');
              if (firstCard) playParagraph(firstCard.id, lang);
            }, 800);
          }
        }
      }
    };
    
    utter.onerror = (e) => {
      if (e.error !== 'interrupted') {
        isPlaying = false;
        updatePlayerUI();
      }
    };
    
    footerTitle.textContent = textToRead.substring(0, 30) + (textToRead.length > 30 ? '...' : '');
    footerChapter.textContent = chapter.title.split(' (')[0] + ` - 第 ${parseInt(card.getAttribute('data-index')) + 1} 段`;
    
    const index = parseInt(card.getAttribute('data-index'));
    const total = chapter.paragraphs.length;
    const progressPercent = ((index + 1) / total) * 100;
    progressBarFill.style.width = `${progressPercent}%`;
    progressTimeCurrent.textContent = `${index + 1}`;
    progressTimeTotal.textContent = `${total}`;
    
    synth.speak(utter);
  }

  function stopSpeech() {
    if (synth) synth.cancel();
    isPlaying = false;
    isPaused = false;
    updatePlayerUI();
  }

  function togglePlayPause() {
    if (!activeParagraphId) {
      const firstCard = document.querySelector('.paragraph-card');
      if (firstCard) playParagraph(firstCard.id);
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

  function playPrevious() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const prev = card ? card.previousElementSibling : null;
    if (prev && prev.classList.contains('paragraph-card')) {
      playParagraph(prev.id);
    }
  }

  function playNext() {
    if (!activeParagraphId) return;
    const card = document.getElementById(activeParagraphId);
    const next = card ? card.nextElementSibling : null;
    if (next && next.classList.contains('paragraph-card')) {
      playParagraph(next.id);
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

  function saveProgress(chapterId, paragraphId) {
    localStorage.setItem('bonhoeffer-reader-chapter', chapterId);
    localStorage.setItem('bonhoeffer-reader-paragraph', paragraphId);
    
    document.querySelectorAll('.paragraph-card').forEach(c => c.classList.remove('last-read'));
    const card = document.getElementById(paragraphId);
    if (card) card.classList.add('last-read');
    
    updateChapterProgressBadge();
  }

  function updateChapterProgressBadge() {
    const chapter = activeBookData.chapters.find(ch => ch.id === currentChapterId);
    if (!chapter) return;
    
    const savedChapterId = localStorage.getItem('bonhoeffer-reader-chapter');
    const savedParaId = localStorage.getItem('bonhoeffer-reader-paragraph');
    
    if (savedParaId && savedChapterId === currentChapterId) {
      const card = document.getElementById(savedParaId);
      if (card) {
        const index = parseInt(card.getAttribute('data-index'));
        const total = chapter.paragraphs.length;
        const pct = Math.round(((index + 1) / total) * 100);
        const badge = document.getElementById(`badge-${currentChapterId}`);
        if (badge) badge.textContent = `${pct}%`;
      }
    }
  }

  function restoreProgress() {
    const savedChapter = localStorage.getItem('bonhoeffer-reader-chapter');
    const savedPara = localStorage.getItem('bonhoeffer-reader-paragraph');
    
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
          setTimeout(() => {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    }
  }

  function loadVoices() {
    if (!synth) return;
    const allVoices = synth.getVoices();
    
    voiceSelectZh.innerHTML = '';
    voiceSelectDe.innerHTML = '';
    
    const zhVoices = allVoices.filter(v => v.lang.includes('zh') || v.lang.includes('ZH'));
    const deVoices = allVoices.filter(v => v.lang.includes('de') || v.lang.includes('DE'));
    
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
      const meijia = zhVoices.find(v => v.name.toLowerCase().includes('meijia') || v.lang.includes('zh-TW'));
      if (meijia) {
        voiceSelectZh.value = meijia.name;
        selectedZhVoice = meijia;
      } else {
        selectedZhVoice = zhVoices[0];
      }
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
        opt.textContent = `${v.name} (${v.lang})`;
        voiceSelectDe.appendChild(opt);
      });
      const preferredDe = deVoices.find(v => v.name.toLowerCase().includes('grandpa') || v.name.toLowerCase().includes('reed') || v.lang.includes('de-DE'));
      if (preferredDe) {
        voiceSelectDe.value = preferredDe.name;
        selectedDeVoice = preferredDe;
      } else {
        selectedDeVoice = deVoices[0];
      }
    }
  }

  function bindEvents() {
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
    
    sliderRate.addEventListener('input', () => {
      speedRate = parseFloat(sliderRate.value);
      valRate.textContent = `${speedRate.toFixed(1)}x`;
      localStorage.setItem('bonhoeffer-reader-speed', speedRate);
      if (synth && synth.speaking && currentUtterance) {
        const lang = currentViewMode === 'de' ? 'de' : 'zh';
        playParagraph(activeParagraphId, lang);
      }
    });
    
    toggleAutoplay.addEventListener('change', () => {
      autoplayEnabled = toggleAutoplay.checked;
      localStorage.setItem('bonhoeffer-reader-autoplay', autoplayEnabled ? 'true' : 'false');
    });
    
    viewBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        viewBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        currentViewMode = mode;
        localStorage.setItem('bonhoeffer-reader-viewmode', mode);
        document.body.classList.remove('view-mode-bilingual', 'view-mode-de', 'view-mode-zh');
        document.body.classList.add(`view-mode-${mode}`);
      });
    });
    
    btnPlayPause.addEventListener('click', togglePlayPause);
    btnStop.addEventListener('click', stopSpeech);
    btnPrev.addEventListener('click', playPrevious);
    btnNext.addEventListener('click', playNext);
    
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('bonhoeffer-reader-theme', newTheme);
      updateThemeIcon(newTheme);
    });
    
    // Bind Version Toggle Events
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
    const savedTheme = localStorage.getItem('bonhoeffer-reader-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    const savedSpeed = localStorage.getItem('bonhoeffer-reader-speed');
    if (savedSpeed) {
      speedRate = parseFloat(savedSpeed);
      sliderRate.value = speedRate;
      valRate.textContent = `${speedRate.toFixed(1)}x`;
    }
    
    const savedAutoplay = localStorage.getItem('bonhoeffer-reader-autoplay');
    if (savedAutoplay) {
      autoplayEnabled = savedAutoplay === 'true';
      toggleAutoplay.checked = autoplayEnabled;
    }
    
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
