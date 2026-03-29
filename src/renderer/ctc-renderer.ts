import type { Route, Train } from "../model/types";

export interface CTCRendererConfig {
  paddingX: number;
  paddingY: number;
  stationLabelHeight: number;
  mainTrackWidth: number;
  sideTrackWidth: number;
  /** 駅構内ゾーンの幅(px) — 番線の分岐・合流区間 */
  stationZoneWidth: number;
  trainLabelWidth: number;
  trainLabelHeight: number;
  trainFontSize: number;
  stationFontSize: number;
  /** 複線の上下間隔 */
  doubleTrackGap: number;
  /** 駅構内の番線間隔 */
  platformSpacing: number;
  bgColor: string;
  trackColor: string;
  trackColorMain: string;
  stationLabelColor: string;
}

const DEFAULT_CONFIG: CTCRendererConfig = {
  paddingX: 60,
  paddingY: 80,
  stationLabelHeight: 50,
  mainTrackWidth: 2.5,
  sideTrackWidth: 1.5,
  stationZoneWidth: 60,
  trainLabelWidth: 52,
  trainLabelHeight: 18,
  trainFontSize: 11,
  stationFontSize: 12,
  doubleTrackGap: 20,
  platformSpacing: 14,
  bgColor: "#1a1a2e",
  trackColor: "#555555",
  trackColorMain: "#777777",
  stationLabelColor: "#cccccc",
};

export type TrainLabelMode = "number" | "type";

export interface TrainPosition {
  train: Train;
  stationProgress: number;
  trackIndex?: number;
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

/**
 * 駅の番線レイアウト情報（事前計算）
 * 各番線の Y オフセット（centerY=0 基準）
 */
interface StationLayout {
  /** 番線ごとの Y オフセット（上が負、下が正） */
  trackYOffsets: number[];
  /** 下り本線の Y オフセット */
  downMainY: number;
  /** 上り本線の Y オフセット */
  upMainY: number;
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

  /** 各駅のレイアウト情報 */
  private stationLayouts: StationLayout[] = [];
  /** 駅間の線路本数 (stationIndex → tracks, default 2) */
  private sectionTrackCount: Map<number, number> = new Map();

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
    this.buildStationLayouts();
  }

  /** 駅間の線路本数マップを設定 */
  setSectionTrackCount(map: Map<number, number>): void {
    this.sectionTrackCount = map;
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

    this.centerY = this.config.paddingY + this.config.stationLabelHeight + 50;
    this.upTrackY = this.centerY - doubleTrackGap / 2;
    this.downTrackY = this.centerY + doubleTrackGap / 2;
  }

  /** 各駅の番線 Y オフセットを事前計算 */
  private buildStationLayouts(): void {
    if (!this.route) return;
    const { platformSpacing, doubleTrackGap } = this.config;

    this.stationLayouts = this.route.stations.map((station) => {
      const trackCount = Math.max(station.tracks.length, 1);
      const downMain = station.downMain;
      const upMain = station.upMain;

      if (trackCount <= 1) {
        // 1番線のみ（信号場等）
        return {
          trackYOffsets: [0],
          downMainY: 0,
          upMainY: 0,
        };
      }

      // 番線の Y オフセットを計算
      // 左側通行: Kudari(下り)=上線路, Nobori(上り)=下線路
      //   → DownMain = 上側 (負), UpMain = 下側 (正)
      const offsets: number[] = new Array(trackCount).fill(0);
      const halfGap = doubleTrackGap / 2;

      if (upMain === downMain) {
        // 単線駅: 全番線を中央付近に配置
        for (let t = 0; t < trackCount; t++) {
          offsets[t] = (t - (trackCount - 1) / 2) * platformSpacing;
        }
      } else {
        // 複線駅: DownMain=上側, UpMain=下側
        offsets[downMain] = -halfGap;
        offsets[upMain] = halfGap;

        for (let t = 0; t < trackCount; t++) {
          if (t === downMain || t === upMain) continue;

          const mainMin = Math.min(downMain, upMain);
          const mainMax = Math.max(downMain, upMain);

          if (t < mainMin) {
            // 両本線より上
            offsets[t] = offsets[mainMin] - platformSpacing * (mainMin - t);
          } else if (t > mainMax) {
            // 両本線より下
            offsets[t] = offsets[mainMax] + platformSpacing * (t - mainMax);
          } else {
            // 本線の間: 線形補間
            const ratio = (t - downMain) / (upMain - downMain);
            offsets[t] = offsets[downMain] + (offsets[upMain] - offsets[downMain]) * ratio;
          }
        }
      }

      return {
        trackYOffsets: offsets,
        downMainY: offsets[downMain],
        upMainY: offsets[upMain],
      };
    });
  }

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

  /** 線路と駅構内配線を描画 */
  private drawTracks(): void {
    const { ctx, config, stationX } = this;
    if (!this.route) return;

    const stations = this.route.stations;

    // 駅間の線路を描画（単線/複線に応じて）
    for (let i = 0; i < stations.length - 1; i++) {
      const x0 = stationX[i];
      const x1 = stationX[i + 1];
      const zone0 = config.stationZoneWidth / 2;
      const zone1 = config.stationZoneWidth / 2;
      const tracks = this.sectionTrackCount.get(i) ?? 2;

      ctx.strokeStyle = config.trackColorMain;
      ctx.lineWidth = config.mainTrackWidth;

      if (tracks === 1) {
        // 単線: 中央1本
        ctx.beginPath();
        ctx.moveTo(x0 + zone0, this.centerY);
        ctx.lineTo(x1 - zone1, this.centerY);
        ctx.stroke();
      } else {
        // 複線: 上下2本
        ctx.beginPath();
        ctx.moveTo(x0 + zone0, this.upTrackY);
        ctx.lineTo(x1 - zone1, this.upTrackY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x0 + zone0, this.downTrackY);
        ctx.lineTo(x1 - zone1, this.downTrackY);
        ctx.stroke();
      }
    }

    // 各駅の構内配線を描画
    for (let i = 0; i < stations.length; i++) {
      this.drawStationYard(i);
    }
  }

  /** 駅構内の配線を描画 */
  private drawStationYard(stationIdx: number): void {
    const { ctx, config, stationX, centerY } = this;
    if (!this.route) return;

    const station = this.route.stations[stationIdx];
    const layout = this.stationLayouts[stationIdx];
    const x = stationX[stationIdx];
    const halfZone = config.stationZoneWidth / 2;
    const trackCount = Math.max(station.tracks.length, 1);

    // 各番線を描画
    for (let t = 0; t < trackCount; t++) {
      const trackY = centerY + layout.trackYOffsets[t];
      const isDownMain = t === station.downMain;
      const isUpMain = t === station.upMain;
      const isMain = isDownMain || isUpMain;

      ctx.strokeStyle = isMain ? config.trackColorMain : config.trackColor;
      ctx.lineWidth = isMain ? config.mainTrackWidth : config.sideTrackWidth;

      // 分岐元の Y を決定
      // DownMain → 上線路(upTrackY)から分岐, UpMain → 下線路(downTrackY)から分岐
      let entryFromY: number;
      if (station.downMain === station.upMain) {
        // 単線駅: 中央から分岐
        entryFromY = centerY;
      } else if (isDownMain) {
        entryFromY = this.upTrackY; // 下り本線 = 上線路
      } else if (isUpMain) {
        entryFromY = this.downTrackY; // 上り本線 = 下線路
      } else {
        // 副本線: 近い方の本線から分岐
        const distToUp = Math.abs(trackY - this.upTrackY);
        const distToDown = Math.abs(trackY - this.downTrackY);
        entryFromY = distToUp < distToDown ? this.upTrackY : this.downTrackY;
      }

      ctx.beginPath();
      // 左側分岐
      ctx.moveTo(x - halfZone, entryFromY);
      ctx.lineTo(x - halfZone * 0.4, trackY);
      // 番線の直線部分
      ctx.lineTo(x + halfZone * 0.4, trackY);
      // 右側合流
      ctx.lineTo(x + halfZone, entryFromY);
      ctx.stroke();

      // 番線上にホーム表現（小さい四角）
      if (trackCount > 1) {
        ctx.fillStyle = isMain ? "#444466" : "#333355";
        ctx.fillRect(x - halfZone * 0.3, trackY - 2, halfZone * 0.6, 4);
      }
    }

    // 駅名の縦マーカー
    ctx.strokeStyle = config.stationLabelColor;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    const topY = centerY + Math.min(...layout.trackYOffsets) - 12;
    const botY = centerY + Math.max(...layout.trackYOffsets) + 12;
    ctx.moveTo(x, topY);
    ctx.lineTo(x, botY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
  }

  private drawStationLabels(): void {
    const { ctx, config, stationX } = this;
    if (!this.route) return;

    ctx.fillStyle = config.stationLabelColor;

    for (let i = 0; i < this.route.stations.length; i++) {
      const station = this.route.stations[i];
      const x = stationX[i];
      const label = station.nameShort ?? station.name;
      const isMajor = station.scale === "Ekikibo_Syuyou";

      ctx.font = `${isMajor ? "bold " : ""}${config.stationFontSize}px sans-serif`;

      ctx.save();
      ctx.translate(x, config.paddingY + 10);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "left";
      ctx.fillText(label, 0, 0);
      ctx.restore();
    }
  }

  private drawTrains(positions: TrainPosition[]): void {
    for (const pos of positions) {
      this.drawTrainLabel(pos);
    }
  }

  /** 列車の描画 X 座標 */
  private getTrainX(progress: number): number {
    const { stationX } = this;
    const idx = Math.floor(progress);
    const frac = progress - idx;
    const x0 = stationX[Math.min(idx, stationX.length - 1)];
    const x1 = stationX[Math.min(idx + 1, stationX.length - 1)];
    return x0 + (x1 - x0) * frac;
  }

  /**
   * 列車の描画 Y 座標を計算。
   * 駅に近づくと番線に向かって分岐、駅間では本線上。
   */
  private getTrainY(pos: TrainPosition): number {
    const { centerY } = this;
    const train = pos.train;
    const isKudari = train.direction === "Kudari";

    // 基本の走行 Y
    // 単線区間: 中央を走行（上下で少しオフセット）
    // 複線区間: 左側通行（Kudari=上線路, Nobori=下線路）
    const sectionIdx = Math.floor(pos.stationProgress);
    const sectionTracks = this.sectionTrackCount.get(
      Math.min(Math.max(sectionIdx, 0), (this.route?.stations.length ?? 1) - 2)
    ) ?? 2;
    const runningY = sectionTracks === 1
      ? this.centerY + (isKudari ? -4 : 4)  // 単線: 中央で上下が少しずれる
      : isKudari ? this.upTrackY : this.downTrackY;

    // 駅に停車中 or 駅付近にいる場合、番線の Y に移動
    const nearestIdx = Math.round(pos.stationProgress);
    const distToStation = Math.abs(pos.stationProgress - nearestIdx);

    if (distToStation < 0.4 && this.route && nearestIdx >= 0 && nearestIdx < this.route.stations.length) {
      const layout = this.stationLayouts[nearestIdx];
      const trackIdx = pos.trackIndex;

      if (trackIdx !== undefined && trackIdx < layout.trackYOffsets.length) {
        const platformY = centerY + layout.trackYOffsets[trackIdx];
        // 駅に近づくにつれ番線位置へスムーズに移動
        const t = 1 - distToStation / 0.4; // 0→1 (遠→近)
        const eased = t * t * (3 - 2 * t); // smoothstep
        return runningY + (platformY - runningY) * eased;
      }
    }

    return runningY;
  }

  private drawTrainLabel(pos: TrainPosition): void {
    const { ctx, config } = this;
    if (!this.route) return;

    const train = pos.train;
    const trainType = this.route.trainTypes[train.typeIndex];
    const color = oudColorToCSS(trainType?.diagramLineColor, "#00ff00");

    const x = this.getTrainX(pos.stationProgress);
    const y = this.getTrainY(pos);

    const w = config.trainLabelWidth;
    const h = config.trainLabelHeight;
    const isRight = train.direction === "Kudari";
    const arrowW = 8;

    // 背景
    ctx.fillStyle = color;
    ctx.globalAlpha = pos.isStopped ? 0.95 : 0.8;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.globalAlpha = 1.0;

    // 停車中インジケータ（枠）
    if (pos.isStopped) {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    }

    // 方向三角
    ctx.fillStyle = "#ffffff";
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    if (isRight) {
      const ax = x + w / 2 - arrowW - 2;
      ctx.moveTo(ax, y - 5);
      ctx.lineTo(ax + arrowW, y);
      ctx.lineTo(ax, y + 5);
    } else {
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
      const typeName = trainType?.shortName ?? trainType?.name ?? "";
      const shortType = typeName.length > 3 ? typeName.slice(0, 3) : typeName;
      ctx.font = `bold ${config.trainFontSize - 1}px sans-serif`;
      ctx.fillText(shortType, x + textOffsetX, y);
    } else {
      ctx.font = `bold ${config.trainFontSize}px monospace`;
      ctx.fillText(train.number ?? "?", x + textOffsetX, y);
    }
  }

  hitTest(cssX: number, cssY: number, positions: TrainPosition[]): TrainPosition | null {
    const w = this.config.trainLabelWidth;
    const h = this.config.trainLabelHeight;

    for (const pos of positions) {
      const x = this.getTrainX(pos.stationProgress);
      const y = this.getTrainY(pos);

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
