import { parseOudiaFile } from "./parser/oud-parser";
import { CTCRenderer } from "./renderer/ctc-renderer";
import { SimulationEngine } from "./simulation/engine";

// ---- DOM elements ----

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const canvas = document.getElementById("ctc-canvas") as HTMLCanvasElement;
const dropOverlay = document.getElementById("drop-overlay") as HTMLDivElement;
const btnPlay = document.getElementById("btn-play") as HTMLButtonElement;
const btnSlower = document.getElementById("btn-slower") as HTMLButtonElement;
const btnFaster = document.getElementById("btn-faster") as HTMLButtonElement;
const speedDisplay = document.getElementById("speed-display") as HTMLSpanElement;
const timeSlider = document.getElementById("time-slider") as HTMLInputElement;
const timeDisplay = document.getElementById("time-display") as HTMLSpanElement;
const routeInfo = document.getElementById("route-info") as HTMLSpanElement;
const trainCount = document.getElementById("train-count") as HTMLSpanElement;

// ---- state ----

let renderer: CTCRenderer | null = null;
let engine: SimulationEngine | null = null;
let isPlaying = false;
let playSpeed = 1; // 倍速
let currentTime = 600; // 分 (10:00)
let minTime = 0;
let maxTime = 1440;
let lastFrameTime: number | null = null;

const SPEED_STEPS = [0.25, 0.5, 1, 2, 5, 10, 30, 60];
let speedIndex = 2; // 初期 = x1

// ---- time formatting ----

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  const s = Math.floor((minutes % 1) * 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ---- canvas sizing ----

function resizeCanvas(): void {
  const container = canvas.parentElement!;
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth;
  const h = container.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  // renderer の内部サイズは CSS ピクセルベース
  renderer?.resize(w, h);
}

// ---- file loading ----

async function loadFile(file: File): Promise<void> {
  try {
    const result = await parseOudiaFile(file);
    const route = result.route;

    // renderer
    renderer = new CTCRenderer(canvas);
    renderer.setRoute(route);

    // engine
    engine = new SimulationEngine(route, 0);
    minTime = engine.getEarliestTime();
    maxTime = engine.getLatestTime();

    // UI 更新
    timeSlider.min = minTime.toString();
    timeSlider.max = maxTime.toString();
    currentTime = minTime;
    timeSlider.value = currentTime.toString();

    const dia = route.diagrams[0];
    routeInfo.textContent = `${route.name || file.name} — ${dia?.name ?? ""}`;
    trainCount.textContent = `${route.stations.length}駅 / 下り${dia?.downTrains.length ?? 0}本 上り${dia?.upTrains.length ?? 0}本`;

    dropOverlay.style.display = "none";
    resizeCanvas();
    renderFrame();
  } catch (e) {
    routeInfo.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ---- render loop ----

function renderFrame(): void {
  if (!renderer || !engine) return;

  const positions = engine.getPositions(currentTime);
  renderer.render(positions, currentTime);
  trainCount.textContent = trainCount.textContent?.replace(/\/ 表示.+$/, "").trim() +
    ` / 表示${positions.length}本`;
  timeDisplay.textContent = formatTime(currentTime);
  timeSlider.value = currentTime.toString();
}

function animationLoop(timestamp: number): void {
  if (isPlaying && engine) {
    if (lastFrameTime !== null) {
      const deltaMs = timestamp - lastFrameTime;
      const deltaMinutes = (deltaMs / 1000) * playSpeed;
      currentTime += deltaMinutes;
      if (currentTime > maxTime) {
        currentTime = minTime; // ループ
      }
    }
    lastFrameTime = timestamp;
    renderFrame();
  } else {
    lastFrameTime = null;
  }
  requestAnimationFrame(animationLoop);
}

// ---- controls ----

btnPlay.addEventListener("click", () => {
  isPlaying = !isPlaying;
  btnPlay.textContent = isPlaying ? "⏸" : "▶";
  btnPlay.classList.toggle("active", isPlaying);
  if (!isPlaying) lastFrameTime = null;
});

btnSlower.addEventListener("click", () => {
  if (speedIndex > 0) speedIndex--;
  playSpeed = SPEED_STEPS[speedIndex];
  speedDisplay.textContent = `x${playSpeed}`;
});

btnFaster.addEventListener("click", () => {
  if (speedIndex < SPEED_STEPS.length - 1) speedIndex++;
  playSpeed = SPEED_STEPS[speedIndex];
  speedDisplay.textContent = `x${playSpeed}`;
});

timeSlider.addEventListener("input", () => {
  currentTime = parseFloat(timeSlider.value);
  renderFrame();
});

// ---- file input ----

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) loadFile(file);
});

// ---- drag & drop ----

const container = document.getElementById("canvas-container")!;
container.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropOverlay.classList.add("drag-hover");
});
container.addEventListener("dragleave", () => {
  dropOverlay.classList.remove("drag-hover");
});
container.addEventListener("drop", (e) => {
  e.preventDefault();
  dropOverlay.classList.remove("drag-hover");
  const file = e.dataTransfer?.files[0];
  if (file) loadFile(file);
});

// ---- keyboard shortcuts ----

document.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "k") {
    e.preventDefault();
    btnPlay.click();
  } else if (e.key === "ArrowRight") {
    currentTime = Math.min(currentTime + 1, maxTime);
    renderFrame();
  } else if (e.key === "ArrowLeft") {
    currentTime = Math.max(currentTime - 1, minTime);
    renderFrame();
  } else if (e.key === "ArrowUp") {
    btnFaster.click();
  } else if (e.key === "ArrowDown") {
    btnSlower.click();
  }
});

// ---- init ----

window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(animationLoop);
