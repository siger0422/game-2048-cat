const SIZE = 4;
const TARGET = 2048;
const SCORE_MILESTONES = [100, 300, 500, 1000, 2048, 3000, 4000];
const GAME_STATE_KEY = "cat2048StateV1";

const IMAGE_POOL = {
  usagi:
    "https://static.wikia.nocookie.net/chiikawa/images/4/43/YahaUsagi.png/revision/latest?cb=20240709065537",
  hachiware:
    "https://static.wikia.nocookie.net/chiikawa/images/6/61/SweetBabyHachiware2.png/revision/latest?cb=20260214172321",
  chiikawa:
    "https://static.wikia.nocookie.net/chiikawa/images/2/2c/AdorableCutieChiikawa.png/revision/latest?cb=20240709065538",
  momonga:
    "https://static.wikia.nocookie.net/chiikawa/images/a/a0/Momonga.png/revision/latest?cb=20240921205329",
};

const CHAR_LEVELS = {
  2: { emoji: "🐰", name: "우사기 씨앗", img: IMAGE_POOL.usagi },
  4: { emoji: "🐰", name: "우사기 점프", img: IMAGE_POOL.usagi },
  8: { emoji: "🐱", name: "하치와레 스텝", img: IMAGE_POOL.hachiware },
  16: { emoji: "🐱", name: "하치와레 리듬", img: IMAGE_POOL.hachiware },
  32: { emoji: "🤍", name: "치이카와 하이", img: IMAGE_POOL.chiikawa },
  64: { emoji: "🩵", name: "모몽가 텐션", img: IMAGE_POOL.momonga },
  128: { emoji: "🐰", name: "우사기 폭주", img: IMAGE_POOL.usagi },
  256: { emoji: "🐱", name: "하치와레 파티", img: IMAGE_POOL.hachiware },
  512: { emoji: "🤍", name: "치이카와 슈퍼", img: IMAGE_POOL.chiikawa },
  1024: { emoji: "🩵", name: "모몽가 레전드", img: IMAGE_POOL.momonga },
  2048: { emoji: "✨", name: "최강 먼작귀", img: IMAGE_POOL.usagi },
  4096: { emoji: "🌟", name: "우주 귀요미", img: IMAGE_POOL.momonga },
};

let grid = [];
let score = 0;
let best = Number(localStorage.getItem("cat2048Best") || 0);
let hasWon = false;
let touchStartX = 0;
let touchStartY = 0;

const boardEl = document.getElementById("board");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const newGameBtn = document.getElementById("new-game-btn");
const bgmBtn = document.getElementById("bgm-btn");
const shareBtn = document.getElementById("share-btn");
const bgmAudio = document.getElementById("bgm-audio");
const retryBtn = document.getElementById("retry-btn");
const resetConfirm = document.getElementById("reset-confirm");
const confirmResetBtn = document.getElementById("confirm-reset-btn");
const cancelResetBtn = document.getElementById("cancel-reset-btn");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayText = document.getElementById("overlay-text");
const legend = document.getElementById("legend");
const fxLayer = document.getElementById("fx-layer");
let isBgmPlaying = false;
let bgmBusy = false;
let bgmInitPending = false;
let unlockedMilestones = new Set();
let sfx = null;

function init() {
  bestEl.textContent = best;
  renderLegend();
  syncBgmButton(false);
  startBgmByDefault();
  if (!restoreGameState()) {
    startNewGame();
  }
  bindEvents();
}

function renderLegend() {
  const shown = [2, 8, 32, 128, 512, 2048];
  legend.innerHTML = `
    <strong>캐릭터 진화표</strong>
    <div class="legend-grid">
      ${shown
        .map((n) => {
          const c = getChar(n);
          return `<span class="legend-item"><img class="legend-char" src="${c.img}" alt="${c.name}" referrerpolicy="no-referrer" loading="lazy" /> ${c.name} (${n})</span>`;
        })
        .join("")}
    </div>
  `;
}

function bindEvents() {
  document.addEventListener("keydown", handleKeydown);
  newGameBtn.addEventListener("click", openResetConfirm);
  retryBtn.addEventListener("click", startNewGame);
  bgmBtn.addEventListener("click", toggleBgm);
  shareBtn.addEventListener("click", downloadScorePostcard);
  confirmResetBtn.addEventListener("click", () => {
    hideResetConfirm();
    startNewGame();
  });
  cancelResetBtn.addEventListener("click", hideResetConfirm);
  const unlockSfx = () => ensureSfx().unlock();
  window.addEventListener("pointerdown", unlockSfx, { once: true });
  window.addEventListener("keydown", unlockSfx, { once: true });
  window.addEventListener("touchstart", unlockSfx, { once: true, passive: true });

  bgmAudio.addEventListener("play", () => {
    isBgmPlaying = true;
    syncBgmButton(true);
  });
  bgmAudio.addEventListener("pause", () => {
    isBgmPlaying = false;
    syncBgmButton(false);
  });
  bgmAudio.addEventListener("ended", () => {
    isBgmPlaying = false;
    syncBgmButton(false);
  });
  bgmAudio.addEventListener("error", () => {
    isBgmPlaying = false;
    syncBgmButton(false);
    showFx("BGM 파일 재생 오류", "over");
  });

  boardEl.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    },
    { passive: false }
  );

  boardEl.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const threshold = 24;

      if (Math.max(absX, absY) < threshold) return;

      if (absX > absY) {
        if (dx > 0) move("right");
        else move("left");
      } else {
        if (dy > 0) move("down");
        else move("up");
      }
    },
    { passive: false }
  );

  // 모바일에서 보드 스와이프 중 페이지 스크롤이 발생하지 않게 차단
  boardEl.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );
}

class CuteSfx {
  constructor() {
    this.ctx = null;
  }

  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
    }
    await this.ctx.resume();
    return true;
  }

  async safePlay(fn) {
    try {
      const ready = await this.unlock();
      if (!ready) return;
      fn();
    } catch (_) {
      // 브라우저 오디오 정책으로 차단되면 조용히 무시
    }
  }

  tone(freq, duration, type, gainValue, offset = 0) {
    const now = this.ctx.currentTime + offset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  chirp(startFreq, endFreq, duration, type, gainValue, offset = 0) {
    const now = this.ctx.currentTime + offset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  merge(scoreGain) {
    const strong = Math.min(1, scoreGain / 128);
    this.safePlay(() => {
      this.tone(660 + strong * 120, 0.09, "triangle", 0.035 + strong * 0.01, 0);
      this.tone(880 + strong * 160, 0.12, "sine", 0.04 + strong * 0.015, 0.05);
    });
  }

  milestone() {
    this.safePlay(() => {
      this.chirp(740, 1120, 0.16, "square", 0.035, 0);
      this.chirp(988, 1480, 0.18, "triangle", 0.03, 0.08);
      this.tone(1760, 0.08, "sine", 0.02, 0.2);
    });
  }

  win() {
    this.safePlay(() => {
      this.tone(784, 0.14, "triangle", 0.04, 0);
      this.tone(988, 0.16, "triangle", 0.04, 0.12);
      this.tone(1318, 0.22, "sine", 0.05, 0.26);
    });
  }

  gameOver() {
    this.safePlay(() => {
      this.chirp(320, 170, 0.28, "sawtooth", 0.03, 0);
      this.tone(150, 0.24, "triangle", 0.02, 0.12);
    });
  }
}

function ensureSfx() {
  if (!sfx) sfx = new CuteSfx();
  return sfx;
}

function showFx(text, variant = "milestone") {
  const badge = document.createElement("div");
  badge.className = `fx-badge fx-badge--${variant}`;
  badge.textContent = text;
  fxLayer.appendChild(badge);
  badge.addEventListener("animationend", () => badge.remove(), { once: true });
}

function triggerBoardEffect(className, timeout = 260) {
  boardEl.classList.remove(className);
  void boardEl.offsetWidth;
  boardEl.classList.add(className);
  setTimeout(() => boardEl.classList.remove(className), timeout);
}

async function tryStartBgmAudio() {
  bgmAudio.volume = 0.35;
  bgmAudio.load();
  try {
    await bgmAudio.play();
    await new Promise((r) => setTimeout(r, 120));
    return isAudioActuallyPlaying();
  } catch (_) {
    return false;
  }
}

function isAudioActuallyPlaying() {
  return !bgmAudio.paused && !bgmAudio.ended && bgmAudio.readyState >= 2;
}

async function toggleBgm() {
  if (bgmBusy || bgmInitPending) return;
  bgmBusy = true;

  try {
    if (isAudioActuallyPlaying()) {
      bgmAudio.pause();
      bgmAudio.currentTime = 0;
    } else {
      const started = await tryStartBgmAudio();
      if (!started) {
        showFx("BGM 재생 실패", "over");
      }
    }
  } finally {
    isBgmPlaying = isAudioActuallyPlaying();
    syncBgmButton(isBgmPlaying);
    bgmBusy = false;
  }
}

function syncBgmButton(playing) {
  bgmBtn.disabled = false;
  bgmBtn.innerHTML = getBgmIconSvg(playing ? "on" : "off");
  bgmBtn.setAttribute("aria-label", playing ? "BGM 끄기" : "BGM 켜기");
  bgmBtn.setAttribute("title", playing ? "BGM 끄기" : "BGM 켜기");
  bgmBtn.setAttribute("aria-pressed", playing ? "true" : "false");
}

function markBgmUnsupported() {
  bgmBtn.disabled = false;
  bgmBtn.innerHTML = getBgmIconSvg("mute");
  bgmBtn.setAttribute("aria-label", "BGM 미지원");
  bgmBtn.setAttribute("title", "BGM 미지원");
  bgmBtn.setAttribute("aria-pressed", "false");
}

function getBgmIconSvg(mode) {
  const baseSpeaker = `
    <path d="M5 10h4l5-4v12l-5-4H5z" />
  `;
  const waveSmall = `<path d="M17 10.5a3 3 0 010 3" />`;
  const waveBig = `<path d="M19.5 8a6.5 6.5 0 010 8" />`;
  const cutLine = `<path d="M6 6l14 14" />`;

  let extra = "";
  if (mode === "on") extra = `${waveSmall}${waveBig}`;
  if (mode === "off") extra = cutLine;
  if (mode === "mute") extra = `<path d="M17 10l4 4M21 10l-4 4" />`;

  return `
    <svg class="icon-bgm icon-bgm--${mode}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      ${baseSpeaker}
      ${extra}
    </svg>
  `;
}

async function startBgmByDefault() {
  if (bgmBusy || bgmInitPending) return;
  bgmInitPending = true;

  const hasPlayableType = Boolean(
    bgmAudio.canPlayType("audio/mp4") ||
      bgmAudio.canPlayType("audio/aac") ||
      bgmAudio.canPlayType("audio/mpeg") ||
      bgmAudio.canPlayType("audio/webm") ||
      bgmAudio.canPlayType("audio/webm; codecs=opus")
  );
  if (!hasPlayableType) {
    isBgmPlaying = false;
    markBgmUnsupported();
    bgmInitPending = false;
    return;
  }

  isBgmPlaying = await tryStartBgmAudio();
  syncBgmButton(isBgmPlaying);
  bgmInitPending = false;
}

function handleKeydown(e) {
  const keyMap = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };
  const dir = keyMap[e.key];
  if (!dir) return;
  e.preventDefault();
  move(dir);
}

function startNewGame() {
  hideResetConfirm();
  grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  score = 0;
  hasWon = false;
  unlockedMilestones = new Set();
  hideOverlay();
  addRandomTile();
  addRandomTile();
  update(0);
  saveGameState("playing");
}

function addRandomTile() {
  const empty = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) empty.push([r, c]);
    }
  }
  if (empty.length === 0) return;

  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
}

function slideAndMerge(line) {
  const filtered = line.filter((v) => v !== 0);
  const out = [];

  for (let i = 0; i < filtered.length; i++) {
    if (filtered[i] === filtered[i + 1]) {
      const merged = filtered[i] * 2;
      out.push(merged);
      score += merged;
      i++;
    } else {
      out.push(filtered[i]);
    }
  }

  while (out.length < SIZE) out.push(0);
  return out;
}

function move(direction) {
  const before = JSON.stringify(grid);
  const prevScore = score;

  if (direction === "left") {
    for (let r = 0; r < SIZE; r++) {
      grid[r] = slideAndMerge(grid[r]);
    }
  }

  if (direction === "right") {
    for (let r = 0; r < SIZE; r++) {
      const reversed = [...grid[r]].reverse();
      grid[r] = slideAndMerge(reversed).reverse();
    }
  }

  if (direction === "up") {
    for (let c = 0; c < SIZE; c++) {
      const col = [];
      for (let r = 0; r < SIZE; r++) col.push(grid[r][c]);
      const merged = slideAndMerge(col);
      for (let r = 0; r < SIZE; r++) grid[r][c] = merged[r];
    }
  }

  if (direction === "down") {
    for (let c = 0; c < SIZE; c++) {
      const col = [];
      for (let r = 0; r < SIZE; r++) col.push(grid[r][c]);
      const merged = slideAndMerge(col.reverse()).reverse();
      for (let r = 0; r < SIZE; r++) grid[r][c] = merged[r];
    }
  }

  const after = JSON.stringify(grid);
  if (before === after) return;

  const scoreGain = score - prevScore;
  if (scoreGain > 0) {
    ensureSfx().merge(scoreGain);
    showFx(`합체 +${scoreGain}`, "merge");
    triggerBoardEffect("board-bounce", 220);
  }

  addRandomTile();
  update(prevScore);

  if (!hasWon && hasValue(TARGET)) {
    hasWon = true;
    ensureSfx().win();
    showFx("2048 달성!", "win");
    triggerBoardEffect("board-win", 420);
    showOverlay("클리어!", "우사기와 춤냥이 2048 콜라보를 완성했어요 ✨");
    saveGameState("won");
    return;
  }

  if (!canMove()) {
    ensureSfx().gameOver();
    showFx("앗, 게임 오버!", "over");
    triggerBoardEffect("board-over", 420);
    showOverlay("게임 오버", "블록이 가득 찼어요. 다시 시작해볼까요?");
    saveGameState("over");
    return;
  }

  saveGameState("playing");
}

function hasValue(v) {
  return grid.some((row) => row.some((cell) => cell === v));
}

function canMove() {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cur = grid[r][c];
      if (cur === 0) return true;
      if (c + 1 < SIZE && cur === grid[r][c + 1]) return true;
      if (r + 1 < SIZE && cur === grid[r + 1][c]) return true;
    }
  }
  return false;
}

function update(prevScore = 0) {
  if (score > best) {
    best = score;
    localStorage.setItem("cat2048Best", String(best));
  }

  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
  renderBoard();
  checkMilestones(prevScore, score);
}

function checkMilestones(prev, current) {
  const crossed = SCORE_MILESTONES.filter(
    (point) => prev < point && current >= point && !unlockedMilestones.has(point)
  );
  if (crossed.length === 0) return;

  for (const point of crossed) {
    unlockedMilestones.add(point);
    ensureSfx().milestone();
    showFx(`${point}점 돌파!`, "milestone");
    triggerBoardEffect("board-pop", 280);
  }
}

function renderBoard() {
  boardEl.innerHTML = "";

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const value = grid[r][c];

      if (value !== 0) {
        const char = getChar(value);
        const tile = document.createElement("div");
        tile.className = `tile tile--${Math.min(value, 4096)}`;
        tile.innerHTML = `
          <span class="tile-value">${value}</span>
          <div class="tile-media">
            <img class="tile-img" src="${char.img}" alt="${char.name}" loading="lazy" referrerpolicy="no-referrer" />
            <span class="tile-fallback">${char.emoji}</span>
          </div>
          <div class="tile-meta">
            <span class="name">${char.name}</span>
          </div>
        `;
        const img = tile.querySelector(".tile-img");
        const fallback = tile.querySelector(".tile-fallback");
        img.addEventListener("error", () => {
          img.style.display = "none";
          fallback.style.display = "grid";
        });
        cell.appendChild(tile);
      }

      boardEl.appendChild(cell);
    }
  }
}

function getChar(value) {
  if (CHAR_LEVELS[value]) return CHAR_LEVELS[value];
  const maxDefined = 4096;
  if (value > maxDefined) {
    return {
      emoji: "🌟",
      name: `${value} 스타냥`,
      img: IMAGE_POOL.momonga,
    };
  }
  return { emoji: "🐾", name: String(value), img: IMAGE_POOL.chiikawa };
}

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function openResetConfirm() {
  resetConfirm.classList.remove("hidden");
}

function hideResetConfirm() {
  resetConfirm.classList.add("hidden");
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadLocalImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function loadFirstAvailableImage(sources) {
  for (const src of sources) {
    try {
      return await loadLocalImage(src);
    } catch (_) {
      // 다음 후보 시도
    }
  }
  throw new Error("image load failed");
}

function setPostcardFont(ctx, size, weight = 700) {
  ctx.font = `${weight} ${size}px "Poor Story", "Jua", sans-serif`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function downloadScorePostcard() {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, "#fff6d8");
  grad.addColorStop(0.5, "#ffe2ee");
  grad.addColorStop(1, "#ffe8bf");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "rgba(255, 185, 208, 0.35)";
  ctx.beginPath();
  ctx.ellipse(190, 180, 180, 130, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 218, 150, 0.35)";
  ctx.beginPath();
  ctx.ellipse(900, 230, 170, 120, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 210, 230, 0.3)";
  ctx.beginPath();
  ctx.ellipse(870, 1160, 220, 140, 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#7a3f5d";
  setPostcardFont(ctx, 68, 700);
  ctx.textAlign = "center";
  ctx.fillText("야르게임 - 우사기편", 540, 140);

  try {
    const usagi = await loadFirstAvailableImage([
      "./assets/usagi-postcard.png",
      "./assets/usagi-postcard.webp",
    ]);
    ctx.drawImage(usagi, 372, 162, 148, 148);
    ctx.drawImage(usagi, 560, 162, 148, 148);
  } catch (_) {
    // 이미지 실패 시 우사기 이모지로라도 표시
    setPostcardFont(ctx, 64, 700);
    ctx.fillText("🐰   🐰", 540, 255);
  }

  drawRoundedRect(ctx, 120, 300, 840, 640, 42);
  ctx.fillStyle = "rgba(255,255,255,0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 193, 217, 0.95)";
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = "#8b4b69";
  setPostcardFont(ctx, 74, 700);
  ctx.fillText("나의 최고 점수", 540, 420);

  ctx.fillStyle = "#ff7ea6";
  setPostcardFont(ctx, 180, 700);
  ctx.fillText(String(best), 540, 600);

  ctx.fillStyle = "#9a6580";
  setPostcardFont(ctx, 58, 700);
  ctx.fillText(`현재 점수 ${score}`, 540, 700);

  ctx.fillStyle = "#7a3f5d";
  setPostcardFont(ctx, 62, 700);
  ctx.fillText("귀여움 풀충전 완료!", 540, 800);

  const now = new Date();
  const dateText = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}.${String(now.getDate()).padStart(2, "0")}`;
  ctx.fillStyle = "#9a6a7f";
  setPostcardFont(ctx, 54, 700);
  ctx.fillText(dateText, 540, 885);

  setPostcardFont(ctx, 84, 700);
  ctx.fillStyle = "#ff8bb2";
  ctx.fillText("💌", 540, 1030);

  setPostcardFont(ctx, 56, 700);
  ctx.fillStyle = "#8b4f6d";
  ctx.fillText("YAR GAME POSTCARD", 540, 1120);
  setPostcardFont(ctx, 52, 700);
  ctx.fillStyle = "#9d6b83";
  ctx.fillText("다음엔 4096까지 가보자!", 540, 1180);

  const fileName = `yar-game-postcard-best-${best}.png`;
  const blob = await canvasToBlob(canvas);
  if (!blob) {
    showFx("엽서 생성 실패", "over");
    return;
  }

  const file = new File([blob], fileName, { type: "image/png" });
  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canNativeShare) {
    try {
      await navigator.share({
        title: "야르게임 - 우사기편 최고점수 엽서",
        files: [file],
      });
      showFx("엽서 공유 완료!", "win");
      return;
    } catch (_) {
      // 사용자가 공유 취소한 경우 포함, 아래 다운로드로 폴백
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS && !canNativeShare) {
    window.open(url, "_blank");
  }

  // iOS Safari 등 download 속성 제한 브라우저 폴백
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showFx("엽서 저장 완료!", "win");
}

function saveGameState(mode = "playing") {
  const payload = {
    grid,
    score,
    best,
    hasWon,
    mode,
    unlockedMilestones: Array.from(unlockedMilestones),
  };
  localStorage.setItem(GAME_STATE_KEY, JSON.stringify(payload));
}

function restoreGameState() {
  const raw = localStorage.getItem(GAME_STATE_KEY);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.grid) || parsed.grid.length !== SIZE) return false;

    const validGrid = parsed.grid.every(
      (row) =>
        Array.isArray(row) &&
        row.length === SIZE &&
        row.every((v) => Number.isInteger(v) && v >= 0)
    );
    if (!validGrid) return false;

    grid = parsed.grid.map((row) => [...row]);
    score = Number.isFinite(parsed.score) ? parsed.score : 0;
    best = Number.isFinite(parsed.best) ? parsed.best : best;
    hasWon = Boolean(parsed.hasWon);
    const loadedMilestones = Array.isArray(parsed.unlockedMilestones)
      ? parsed.unlockedMilestones.filter((m) => SCORE_MILESTONES.includes(m))
      : SCORE_MILESTONES.filter((m) => score >= m);
    unlockedMilestones = new Set(loadedMilestones);

    hideOverlay();
    update(score);

    if (parsed.mode === "won") {
      showOverlay("클리어!", "우사기와 춤냥이 2048 콜라보를 완성했어요 ✨");
    } else if (parsed.mode === "over") {
      showOverlay("게임 오버", "블록이 가득 찼어요. 다시 시작해볼까요?");
    }
    return true;
  } catch (_) {
    return false;
  }
}

init();
