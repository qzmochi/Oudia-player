import type { Route, Station, Train } from "../model/types";

/** レンダラー設定 */
export interface CTCRendererConfig {
  /** Canvas 左右の余白 */
  paddingX: number;
  /** Canvas 上下の余白 */
  paddingY: number;
  /** 駅ラベルの高さ */
  stationLabelHeight: number;
  /** 本線の太さ */
  mainTrackWidth: number;
  /** 副本線の太さ */
  sideTrackWidth: number;
  /** 駅構内の幅（px） */
  stationZoneWidth: number;
  /** 列車標識の幅 */
  trainLabelWidth: number;
  /** 列車標識の高さ */
  trainLabelHeight: number;
  /** 列車標識のフォントサイズ */
  trainFontSize: number;
  /** 駅名フォントサイズ */
  stationFontSize: number;
  /** 背景色 */
  bgColor: string;
  /** 線路の色 */
  trackColor: string;
  /** 駅名の色 */
  stationLabelColor: string;
}

const DEFAULT_CONFIG: CTCRendererConfig = {
  paddingX: 60,
  paddingY: 80,
  stationLabelHeight: 50,
  mainTrackWidth: 3,
  sideTrackWidth: 1.5,
  stationZoneWidth: 40,
  trainLabelWidth: 50,
  trainLabelHeight: 18,
  trainFontSize: 11,
  stationFontSize: 12,
  bgColor: "#1a1a2e",
  trackColor: "#888888",
  stationLabelColor: "#cccccc",
};

/** 列車の現在位置 */
export interface TrainPosition {
  train: Train;
  /** 駅インデックス（小数で駅間を表現。3.5 = 駅3と駅4の中間） */
  stationProgress: number;
  /** 使用中の番線インデックス（駅に停車中の場合） */
  trackIndex?: number;
  /** 停車中かどうか */
  isStopped: boolean;
}

/** OuDia の色文字列 (00BBGGRR) → CSS色に変換 */
function oudColorToCSS(oudColor: string | undefined, fallback: string): string {
  if (!oudColor || oudColor.length < 8) return fallback;
  // OuDia: 00BBGGRR → #RRGGBB
  const r = oudColor.slice(6, 8);
  const g = oudColor.slice(4, 6);
  const b = oudColor.slice(2, 4);
  return `#${r}${g}${b}`;
}

export class CTCRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: CTCRendererConfig;
  private route: Route | null = null;

  /** 各駅の X 座標キャッシュ */
  private stationX: number[] = [];
  /** 線路の Y 座標 */
  private trackY = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    config?: Partial<CTCRendererConfig>
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setRoute(route: Route): void {
    this.route = route;
    this.layoutStations();
  }

  /** 駅の X 座標を計算 */
  private layoutStations(): void {
    if (!this.route) return;
    const { paddingX } = this.config;
    const stations = this.route.stations;
    const usableWidth = this.canvas.width - paddingX * 2;

    // NextEkiDistance がある場合は距離比例、なければ等間隔
    const hasDistance = stations.some((s) => s.nextStationDistance !== undefined);

    if (hasDistance) {
      const distances: number[] = [];
      let totalDist = 0;
      for (let i = 0; i < stations.length - 1; i++) {
        const d = stations[i].nextStationDistance ?? 10;
        distances.push(d);
        totalDist += d;
      }
      this.stationX = [paddingX];
      let cumDist = 0;
      for (let i = 0; i < distances.length; i++) {
        cumDist += distances[i];
        this.stationX.push(paddingX + (cumDist / totalDist) * usableWidth);
      }
    } else {
      this.stationX = stations.map(
        (_, i) => paddingX + (i / (stations.length - 1)) * usableWidth
      );
    }

    this.trackY =
      this.config.paddingY + this.config.stationLabelHeight + 30;
  }

  /** フレーム描画 */
  render(trainPositions: TrainPosition[], currentTimeMinutes: number): void {
    const { ctx, canvas, config } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.route) return;

    this.drawTimeDisplay(currentTimeMinutes);
    this.drawTracks();
    this.drawStationLabels();
    this.drawTrains(trainPositions);
  }

  /** 時刻表示 */
  private drawTimeDisplay(minutes: number): void {
    const { ctx, canvas, config } = this;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const s = Math.floor((minutes % 1) * 60);
    const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    ctx.font = `bold 20px monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(timeStr, canvas.width - config.paddingX, config.paddingY - 10);
  }

  /** 線路と駅構内を描画 */
  private drawTracks(): void {
    const { ctx, config, stationX, trackY } = this;
    if (!this.route) return;

    const stations = this.route.stations;

    // 駅間の本線
    ctx.strokeStyle = config.trackColor;
    ctx.lineWidth = config.mainTrackWidth;
    ctx.beginPath();
    ctx.moveTo(stationX[0], trackY);
    ctx.lineTo(stationX[stationX.length - 1], trackY);
    ctx.stroke();

    // 各駅の構内表現
    for (let i = 0; i < stations.length; i++) {
      this.drawStationYard(stations[i], stationX[i]);
    }
  }

  /** 駅構内の配線を描画 */
  private drawStationYard(station: Station, x: number): void {
    const { ctx, config, trackY } = this;
    const halfZone = config.stationZoneWidth / 2;
    const trackCount = Math.max(station.tracks.length, 1);

    // 駅のマーカー（縦線）
    ctx.strokeStyle = config.stationLabelColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, trackY - 8);
    ctx.lineTo(x, trackY + 8);
    ctx.stroke();

    if (trackCount <= 1) return;

    // 副本線を描画（本線の上下に分岐）
    const spacing = 12;
    for (let t = 0; t < trackCount; t++) {
      const isDownMain = t === station.downMain;
      const isUpMain = t === station.upMain;
      if (isDownMain || isUpMain) continue;

      // 副本線は本線の上か下にオフセット
      const offsetY = t < station.downMain ? -spacing * (station.downMain - t) : spacing * (t - station.upMain);
      const y = trackY + offsetY;

      ctx.strokeStyle = config.trackColor;
      ctx.lineWidth = config.sideTrackWidth;
      ctx.beginPath();
      // 分岐 → 副本線 → 合流
      ctx.moveTo(x - halfZone, trackY);
      ctx.lineTo(x - halfZone * 0.5, y);
      ctx.lineTo(x + halfZone * 0.5, y);
      ctx.lineTo(x + halfZone, trackY);
      ctx.stroke();
    }
  }

  /** 駅名ラベルを描画 */
  private drawStationLabels(): void {
    const { ctx, config, stationX } = this;
    if (!this.route) return;

    ctx.font = `${config.stationFontSize}px sans-serif`;
    ctx.fillStyle = config.stationLabelColor;
    ctx.textAlign = "center";

    for (let i = 0; i < this.route.stations.length; i++) {
      const station = this.route.stations[i];
      const x = stationX[i];
      const label = station.nameShort ?? station.name;

      // 縦書き風に1文字ずつ描画（長い駅名対策）
      if (label.length > 4) {
        ctx.font = `${config.stationFontSize - 2}px sans-serif`;
        const charHeight = config.stationFontSize;
        const startY = config.paddingY;
        for (let c = 0; c < label.length; c++) {
          ctx.fillText(label[c], x, startY + c * charHeight);
        }
        ctx.font = `${config.stationFontSize}px sans-serif`;
      } else {
        // 横書き（短い駅名）
        ctx.save();
        ctx.translate(x, config.paddingY + config.stationLabelHeight / 2);
        ctx.rotate(-Math.PI / 6); // 斜め表示
        ctx.fillText(label, 0, 0);
        ctx.restore();
      }
    }
  }

  /** 列車標識を描画 */
  private drawTrains(positions: TrainPosition[]): void {
    for (const pos of positions) {
      this.drawTrainLabel(pos);
    }
  }

  /** 1つの列車標識を描画 */
  private drawTrainLabel(pos: TrainPosition): void {
    const { ctx, config, stationX, trackY } = this;
    if (!this.route) return;

    const train = pos.train;
    const trainType = this.route.trainTypes[train.typeIndex];
    const color = oudColorToCSS(trainType?.diagramLineColor, "#00ff00");

    // X座標: stationProgress から補間
    const idx = Math.floor(pos.stationProgress);
    const frac = pos.stationProgress - idx;
    const x0 = stationX[Math.min(idx, stationX.length - 1)];
    const x1 = stationX[Math.min(idx + 1, stationX.length - 1)];
    const x = x0 + (x1 - x0) * frac;

    // Y座標: 基本は本線上、上下方向でオフセット
    const dirOffset = train.direction === "Kudari" ? -14 : 14;
    const y = trackY + dirOffset;

    // 列車標識の矩形
    const w = config.trainLabelWidth;
    const h = config.trainLabelHeight;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1.0;

    // 列車番号テキスト
    ctx.font = `bold ${config.trainFontSize}px monospace`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = train.number ?? "?";
    ctx.fillText(label, x, y);

    // 方向矢印
    ctx.fillStyle = color;
    const arrowX = train.direction === "Kudari" ? x + w / 2 + 4 : x - w / 2 - 4;
    ctx.beginPath();
    if (train.direction === "Kudari") {
      ctx.moveTo(arrowX, y);
      ctx.lineTo(arrowX + 6, y);
      ctx.lineTo(arrowX + 3, y - 4);
    } else {
      ctx.moveTo(arrowX, y);
      ctx.lineTo(arrowX - 6, y);
      ctx.lineTo(arrowX - 3, y - 4);
    }
    ctx.fill();
  }

  /** Canvas サイズ変更に対応 */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.layoutStations();
  }
}
