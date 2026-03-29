/** 駅の時刻表示形式 */
export type EkiJikokuKeisiki =
  | "Jikokukeisiki_Hatsu" // 発時刻のみ
  | "Jikokukeisiki_Hatsuchaku" // 着発時刻
  | "Jikokukeisiki_KudariChaku" // 下り着時刻
  | "Jikokukeisiki_NoboriChaku"; // 上り着時刻

/** 駅規模 */
export type EkiKibo =
  | "Ekikibo_Syuyou" // 主要駅
  | "Ekikibo_Ippan" // 一般駅
  | "Ekikibo_Seishijo"; // 制紙場（信号場）

/** 番線定義 */
export interface Track {
  name: string;
  shortName: string;
  shortNameNobori?: string;
}

/** 駅 */
export interface Station {
  name: string;
  nameShort?: string;
  timetableStyle: EkiJikokuKeisiki;
  scale: EkiKibo;
  tracks: Track[];
  downMain: number; // 下り本線の番線インデックス
  upMain: number; // 上り本線の番線インデックス
  nextStationDistance?: number;
  isBranchStation?: boolean;
  branchCoreStationIndex?: number;
}

/** 列車種別 */
export interface TrainType {
  name: string;
  shortName?: string;
  textColor?: string;
  diagramLineColor?: string;
  diagramLineStyle?: string;
  isBold?: boolean;
}

/** 停車種別 */
export enum StopType {
  NotOperate = 0, // 運行なし
  Stop = 1, // 停車
  Pass = 2, // 通過
  Direct = 3, // 経由なし
}

/** 駅ごとの時刻情報 */
export interface StationTime {
  stopType: StopType;
  arrival?: number; // 分単位 (HHMM → H*60+MM)
  departure?: number; // 分単位
  trackIndex?: number; // 使用番線インデックス
}

/** 列車 */
export interface Train {
  direction: "Kudari" | "Nobori";
  typeIndex: number;
  number?: string; // 列車番号
  name?: string; // 列車名
  stationTimes: StationTime[];
  comment?: string; // 備考
  operationNumber?: string; // 運用番号
}

/** ダイヤ */
export interface Diagram {
  name: string;
  downTrains: Train[];
  upTrains: Train[];
}

/** 路線（トップレベル） */
export interface Route {
  name: string;
  stations: Station[];
  trainTypes: TrainType[];
  diagrams: Diagram[];
  comment?: string;
  startTime?: number; // 起点時刻（分単位）
}
