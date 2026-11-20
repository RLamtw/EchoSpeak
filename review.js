"use strict";

const episodes = window.guideReviewData;
const episodeButtons = document.getElementById("episodes");
const list = document.getElementById("scene-list");
const player = document.getElementById("player");
const speed = document.getElementById("speed");
const controls = document.querySelector(".controls");
const playToggle = document.getElementById("play-toggle");
const seek = document.getElementById("seek");
const elapsed = document.getElementById("elapsed");
const totalTime = document.getElementById("total-time");
const nowPlaying = document.getElementById("now-playing");
const followToggle = document.getElementById("follow-toggle");
const themeToggle = document.getElementById("theme-toggle");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
const status = document.getElementById("audio-status");
const noteStatus = document.getElementById("note-status");
const template = document.getElementById("scene-template");
const storageKey = "nachfolge_guide_review_original_20261120";
const sourceLinks = {
  H01: ["潘霍華年表", "https://www.dietrich-bonhoeffer.net/fileadmin/media/downloadangebot/lebenslauf_dietrich_bonhoeffer_25419.pdf"],
  H02: ["美國大屠殺紀念館的潘霍華資料", "https://encyclopedia.ushmm.org/content/en/article/dietrich-bonhoeffer"],
  H03: ["巴門宣言原文", "https://www.kirchenrecht-ekd.de/document/11181"],
  H04: ["尼莫拉故居與教會檔案", "https://niemoellerhaus.de/startseite/erinnerungsort/"],
  H05: ["德國歷史博物館的教會抵抗資料", "https://www.dhm.de/lemo/kapitel/ns-regime/widerstand-im-nationalsozialismus/widerstand-der-evangelischen-kirche"],
  H06: ["布痕瓦爾德紀念館的保羅・施奈德資料", "https://www.buchenwald.de/en/geschichte/biografien/ltg-ausstellung/paul-schneider"],
  H07: ["德國福音教會的〈一切善美力量〉資料", "https://www.ekd.de/eg-65-von-guten-machten-wunderbar-geborgen-11493.htm"],
  H08: ["1944 年 7 月 21 日致貝特格書信", "https://gemeinsamleben.net/wp-content/uploads/2021/03/Bonhoeffer_Brief-21.7.44_komplett.pdf"],
  H09: ["弗羅森堡紀念館的營地歷史", "https://www.gedenkstaette-flossenbuerg.de/de/geschichte/flossenbuerg"],
};

let currentEpisode;
let sceneViews = [];
let activeScene;
let activeCue;
let pendingSeek;
let scrubbing = false;
let following = true;
let notes = loadNotes();

function loadNotes() {
  try {
    const current = localStorage.getItem(storageKey);
    if (current !== null) return JSON.parse(current) || {};
    const old = JSON.parse(localStorage.getItem("nachfolge_guide_review_v1") || "{}");
    const preserved = {};
    for (const [key, entry] of Object.entries(old)) {
      if (entry?.text) preserved[key] = { text: entry.text };
    }
    return preserved;
  } catch {
    return {};
  }
}

function saveNote(key, value) {
  notes[key] = value;
  try {
    localStorage.setItem(storageKey, JSON.stringify(notes));
    noteStatus.textContent = "";
  } catch {
    noteStatus.textContent = "這個瀏覽器目前無法儲存備註。離開前可先匯出。";
  }
}

function timeLabel(seconds) {
  return Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");
}

function sceneAnchor(episode, id) {
  return episode + "-" + id.toLowerCase();
}

function addCitation(element, citation) {
  element.append("對照依據　");
  for (const part of citation.split(/(H0[1-9])/)) {
    const source = sourceLinks[part];
    if (source) {
      const link = document.createElement("a");
      link.href = source[1];
      link.textContent = part;
      link.title = source[0];
      link.target = "_blank";
      link.rel = "noopener";
      element.append(link);
    } else {
      element.append(part);
    }
  }
}

function makeScene(episode, scene) {
  const card = template.content.firstElementChild.cloneNode(true);
  card.id = sceneAnchor(episode, scene.id);
  const anchor = card.querySelector(".scene-id");
  anchor.textContent = scene.id;
  anchor.href = "#" + card.id;
  card.querySelector(".chapter").textContent = scene.chapter;
  card.querySelector(".scene-title").textContent = scene.title;
  const narration = card.querySelector(".narration");
  const cues = (scene.cues || [[scene.start, scene.narration]]).map(([start, phrase]) => {
    const element = document.createElement("span");
    element.className = "cue";
    element.textContent = phrase;
    narration.append(element);
    return { start, element };
  });
  card.querySelector(".reason").textContent = scene.reason;
  addCitation(card.querySelector(".citation"), scene.citation);

  const visual = card.querySelector(".screen");
  for (const text of scene.screen) {
    const line = document.createElement("li");
    line.textContent = text;
    visual.append(line);
  }

  const play = card.querySelector(".play-scene");
  play.querySelector("span").textContent = timeLabel(scene.start);
  const view = { start: scene.start, scene, card, play, cues };
  updateSceneButton(view, false);
  play.addEventListener("click", () => {
    if (view === activeScene && !player.paused) {
      player.pause();
      return;
    }
    if (view !== activeScene || player.ended) seekTo(scene.start);
    playAudio();
  });

  const key = episode + "_" + scene.id;
  const approval = card.querySelector("input");
  const note = card.querySelector("textarea");
  approval.checked = Boolean(notes[key]?.ok);
  note.value = notes[key]?.text || "";
  const update = () => saveNote(key, { ok: approval.checked, text: note.value });
  approval.addEventListener("change", update);
  note.addEventListener("input", update);
  return view;
}

function selectEpisode(id) {
  if (currentEpisode === id) return;
  const episode = episodes[id];
  if (!episode) return;
  player.pause();
  pendingSeek = undefined;
  scrubbing = false;
  activeScene = undefined;
  activeCue = undefined;
  currentEpisode = id;
  player.src = episode.audio;
  player.playbackRate = Number(speed.value);
  status.textContent = "";
  for (const button of episodeButtons.children) {
    button.setAttribute("aria-pressed", String(button.dataset.episode === id));
  }
  document.getElementById("episode-title").textContent = episode.title;
  document.getElementById("episode-meta").textContent = id.toUpperCase() + "　" + episode.scenes.length + " 場　" + timeLabel(episode.duration);
  sceneViews = episode.scenes.map(scene => makeScene(id, scene));
  list.replaceChildren(...sceneViews.map(view => view.card));
  seek.max = episode.duration;
  totalTime.textContent = timeLabel(episode.duration);
  syncPosition(0);
  updatePlayControls();
  if ("mediaSession" in navigator && typeof MediaMetadata === "function") {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      album: "《跟隨基督》導讀審稿",
      artist: "曉臻 · Edge TTS",
    });
  }
}

async function playAudio() {
  status.textContent = "";
  const episode = currentEpisode;
  try {
    await player.play();
  } catch (error) {
    if (episode === currentEpisode && error.name !== "AbortError") {
      status.textContent = "無法播放，請確認連線後再試。";
    }
  }
}

function updateSceneButton(view, playing) {
  view.play.classList.toggle("is-playing", playing);
  const action = playing ? "暫停" : "播放";
  view.play.setAttribute("aria-label", action + " " + view.scene.id + " " + view.scene.title);
  view.play.title = action + " " + view.scene.id;
}

function updatePlayControls() {
  const playing = !player.paused && !player.ended;
  const action = playing ? "暫停" : "播放";
  playToggle.classList.toggle("is-playing", playing);
  playToggle.setAttribute("aria-label", action);
  playToggle.title = action;
  if (activeScene) updateSceneButton(activeScene, playing);
}

function itemAtTime(items, time) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index].start <= time) return items[index];
  }
  return items[0];
}

function showProgress(time) {
  const duration = Number(seek.max);
  elapsed.textContent = timeLabel(time);
  seek.style.setProperty("--progress", duration ? (time / duration * 100) + "%" : "0%");
  seek.setAttribute("aria-valuetext", timeLabel(time) + "，全長 " + timeLabel(duration));
}

function revealActiveCue() {
  if (!following || !activeCue || document.activeElement?.matches(".review-bar textarea")) return;
  if (window.getSelection()?.isCollapsed === false) return;
  const top = Math.max(0, controls.getBoundingClientRect().bottom) + 14;
  const bottom = window.innerHeight - 26;
  if (bottom <= top) return;
  const bounds = activeCue.element.getBoundingClientRect();
  if (bounds.top >= top && bounds.bottom <= bottom) return;
  window.scrollBy({
    top: bounds.top - (top + (bottom - top) * 0.2),
    behavior: reduceMotion.matches ? "auto" : "smooth",
  });
}

function syncPosition(time, scroll = false) {
  if (!scrubbing) {
    seek.value = time;
    showProgress(time);
  }
  const view = itemAtTime(sceneViews, time);
  if (!view) return;
  if (view !== activeScene) {
    if (activeScene) {
      activeScene.card.classList.remove("playing");
      updateSceneButton(activeScene, false);
    }
    activeScene = view;
    view.card.classList.add("playing");
    updateSceneButton(view, !player.paused && !player.ended);
    nowPlaying.textContent = view.scene.id + " · " + view.scene.title;
  }
  const cue = itemAtTime(view.cues, time);
  if (cue !== activeCue) {
    activeCue?.element.removeAttribute("aria-current");
    activeCue = cue;
    cue.element.setAttribute("aria-current", "true");
    if (scroll) revealActiveCue();
  }
}

function seekTo(seconds) {
  const time = Math.min(Number(seek.max), Math.max(0, seconds));
  if (player.readyState === HTMLMediaElement.HAVE_NOTHING) {
    pendingSeek = time;
  } else {
    player.currentTime = time;
  }
  syncPosition(time);
  revealActiveCue();
}

function setTheme(choice) {
  const isDark = (choice || (systemDark.matches ? "dark" : "light")) === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.title = isDark ? "切換日間模式" : "切換夜間模式";
}

setTheme(document.documentElement.dataset.themeChoice);
themeToggle.addEventListener("click", () => {
  const root = document.documentElement;
  const choice = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.themeChoice = choice;
  try { localStorage.setItem("nachfolge_review_theme", choice); } catch {}
  setTheme(choice);
});
systemDark.addEventListener("change", () => setTheme(document.documentElement.dataset.themeChoice));

if ("ResizeObserver" in window) {
  const layoutObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--controls-height", controls.offsetHeight + 12 + "px");
  });
  layoutObserver.observe(controls);
}

function activatePlaybackControls() {
  playToggle.addEventListener("click", () => {
    if (!player.paused) {
      player.pause();
      return;
    }
    if (player.ended) seekTo(0);
    playAudio();
  });
  document.getElementById("rewind").addEventListener("click", () => seekTo((pendingSeek ?? player.currentTime) - 10));
  document.getElementById("forward").addEventListener("click", () => seekTo((pendingSeek ?? player.currentTime) + 10));
  seek.addEventListener("input", () => {
    scrubbing = true;
    showProgress(Number(seek.value));
  });
  seek.addEventListener("change", () => {
    scrubbing = false;
    seekTo(Number(seek.value));
  });
  seek.addEventListener("pointercancel", () => {
    scrubbing = false;
    syncPosition(pendingSeek ?? player.currentTime);
  });
  seek.addEventListener("keydown", event => {
    const offsets = { ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5 };
    if (!Object.hasOwn(offsets, event.key)) return;
    event.preventDefault();
    seekTo((pendingSeek ?? player.currentTime) + offsets[event.key]);
  });
  followToggle.addEventListener("click", () => {
    following = !following;
    followToggle.setAttribute("aria-pressed", String(following));
    if (following) revealActiveCue();
  });
  list.addEventListener("focusout", event => {
    if (event.target.matches("textarea") && !player.paused) requestAnimationFrame(revealActiveCue);
  });
  player.addEventListener("loadedmetadata", () => {
    player.playbackRate = Number(speed.value);
    if (pendingSeek !== undefined) {
      player.currentTime = pendingSeek;
      pendingSeek = undefined;
    }
    syncPosition(player.currentTime);
  });
  player.addEventListener("timeupdate", () => {
    syncPosition(pendingSeek ?? player.currentTime, !player.paused && !scrubbing);
  });
  player.addEventListener("play", () => {
    updatePlayControls();
    revealActiveCue();
  });
  for (const event of ["pause", "ended"]) {
    player.addEventListener(event, updatePlayControls);
  }
}

function route() {
  const match = /^#(ep0[1-8])(?:-(s\d{2}))?$/i.exec(location.hash);
  const episode = match?.[1].toLowerCase() || "ep01";
  selectEpisode(episode);
  if (match?.[2]) {
    document.getElementById(sceneAnchor(episode, match[2]))?.scrollIntoView();
  }
}

function exportNotes() {
  const lines = ["# 《跟隨基督》原著修訂版審稿備註", ""];
  for (const [id, episode] of Object.entries(episodes)) {
    const edited = episode.scenes.filter(scene => {
      const note = notes[id + "_" + scene.id];
      return note?.ok || note?.text?.trim();
    });
    if (!edited.length) continue;
    lines.push("## " + id.toUpperCase() + " " + episode.title, "");
    for (const scene of edited) {
      const note = notes[id + "_" + scene.id];
      lines.push("- [" + (note.ok ? "x" : " ") + "] " + scene.id + " " + scene.title);
      if (note.text?.trim()) {
        lines.push(...note.text.trim().split("\n").map(line => "  " + line));
      }
    }
    lines.push("");
  }
  if (lines.length === 2) {
    noteStatus.textContent = "目前還沒有勾選或備註可供匯出。";
    return;
  }
  const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
  const download = document.createElement("a");
  download.href = url;
  download.download = "跟隨基督_原著修訂版審稿備註.md";
  download.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

if (episodes) {
  for (const id of Object.keys(episodes)) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.episode = id;
    button.textContent = id.toUpperCase();
    button.addEventListener("click", () => {
      location.hash = id;
      window.scrollTo(0, 0);
    });
    episodeButtons.append(button);
  }
  const sourceList = document.getElementById("history-sources");
  for (const [id, [label, href]] of Object.entries(sourceLinks)) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    link.textContent = id + " " + label;
    link.target = "_blank";
    link.rel = "noopener";
    item.append(link);
    sourceList.append(item);
  }
  activatePlaybackControls();
  player.addEventListener("error", () => {
    status.textContent = "本集音檔載入失敗。請重新整理再試。";
  });
  speed.addEventListener("change", () => { player.playbackRate = Number(speed.value); });
  document.getElementById("export-notes").addEventListener("click", exportNotes);
  window.addEventListener("hashchange", route);
  route();
} else {
  status.textContent = "劇本資料載入失敗，請重新整理。";
}
