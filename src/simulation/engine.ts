import type { Route, Train } from "../model/types";
import { StopType } from "../model/types";
import type { TrainPosition } from "../renderer/ctc-renderer";

/**
 * 列車の運行区間を表す。
 * startIdx/endIdx は駅インデックス、startTime/endTime は分単位。
 */
interface TrainSegment {
  startIdx: number;
  endIdx: number;
  startTime: number; // 分単位
  endTime: number;
}

/** 終着駅での滞留表示時間（分） */
const TERMINAL_DWELL_MINUTES = 3;

/**
 * 列車の運行セグメント（駅間ごとの発着時刻）を事前計算する。
 * パーサーで上り列車の stationTimes は反転済みなので、
 * stationTimes[i] は stations[i] に対応する。
 */
function buildSegments(train: Train, stationCount: number): TrainSegment[] {
  const segments: TrainSegment[] = [];
  const times = train.stationTimes;

  interface StopInfo {
    stationIdx: number;
    arrivalTime: number | undefined;
    departureTime: number | undefined;
  }

  // 時刻情報を持つ停車/通過駅のみ抽出
  const stops: StopInfo[] = [];
  for (let i = 0; i < Math.min(times.length, stationCount); i++) {
    const st = times[i];
    if (st.stopType === StopType.NotOperate || st.stopType === StopType.Direct) continue;
    // 時刻が全くない通過駅はスキップ
    if (st.arrival === undefined && st.departure === undefined) continue;
    stops.push({
      stationIdx: i,
      arrivalTime: st.arrival,
      departureTime: st.departure,
    });
  }

  // 時刻順にソート（上り列車は駅インデックスと時刻順が逆）
  stops.sort((a, b) => {
    const tA = a.departureTime ?? a.arrivalTime!;
    const tB = b.departureTime ?? b.arrivalTime!;
    return tA - tB;
  });

  // 連続する駅間のセグメントを生成
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];

    const startTime = from.departureTime ?? from.arrivalTime!;
    const endTime = to.arrivalTime ?? to.departureTime!;

    // 同時刻の場合はスキップ（分岐合流点など）
    if (endTime <= startTime) continue;

    segments.push({
      startIdx: from.stationIdx,
      endIdx: to.stationIdx,
      startTime,
      endTime,
    });
  }

  return segments;
}

/**
 * 列車が指定時刻に走行中かどうか・位置を計算する。
 */
function getTrainPosition(
  train: Train,
  segments: TrainSegment[],
  currentTime: number
): TrainPosition | null {
  if (segments.length === 0) return null;

  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];

  // 始発駅の着時刻（着時刻があれば発車前の停車を表現）
  const trainStart = Math.min(
    firstSeg.startTime,
    ...train.stationTimes
      .filter((st) => st.arrival !== undefined || st.departure !== undefined)
      .map((st) => st.arrival ?? st.departure!)
  );

  // 終着駅到着後も少し表示する
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

    // セグメント間の停車（前のセグメント到着 ～ このセグメント発車）
    if (i > 0) {
      const prevSeg = segments[i - 1];
      if (currentTime >= prevSeg.endTime && currentTime < seg.startTime) {
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

/**
 * シミュレーションエンジン。
 * 路線データを受け取り、任意の時刻における全列車の位置を計算する。
 */
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
