import type { Route, Station, Train } from "../model/types";

/** レンダラー設定 */
export interface CTCRendererConfig {
  paddingX: number;
  paddingY: number;
  stationLabelHeight: number;
  mainTrackWidth: number;
  sideTrackWidth: number;
  stationZoneWidth: number;
  trainLabelWidth: number;
  trainLabelHeight: number;
  trainFontSize: number;
  stationFontSize: number;
  /** 複線の上下間隔 */
  doubleTrackGap: number;
  bgColor: string;
  trackColor: string;
  stationLabelColor: string;
}

const DEFAULT_CONFIG: CTCRendererConfig = {
  paddingX: 60,
  paddingY: 80,
  stationLabelHeight: 50,
  mainTrackWidth: 2.5,
  sideTrackWidth: 1.5,
  stationZoneWidth: 40,
  trainLabelWidth: 52,
  trainLabelHeight: 18,
  trainFontSize: 11,
  stationFontSize: 12,
  doubleTrackGap: 20,
  bgColor: "#1a1a2e",
  trackColor: "#666666",
  stationLabelColor: "#cccccc",
};

/** 列車標識の表示モード */
export type TrainLabelMode = "number" | "type";

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
  const r = oudColor.slice(6, 8);
  const g = oudColor.slice(4, 6);
  const b = oudColor.slice(2, 4);
  return `#${r}${g}${b}`;
}

export class CTCRenderer {
  private ctx: CanvasRenderingContext2D;
  private config: CTCRendererConfig;
  private route: Route | null = null;

  private stationX: number[] = [];
  private upTrackY = 0;
  private downTrackY = 0;
  private centerY = 0;
  private _labelMode: TrainLabelMode = "number";

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

  set labelMode(mode: TrainLabelMode) {
    this._labelMode = mode;
  }

  get labelMode(): TrainLabelMode {
    return this._labelMode;
  }

  private layoutStations(): void {
    if (!this.route) return;
    const { paddingX, doubleTrackGap } = this.config;
    const stations = this.route.stations;
    const usableWidth = this.canvas.width - paddingX * 2;

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

    this.centerY = this.config.paddingY + this.config.stationLabelHeight + 40;
    this.upTrackY = this.centerY - doubleTrackGap / 2;
    this.downTrackY = this.centerY + doubleTrackGap / 2;
  }

  /** フレーム描画 */
  render(trainPositions: TrainPosition[], currentTimeMinutes: number): void {
    const { ctx, canvas, config } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.route) return;

    this.drawTimeDisplay(currentTimeMinutes);
    this.drawTracks();
    this.drawStationLabels();
    this.drawTrains(trainPositions);
  }

  private drawTimeDisplay(minutes: number): void {
    const { ctx, canvas, config } = this;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const s = Math.floor((minutes % 1) * 60);
    const timeStr = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;

    ctx.font = "bold 20px monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "right";
    ctx.fillText(timeStr, canvas.width - config.paddingX, config.paddingY - 10);
  }

  /** 複線の線路と駅構内を描画 */
  private drawTracks(): void {
    const { ctx, config, stationX, upTrackY, downTrackY } = this;
    if (!this.route) return;

    const x0 = stationX[0];
    const xN = stationX[stationX.length - 1];

    // 上り線（上）
    ctx.strokeStyle = config.trackColor;
    ctx.lineWidth = config.mainTrackWidth;
    ctx.beginPath();
    ctx.moveTo(x0, upTrackY);
    ctx.lineTo(xN, upTrackY);
    ctx.stroke();

    // 下り線（下）
    ctx.beginPath();
    ctx.moveTo(x0, downTrackY);
    ctx.lineTo(xN, downTrackY);
    ctx.stroke();

    // 各駅のマーカー
    for (let i = 0; i < this.route.stations.length; i++) {
      this.drawStationMarker(this.route.stations[i], stationX[i]);
    }
  }

  /** 駅のマーカーを描画 */
  private drawStationMarker(station: Station, x: number): void {
    const { ctx, config, upTrackY, downTrackY } = this;

    // 駅の縦線（上り線～下り線を結ぶ）
    ctx.strokeStyle = config.stationLabelColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(x, upTrackY - 6);
    ctx.lineTo(x, downTrackY + 6);
    ctx.stroke();
    ctx.globalAlpha = 1.0;

    // 主要駅は太め表示
    if (station.scale === "Ekikibo_Syuyou") {
      ctx.strokeStyle = config.stationLabelColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, upTrackY - 8);
      ctx.lineTo(x, downTrackY + 8);
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }

  /** 駅名ラベルを描画 */
  private drawStationLabels(): void {
    const { ctx, config, stationX } = this;
    if (!this.route) return;

    ctx.fillStyle = config.stationLabelColor;
    ctx.textAlign = "center";

    for (let i = 0; i < this.route.stations.length; i++) {
      const station = this.route.stations[i];
      const x = stationX[i];
      const label = station.nameShort ?? station.name;
      const isMajor = station.scale === "Ekikibo_Syuyou";

      ctx.font = `${isMajor ? "bold " : ""}${config.stationFontSize}px sans-serif`;

      // 斜め表示
      ctx.save();
      ctx.translate(x, config.paddingY + 10);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "left";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  /** 列車標識を描画 */
  private drawTrains(positions: TrainPosition[]): void {
    for (const pos of positions) {
      this.drawTrainLabel(pos);
    }
  }

  /** 列車の X 座標を計算 */
  private getTrainX(progress: number): number {
    const { stationX } = this;
    const idx = Math.floor(progress);
    const frac = progress - idx;
    const x0 = stationX[Math.min(idx, stationX.length - 1)];
    const x1 = stationX[Math.min(idx + 1, stationX.length - 1)];
    return x0 + (x1 - x0) * frac;
  }

  /** 列車の Y 座標を取得（左側通行: 右行き=上線路, 左行き=下線路） */
  private getTrainY(direction: "Kudari" | "Nobori"): number {
    // Kudari = 駅インデックス昇順 = 右方向(→) = 上の線路
    // Nobori = 駅インデックス降順 = 左方向(←) = 下の線路
    return direction === "Kudari" ? this.upTrackY : this.downTrackY;
  }

  /** 1つの列車標識を描画 */
  private drawTrainLabel(pos: TrainPosition): void {
    const { ctx, config } = this;
    if (!this.route) return;

    const train = pos.train;
    const trainType = this.route.trainTypes[train.typeIndex];
    const color = oudColorToCSS(trainType?.diagramLineColor, "#00ff00");

    const x = this.getTrainX(pos.stationProgress);
    const baseY = this.getTrainY(train.direction);
    // 列車標識を線路から外側にオフセット（Kudari=上線路→さらに上, Nobori=下線路→さらに下）
    const labelOffset = train.direction === "Kudari" ? -14 : 14;
    const y = baseY + labelOffset;

    const w = config.trainLabelWidth;
    const h = config.trainLabelHeight;

    // 方向三角 ◀ or ▶ を標識の左端/右端に表示
    const isRight = train.direction === "Kudari"; // 下り = 右方向
    const arrowW = 8;

    // 背景矩形
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1.0;

    // 方向三角
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    if (isRight) {
      // ▶ 右向き三角（標識の右端）
      const ax = x + w / 2 - arrowW - 2;
      ctx.moveTo(ax, y - 5);
      ctx.lineTo(ax + arrowW, y);
      ctx.lineTo(ax, y + 5);
    } else {
      // ◀ 左向き三角（標識の左端）
      const ax = x - w / 2 + arrowW + 2;
      ctx.moveTo(ax, y - 5);
      ctx.lineTo(ax - arrowW, y);
      ctx.lineTo(ax, y + 5);
    }
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // テキスト
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textOffsetX = isRight ? -arrowW / 2 : arrowW / 2;

    if (this._labelMode === "type") {
      // 種別行先モード: 種別略称 + 行先
      const typeName = trainType?.shortName ?? trainType?.name ?? "";
      const shortType = typeName.length > 3 ? typeName.slice(0, 3) : typeName;
      ctx.font = `bold ${config.trainFontSize - 1}px sans-serif`;
      ctx.fillText(shortType, x + textOffsetX, y);
    } else {
      // 列車番号モード
      ctx.font = `bold ${config.trainFontSize}px monospace`;
      const label = train.number ?? "?";
      ctx.fillText(label, x + textOffsetX, y);
    }
  }

  /** 指定座標にある列車を返す（クリック判定） */
  hitTest(
    cssX: number,
    cssY: number,
    positions: TrainPosition[]
  ): TrainPosition | null {
    const { config } = this;
    const w = config.trainLabelWidth;
    const h = config.trainLabelHeight;

    for (const pos of positions) {
      const train = pos.train;
      const x = this.getTrainX(pos.stationProgress);
      const baseY = this.getTrainY(train.direction);
      const labelOffset = train.direction === "Kudari" ? -14 : 14;
      const y = baseY + labelOffset;

      if (
        cssX >= x - w / 2 &&
        cssX <= x + w / 2 &&
        cssY >= y - h / 2 &&
        cssY <= y + h / 2
      ) {
        return pos;
      }
    }
    return null;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.layoutStations();
  }
}
