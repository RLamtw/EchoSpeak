"use strict";

const episodes = window.guideReviewData;
const episodeButtons = document.getElementById("episodes");
const list = document.getElementById("scene-list");
const player = document.getElementById("player");
const speed = document.getElementById("speed");
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
let activeCard;
let pendingSeek;
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
  card.querySelector(".narration").textContent = scene.narration;
  card.querySelector(".reason").textContent = scene.reason;
  addCitation(card.querySelector(".citation"), scene.citation);

  const visual = card.querySelector(".screen");
  for (const text of scene.screen) {
    const line = document.createElement("li");
    line.textContent = text;
    visual.append(line);
  }

  const play = card.querySelector(".play-scene");
  play.textContent = "播放 " + timeLabel(scene.start);
  play.setAttribute("aria-label", "從 " + scene.id + " " + scene.title + " 開始播放");
  play.addEventListener("click", () => playFrom(scene.start));

  const key = episode + "_" + scene.id;
  const approval = card.querySelector("input");
  const note = card.querySelector("textarea");
  approval.checked = Boolean(notes[key]?.ok);
  note.value = notes[key]?.text || "";
  const update = () => saveNote(key, { ok: approval.checked, text: note.value });
  approval.addEventListener("change", update);
  note.addEventListener("input", update);
  return card;
}

function selectEpisode(id) {
  if (currentEpisode === id) return;
  const episode = episodes[id];
  if (!episode) return;
  player.pause();
  pendingSeek = undefined;
  activeCard = undefined;
  currentEpisode = id;
  player.src = episode.audio;
  player.playbackRate = Number(speed.value);
  status.textContent = "";
  for (const button of episodeButtons.children) {
    button.setAttribute("aria-pressed", String(button.dataset.episode === id));
  }
  document.getElementById("episode-title").textContent = episode.title;
  document.getElementById("episode-meta").textContent = id.toUpperCase() + "　" + episode.scenes.length + " 場　" + timeLabel(episode.duration);
  list.replaceChildren(...episode.scenes.map(scene => makeScene(id, scene)));
  if ("mediaSession" in navigator && typeof MediaMetadata === "function") {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: episode.title,
      album: "《跟隨基督》導讀審稿",
      artist: "曉臻 · Edge TTS",
    });
  }
}

async function playFrom(seconds) {
  status.textContent = "";
  if (player.readyState > HTMLMediaElement.HAVE_NOTHING) {
    player.currentTime = seconds;
  } else {
    pendingSeek = seconds;
  }
  try {
    await player.play();
  } catch (error) {
    if (error.name !== "AbortError") status.textContent = "無法播放，請確認連線後再試。";
  }
}

function followTime() {
  const time = player.currentTime;
  const scene = episodes[currentEpisode]?.scenes.find(item => time >= item.start && time < item.end);
  const card = scene ? document.getElementById(sceneAnchor(currentEpisode, scene.id)) : undefined;
  if (card !== activeCard) {
    activeCard?.classList.remove("playing");
    card?.classList.add("playing");
    activeCard = card;
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
  player.addEventListener("loadedmetadata", () => {
    player.playbackRate = Number(speed.value);
    if (pendingSeek !== undefined) {
      player.currentTime = pendingSeek;
      pendingSeek = undefined;
    }
  });
  player.addEventListener("timeupdate", followTime);
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
