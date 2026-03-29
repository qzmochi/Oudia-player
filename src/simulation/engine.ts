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

/**
 * 列車の運行セグメント（駅間ごとの発着時刻）を事前計算する。
 * パーサーで上り列車の stationTimes は反転済みなので、
 * stationTimes[i] は stations[i] に対応する。
 * ただし上りは時刻が降順になるため、時刻順にソートして処理する。
 */
function buildSegments(train: Train, stationCount: number): TrainSegment[] {
  const segments: TrainSegment[] = [];
  const times = train.stationTimes;

  interface StopInfo {
    stationIdx: number;
    arrivalTime: number | undefined;
    departureTime: number | undefined;
    stopType: StopType;
  }

  const stops: StopInfo[] = [];
  for (let i = 0; i < Math.min(times.length, stationCount); i++) {
    const st = times[i];
    if (st.stopType === StopType.NotOperate || st.stopType === StopType.Direct) continue;
    stops.push({
      stationIdx: i,
      arrivalTime: st.arrival,
      departureTime: st.departure,
      stopType: st.stopType,
    });
  }

  // 時刻順にソート（上り列車は駅インデックスと時刻順が逆）
  stops.sort((a, b) => {
    const tA = a.departureTime ?? a.arrivalTime ?? 0;
    const tB = b.departureTime ?? b.arrivalTime ?? 0;
    return tA - tB;
  });

  // 連続する停車駅間のセグメントを生成
  for (let i = 0; i < stops.length - 1; i++) {
    const from = stops[i];
    const to = stops[i + 1];

    const startTime = from.departureTime ?? from.arrivalTime;
    const endTime = to.arrivalTime ?? to.departureTime;

    if (startTime === undefined || endTime === undefined) continue;
    if (endTime <= startTime) continue; // 不正なセグメントをスキップ

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

  // 運行開始前 or 終了後チェック
  const firstSegStart = segments[0].startTime;
  const lastSegEnd = segments[segments.length - 1].endTime;

  // 最初の駅の到着時刻も考慮
  const firstStop = train.stationTimes.find(
    (st) => st.stopType === StopType.Stop || st.stopType === StopType.Pass
  );
  const trainStart = firstStop?.arrival ?? firstStop?.departure ?? firstSegStart;

  if (currentTime < trainStart || currentTime > lastSegEnd) return null;

  // どのセグメントにいるか探す
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // セグメント開始前 → 前の駅で停車中
    if (i === 0 && currentTime < seg.startTime && currentTime >= trainStart) {
      return {
        train,
        stationProgress: seg.startIdx,
        isStopped: true,
        trackIndex: train.stationTimes[seg.startIdx]?.trackIndex,
      };
    }

    // セグメント間（前のセグメント到着 ～ 次のセグメント発車）→ 駅で停車中
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
    if (currentTime >= seg.startTime && currentTime <= seg.endTime) {
      const duration = seg.endTime - seg.startTime;
      const elapsed = currentTime - seg.startTime;
      const ratio = duration > 0 ? elapsed / duration : 0;

      // 下り: startIdx → endIdx、上り: startIdx → endIdx（stationTimes の並び順）
      const progress = seg.startIdx + (seg.endIdx - seg.startIdx) * ratio;

      return {
        train,
        stationProgress: progress,
        isStopped: false,
      };
    }
  }

  // 最後のセグメント到着後 → 終着駅で停車中
  const lastSeg = segments[segments.length - 1];
  if (currentTime >= lastSeg.endTime) {
    return {
      train,
      stationProgress: lastSeg.endIdx,
      isStopped: true,
      trackIndex: train.stationTimes[lastSeg.endIdx]?.trackIndex,
    };
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
  /** 各列車のセグメントキャッシュ [downTrains, upTrains] */
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

  /**
   * 指定時刻における全列車の位置を返す。
   * @param currentTime 分単位（例: 10:30 = 630）
   */
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

  /** ダイヤに含まれる最初の列車の発時刻（分）を返す */
  getEarliestTime(): number {
    const dia = this.route.diagrams[this.diagramIndex];
    if (!dia) return 0;

    let earliest = Infinity;
    const checkTrains = [...dia.downTrains, ...dia.upTrains];
    for (const train of checkTrains) {
      for (const st of train.stationTimes) {
        if (st.departure !== undefined && st.departure < earliest) {
          earliest = st.departure;
        }
        if (st.arrival !== undefined && st.arrival < earliest) {
          earliest = st.arrival;
        }
      }
    }
    return earliest === Infinity ? 0 : earliest;
  }

  /** ダイヤに含まれる最後の列車の着時刻（分）を返す */
  getLatestTime(): number {
    const dia = this.route.diagrams[this.diagramIndex];
    if (!dia) return 1440;

    let latest = 0;
    const checkTrains = [...dia.downTrains, ...dia.upTrains];
    for (const train of checkTrains) {
      for (const st of train.stationTimes) {
        if (st.departure !== undefined && st.departure > latest) {
          latest = st.departure;
        }
        if (st.arrival !== undefined && st.arrival > latest) {
          latest = st.arrival;
        }
      }
    }
    return latest === 0 ? 1440 : latest;
  }
}
