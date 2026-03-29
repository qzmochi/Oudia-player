import type { Route, Train } from "../model/types";
import { StopType } from "../model/types";
import type { TrainPosition } from "../renderer/ctc-renderer";

interface TrainSegment {
  startIdx: number;
  endIdx: number;
  startTime: number;
  endTime: number;
}

/** 終着駅での滞留表示時間（分） */
const TERMINAL_DWELL_MINUTES = 3;
/** 停車駅でのデフォルト最小停車時間（分）— 着=発 or 発のみの場合に適用 */
const MIN_STOP_DWELL_MINUTES = 0.5;

/**
 * 列車の運行セグメントを事前計算する。
 *
 * パーサーで上り列車の stationTimes は反転済み:
 *   stationTimes[i] は stations[i] に対応する。
 *
 * 下り: 駅インデックス昇順に時刻が増加 → そのまま正方向に走査
 * 上り: 駅インデックス降順に時刻が増加 → 逆方向に走査
 */
function buildSegments(train: Train, stationCount: number): TrainSegment[] {
  const segments: TrainSegment[] = [];
  const times = train.stationTimes;
  const isNobori = train.direction === "Nobori";

  // 時刻情報を持つ停車/通過駅のインデックスを走査順に収集
  const indices: number[] = [];
  if (isNobori) {
    for (let i = Math.min(times.length, stationCount) - 1; i >= 0; i--) {
      const st = times[i];
      if (st.stopType === StopType.NotOperate || st.stopType === StopType.Direct) continue;
      if (st.arrival === undefined && st.departure === undefined) continue;
      indices.push(i);
    }
  } else {
    for (let i = 0; i < Math.min(times.length, stationCount); i++) {
      const st = times[i];
      if (st.stopType === StopType.NotOperate || st.stopType === StopType.Direct) continue;
      if (st.arrival === undefined && st.departure === undefined) continue;
      indices.push(i);
    }
  }

  // 連続する駅間のセグメントを生成
  for (let k = 0; k < indices.length - 1; k++) {
    const fromIdx = indices[k];
    const toIdx = indices[k + 1];
    const from = times[fromIdx];
    const to = times[toIdx];

    const startTime = from.departure ?? from.arrival!;
    const endTime = to.arrival ?? to.departure!;

    if (endTime <= startTime) continue;

    segments.push({
      startIdx: fromIdx,
      endIdx: toIdx,
      startTime,
      endTime,
    });
  }

  return segments;
}

function getTrainPosition(
  train: Train,
  segments: TrainSegment[],
  currentTime: number
): TrainPosition | null {
  if (segments.length === 0) return null;

  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];

  // 始発駅: arrival があればそこから、なければ発車の少し前から表示
  const firstStopTime = train.stationTimes[firstSeg.startIdx];
  const trainStart = firstStopTime?.arrival
    ?? (firstSeg.startTime - MIN_STOP_DWELL_MINUTES);

  const trainEnd = lastSeg.endTime + TERMINAL_DWELL_MINUTES;

  if (currentTime < trainStart || currentTime > trainEnd) return null;

  // 最初のセグメント開始前 → 始発駅で停車中
  if (currentTime < firstSeg.startTime) {
    return {
      train,
      stationProgress: firstSeg.startIdx,
      isStopped: true,
      trackIndex: train.stationTimes[firstSeg.startIdx]?.trackIndex,
    };
  }

  // 最後のセグメント到着後 → 終着駅で停車中
  if (currentTime >= lastSeg.endTime) {
    return {
      train,
      stationProgress: lastSeg.endIdx,
      isStopped: true,
      trackIndex: train.stationTimes[lastSeg.endIdx]?.trackIndex,
    };
  }

  // セグメント探索
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // セグメント間の停車（着=発でも最小停車時間を確保）
    if (i > 0) {
      const prevSeg = segments[i - 1];
      const dwellEnd = Math.max(seg.startTime, prevSeg.endTime + MIN_STOP_DWELL_MINUTES);
      if (currentTime >= prevSeg.endTime && currentTime < dwellEnd) {
        return {
          train,
          stationProgress: seg.startIdx,
          isStopped: true,
          trackIndex: train.stationTimes[seg.startIdx]?.trackIndex,
        };
      }
    }

    // セグメント内 → 駅間を移動中
    if (currentTime >= seg.startTime && currentTime < seg.endTime) {
      const duration = seg.endTime - seg.startTime;
      const elapsed = currentTime - seg.startTime;
      const ratio = elapsed / duration;
      const progress = seg.startIdx + (seg.endIdx - seg.startIdx) * ratio;

      return {
        train,
        stationProgress: progress,
        isStopped: false,
      };
    }
  }

  return null;
}

export class SimulationEngine {
  private route: Route;
  private diagramIndex: number;
  private downSegments: TrainSegment[][] = [];
  private upSegments: TrainSegment[][] = [];

  constructor(route: Route, diagramIndex = 0) {
    this.route = route;
    this.diagramIndex = diagramIndex;
    this.buildAllSegments();
  }

  private buildAllSegments(): void {
    const dia = this.route.diagrams[this.diagramIndex];
    if (!dia) return;

    const stationCount = this.route.stations.length;
    this.downSegments = dia.downTrains.map((t) =>
      buildSegments(t, stationCount)
    );
    this.upSegments = dia.upTrains.map((t) =>
      buildSegments(t, stationCount)
    );
  }

  getPositions(currentTime: number): TrainPosition[] {
    const dia = this.route.diagrams[this.diagramIndex];
    if (!dia) return [];

    const positions: TrainPosition[] = [];

    for (let i = 0; i < dia.downTrains.length; i++) {
      const pos = getTrainPosition(
        dia.downTrains[i],
        this.downSegments[i],
        currentTime
      );
      if (pos) positions.push(pos);
    }

    for (let i = 0; i < dia.upTrains.length; i++) {
      const pos = getTrainPosition(
        dia.upTrains[i],
        this.upSegments[i],
        currentTime
      );
      if (pos) positions.push(pos);
    }

    return positions;
  }

  getEarliestTime(): number {
    const dia = this.route.diagrams[this.diagramIndex];
    if (!dia) return 0;

    let earliest = Infinity;
    for (const train of [...dia.downTrains, ...dia.upTrains]) {
      for (const st of train.stationTimes) {
        if (st.arrival !== undefined && st.arrival < earliest) earliest = st.arrival;
        if (st.departure !== undefined && st.departure < earliest) earliest = st.departure;
      }
    }
    return earliest === Infinity ? 0 : earliest;
  }

  getLatestTime(): number {
    const dia = this.route.diagrams[this.diagramIndex];
    if (!dia) return 1440;

    let latest = 0;
    for (const train of [...dia.downTrains, ...dia.upTrains]) {
      for (const st of train.stationTimes) {
        if (st.arrival !== undefined && st.arrival > latest) latest = st.arrival;
        if (st.departure !== undefined && st.departure > latest) latest = st.departure;
      }
    }
    return latest === 0 ? 1440 : latest;
  }
}
