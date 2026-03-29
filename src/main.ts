import { parseOudiaFile } from "./parser/oud-parser";
import { CTCRenderer, type TrainPosition, type TrainLabelMode } from "./renderer/ctc-renderer";
import { SimulationEngine } from "./simulation/engine";
import { StopType } from "./model/types";
import type { Route } from "./model/types";

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
const trainCountEl = document.getElementById("train-count") as HTMLSpanElement;
const trainInfoPanel = document.getElementById("train-info") as HTMLDivElement;
const btnLabelMode = document.getElementById("btn-label-mode") as HTMLButtonElement;

// ---- state ----

let renderer: CTCRenderer | null = null;
let engine: SimulationEngine | null = null;
let currentRoute: Route | null = null;
let lastPositions: TrainPosition[] = [];
let isPlaying = false;
let playSpeed = 1;
let currentTime = 600;
let minTime = 0;
let maxTime = 1440;
let lastFrameTime: number | null = null;

const SPEED_STEPS = [0.25, 0.5, 1, 2, 5, 10, 30, 60];
let speedIndex = 2;

// ---- time formatting ----

function fmtTime(minutes: number | undefined): string {
  if (minutes === undefined) return "--:--";
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function fmtTimeSec(minutes: number): string {
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
  renderer?.resize(w, h);
}

// ---- train info panel ----

const STOP_TYPE_LABEL: Record<number, string> = {
  [StopType.NotOperate]: "",
  [StopType.Stop]: "停車",
  [StopType.Pass]: "通過",
  [StopType.Direct]: "経由なし",
};

function showTrainInfo(pos: TrainPosition): void {
  if (!currentRoute) return;
  const train = pos.train;
  const trainType = currentRoute.trainTypes[train.typeIndex];

  let html = `<span class="close-btn" id="train-info-close">&times;</span>`;
  html += `<h3>${train.number ?? "?"} ${trainType?.name ?? ""} ${train.name ?? ""}</h3>`;
  html += `<div>${train.direction === "Kudari" ? "下り" : "上り"}`;
  if (train.operationNumber) html += ` / 運用: ${train.operationNumber}`;
  if (train.comment) html += ` / ${train.comment}`;
  html += `</div><br>`;

  html += `<table>`;
  html += `<tr style="color:#aaa"><td>駅</td><td>着</td><td>発</td><td></td></tr>`;

  const nearestStation = Math.round(pos.stationProgress);

  // 時刻付きの停車駅を収集し、時刻順にソート（始発→終着）
  const stopsWithTime: { idx: number; time: number }[] = [];
  for (let i = 0; i < train.stationTimes.length; i++) {
    const st = train.stationTimes[i];
    if (st.stopType === StopType.NotOperate || st.stopType === StopType.Direct) continue;
    if (st.arrival === undefined && st.departure === undefined) continue;
    stopsWithTime.push({ idx: i, time: st.departure ?? st.arrival! });
  }
  stopsWithTime.sort((a, b) => a.time - b.time);

  for (const { idx: i } of stopsWithTime) {
    const st = train.stationTimes[i];
    const stationName = currentRoute.stations[i]?.name ?? `駅${i}`;
    const cls = st.stopType === StopType.Stop ? "stop" : "pass";
    const isCurrent = i === nearestStation;
    const rowCls = isCurrent ? ` class="current"` : "";

    html += `<tr${rowCls}>`;
    html += `<td class="${cls}">${stationName}</td>`;
    html += `<td>${fmtTime(st.arrival)}</td>`;
    html += `<td>${fmtTime(st.departure)}</td>`;
    html += `<td>${STOP_TYPE_LABEL[st.stopType] ?? ""}</td>`;
    html += `</tr>`;
  }
  html += `</table>`;

  trainInfoPanel.innerHTML = html;
  trainInfoPanel.classList.add("visible");

  document.getElementById("train-info-close")?.addEventListener("click", () => {
    trainInfoPanel.classList.remove("visible");
  });
}

// ---- file loading ----

async function loadFile(file: File): Promise<void> {
  try {
    const result = await parseOudiaFile(file);
    currentRoute = result.route;

    renderer = new CTCRenderer(canvas);
    renderer.setRoute(currentRoute);

    engine = new SimulationEngine(currentRoute, 0);
    minTime = engine.getEarliestTime();
    maxTime = engine.getLatestTime();

    timeSlider.min = minTime.toString();
    timeSlider.max = maxTime.toString();
    currentTime = minTime;
    timeSlider.value = currentTime.toString();

    const dia = currentRoute.diagrams[0];
    routeInfo.textContent = `${currentRoute.name || file.name} — ${dia?.name ?? ""}`;
    trainCountEl.textContent = `${currentRoute.stations.length}駅 / 下り${dia?.downTrains.length ?? 0}本 上り${dia?.upTrains.length ?? 0}本`;

    dropOverlay.style.display = "none";
    trainInfoPanel.classList.remove("visible");
    resizeCanvas();
    renderFrame();
  } catch (e) {
    routeInfo.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ---- render loop ----

function renderFrame(): void {
  if (!renderer || !engine) return;

  lastPositions = engine.getPositions(currentTime);
  renderer.render(lastPositions, currentTime);

  const baseInfo = trainCountEl.textContent?.replace(/\/ 表示.+$/, "").trim() ?? "";
  trainCountEl.textContent = `${baseInfo} / 表示${lastPositions.length}本`;
  timeDisplay.textContent = fmtTimeSec(currentTime);
  timeSlider.value = currentTime.toString();
}

function animationLoop(timestamp: number): void {
  if (isPlaying && engine) {
    if (lastFrameTime !== null) {
      const deltaMs = timestamp - lastFrameTime;
      const deltaMinutes = (deltaMs / 1000) * playSpeed;
      currentTime += deltaMinutes;
      if (currentTime > maxTime) {
        currentTime = minTime;
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

btnLabelMode.addEventListener("click", () => {
  if (!renderer) return;
  const next: TrainLabelMode = renderer.labelMode === "number" ? "type" : "number";
  renderer.labelMode = next;
  btnLabelMode.textContent = next === "number" ? "番号" : "種別";
  renderFrame();
});

// ---- canvas click → train info ----

canvas.addEventListener("click", (e) => {
  if (!renderer) return;
  const rect = canvas.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;

  const hit = renderer.hitTest(cssX, cssY, lastPositions);
  if (hit) {
    showTrainInfo(hit);
  }
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
  } else if (e.key === "Escape") {
    trainInfoPanel.classList.remove("visible");
  }
});

// ---- init ----

window.addEventListener("resize", resizeCanvas);
requestAnimationFrame(animationLoop);
