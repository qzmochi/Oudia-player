/** 路線の拡張情報（OuDia に含まれない配線・方向情報） */
export interface RouteExtension {
  description?: string;
  /** デフォルトの線路種別 */
  trackType?: "single" | "double";
  comment?: string;
  /** 駅間ごとの線路情報 */
  sections?: SectionInfo[];
  /** 方向ラベルのオーバーライド */
  directionLabels?: {
    kudari?: string;
    nobori?: string;
  };
}

export interface SectionInfo {
  from: string;
  to: string;
  /** 線路本数（1=単線, 2=複線） */
  tracks: number;
  note?: string;
}

/**
 * 拡張情報から駅間インデックスごとの線路本数マップを構築する。
 * @returns stationIndex → 次駅までの線路本数 (1 or 2)
 */
export function buildTrackCountMap(
  ext: RouteExtension,
  stationNames: string[]
): Map<number, number> {
  const map = new Map<number, number>();
  const defaultTracks = ext.trackType === "single" ? 1 : 2;

  // デフォルトで全区間を設定
  for (let i = 0; i < stationNames.length - 1; i++) {
    map.set(i, defaultTracks);
  }

  // sections でオーバーライド
  if (ext.sections) {
    for (const sec of ext.sections) {
      const fromIdx = stationNames.indexOf(sec.from);
      const toIdx = stationNames.indexOf(sec.to);
      if (fromIdx !== -1 && toIdx !== -1) {
        const lo = Math.min(fromIdx, toIdx);
        map.set(lo, sec.tracks);
      }
    }
  }

  return map;
}
