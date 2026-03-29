import {
  type Route,
  type Station,
  type Track,
  type TrainType,
  type Diagram,
  type Train,
  type StationTime,
  type EkiJikokuKeisiki,
  type EkiKibo,
  StopType,
} from "../model/types";

// ---- raw tree structure ----

interface RawNode {
  type: string;
  props: Map<string, string[]>;
  children: RawNode[];
}

/**
 * OuDia / OuDiaSecond テキストを RawNode ツリーにパースする。
 * 階層は "Name." で開始、"." 単独で終了。
 */
function parseRawTree(text: string): RawNode {
  const lines = text.split(/\r?\n/);
  const root: RawNode = { type: "Root", props: new Map(), children: [] };
  const stack: RawNode[] = [root];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;

    if (line === ".") {
      // 階層終了
      if (stack.length > 1) stack.pop();
      continue;
    }

    if (line.endsWith(".") && !line.includes("=")) {
      // 階層開始
      const node: RawNode = {
        type: line.slice(0, -1),
        props: new Map(),
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      continue;
    }

    // key=value
    const eqIdx = line.indexOf("=");
    if (eqIdx !== -1) {
      const key = line.slice(0, eqIdx);
      const value = line.slice(eqIdx + 1);
      const parent = stack[stack.length - 1];
      const existing = parent.props.get(key);
      if (existing) {
        existing.push(value);
      } else {
        parent.props.set(key, [value]);
      }
    }
  }

  return root;
}

// ---- helper ----

function prop(node: RawNode, key: string): string | undefined {
  return node.props.get(key)?.[0];
}

function propInt(node: RawNode, key: string): number | undefined {
  const v = prop(node, key);
  return v !== undefined ? parseInt(v, 10) : undefined;
}

function childrenOf(node: RawNode, type: string): RawNode[] {
  return node.children.filter((c) => c.type === type);
}

function firstChild(node: RawNode, type: string): RawNode | undefined {
  return node.children.find((c) => c.type === type);
}

// ---- time parsing ----

/**
 * OuDia 時刻文字列を分単位に変換する。
 * - "HMM" (3桁) → 例: "953" = 9:53
 * - "HHMM" (4桁) → 例: "1030" = 10:30
 * - "HMMSS" (5桁) → 例: "95300" = 9:53:00
 * - "HHMMSS" (6桁) → 例: "103000" = 10:30:00
 * - 空文字列/不正 → undefined
 */
function parseTime(s: string): number | undefined {
  if (!s || s.length < 3) return undefined;

  let h: number, m: number;
  if (s.length <= 4) {
    // HMM or HHMM
    const mm = s.slice(-2);
    const hh = s.slice(0, -2);
    h = parseInt(hh, 10);
    m = parseInt(mm, 10);
  } else {
    // HMMSS or HHMMSS — 秒は切り捨て
    const withoutSec = s.slice(0, -2);
    const mm = withoutSec.slice(-2);
    const hh = withoutSec.slice(0, -2);
    h = parseInt(hh, 10);
    m = parseInt(mm, 10);
  }

  if (isNaN(h) || isNaN(m)) return undefined;
  return h * 60 + m;
}

// ---- EkiJikoku parsing ----

/**
 * EkiJikoku の1駅分をパースする。
 *
 * 書式: "停車種別;着時刻/発時刻"
 * - 空文字列 → 運行なし
 * - "1;HHMM" → 停車、発のみ
 * - "1;HHMM/HHMM" → 停車、着/発
 * - "2" → 通過、時刻なし
 * - "2;HHMM" → 通過、時刻あり
 */
function parseStationTime(s: string): StationTime {
  if (s === "") {
    return { stopType: StopType.NotOperate };
  }

  const semiIdx = s.indexOf(";");
  if (semiIdx === -1) {
    // 数字のみ（"2" = 通過, "3" = 経由なし 等）
    const stopType = parseInt(s, 10) as StopType;
    return { stopType };
  }

  const stopType = parseInt(s.slice(0, semiIdx), 10) as StopType;
  const timePart = s.slice(semiIdx + 1);
  const slashIdx = timePart.indexOf("/");

  if (slashIdx === -1) {
    // 発のみ or 通過時刻
    return { stopType, departure: parseTime(timePart) };
  }

  const arrStr = timePart.slice(0, slashIdx);
  const depStr = timePart.slice(slashIdx + 1);
  return {
    stopType,
    arrival: arrStr ? parseTime(arrStr) : undefined,
    departure: depStr ? parseTime(depStr) : undefined,
  };
}

/** EkiJikoku 全体をパース（カンマ区切り） */
function parseEkiJikoku(s: string): StationTime[] {
  return s.split(",").map(parseStationTime);
}

/** RessyaTrack をパースして各駅の番線インデックスを返す */
function parseRessyaTrack(s: string): (number | undefined)[] {
  return s.split(",").map((part) => {
    if (part === "") return undefined;
    // "0;2/A" のような形式 — セミコロン前が到着番線？ スラッシュ前後で着/発番線
    // 簡略化: 最初の数字を取る
    const num = parseInt(part, 10);
    return isNaN(num) ? undefined : num;
  });
}

// ---- conversion to model ----

function convertTrack(node: RawNode): Track {
  return {
    name: prop(node, "TrackName") ?? "",
    shortName: prop(node, "TrackRyakusyou") ?? "",
    shortNameNobori: prop(node, "TrackNoboriRyakusyou"),
  };
}

function convertStation(node: RawNode): Station {
  const trackCont = firstChild(node, "EkiTrack2Cont");
  const tracks = trackCont
    ? childrenOf(trackCont, "EkiTrack2").map(convertTrack)
    : [];

  return {
    name: prop(node, "Ekimei") ?? "",
    nameShort: prop(node, "EkimeiJikokuRyaku"),
    timetableStyle:
      (prop(node, "Ekijikokukeisiki") as EkiJikokuKeisiki) ??
      "Jikokukeisiki_Hatsu",
    scale: (prop(node, "Ekikibo") as EkiKibo) ?? "Ekikibo_Ippan",
    tracks,
    downMain: propInt(node, "DownMain") ?? 0,
    upMain: propInt(node, "UpMain") ?? 0,
    nextStationDistance: propInt(node, "NextEkiDistance"),
    isBranchStation: prop(node, "BrunchCoreEkiIndex") !== undefined,
    branchCoreStationIndex: propInt(node, "BrunchCoreEkiIndex"),
  };
}

function convertTrainType(node: RawNode): TrainType {
  return {
    name: prop(node, "Syubetsumei") ?? "",
    shortName: prop(node, "Ryakusyou"),
    textColor: prop(node, "JikokuhyouMojiColor"),
    diagramLineColor: prop(node, "DiagramSenColor"),
    diagramLineStyle: prop(node, "DiagramSenStyle"),
    isBold: prop(node, "DiagramSenIsBold") === "1",
  };
}

function convertTrain(node: RawNode, stationCount: number): Train {
  const direction = (prop(node, "Houkou") as "Kudari" | "Nobori") ?? "Kudari";
  const ekiJikoku = prop(node, "EkiJikoku") ?? "";
  let stationTimes = parseEkiJikoku(ekiJikoku);

  // RessyaTrack があれば番線情報をマージ
  const ressyaTrack = prop(node, "RessyaTrack");
  if (ressyaTrack) {
    const trackIndices = parseRessyaTrack(ressyaTrack);
    for (let i = 0; i < Math.min(stationTimes.length, trackIndices.length); i++) {
      if (trackIndices[i] !== undefined) {
        stationTimes[i].trackIndex = trackIndices[i];
      }
    }
  }

  // 上り列車の EkiJikoku は駅順が逆なので反転し、
  // stationTimes[i] が stations[i] に対応するようにする
  if (direction === "Nobori") {
    // 駅数に合わせてパディング
    while (stationTimes.length < stationCount) {
      stationTimes.push({ stopType: StopType.NotOperate });
    }
    stationTimes = stationTimes.slice(0, stationCount).reverse();
  }

  return {
    direction,
    typeIndex: propInt(node, "Syubetsu") ?? 0,
    number: prop(node, "Ressyabangou"),
    name: prop(node, "Ressyamei"),
    stationTimes,
    comment: prop(node, "Bikou"),
    operationNumber: prop(node, "OperationNumber"),
  };
}

function convertDiagram(node: RawNode, stationCount: number): Diagram {
  const kudari = firstChild(node, "Kudari");
  const nobori = firstChild(node, "Nobori");

  return {
    name: prop(node, "DiaName") ?? "",
    downTrains: kudari
      ? childrenOf(kudari, "Ressya").map((n) => convertTrain(n, stationCount))
      : [],
    upTrains: nobori
      ? childrenOf(nobori, "Ressya").map((n) => convertTrain(n, stationCount))
      : [],
  };
}

function convertRoute(node: RawNode): Route {
  const stations = childrenOf(node, "Eki").map(convertStation);
  const stationCount = stations.length;
  return {
    name: prop(node, "Rosenmei") ?? "",
    stations,
    trainTypes: childrenOf(node, "Ressyasyubetsu").map(convertTrainType),
    diagrams: childrenOf(node, "Dia").map((n) => convertDiagram(n, stationCount)),
    comment: prop(node, "Comment"),
    startTime: prop(node, "KitenJikoku")
      ? parseTime(prop(node, "KitenJikoku")!)
      : undefined,
  };
}

// ---- public API ----

export interface ParseResult {
  fileType: string;
  appComment?: string;
  route: Route;
}

/**
 * OuDia / OuDiaSecond テキストをパースして内部モデルに変換する。
 */
export function parseOudiaText(text: string): ParseResult {
  const tree = parseRawTree(text);
  const fileType = prop(tree, "FileType") ?? "";
  const appComment = prop(tree, "FileTypeAppComment");

  const rosenNode = firstChild(tree, "Rosen");
  if (!rosenNode) {
    throw new Error("Rosen section not found in OuDia file");
  }

  return {
    fileType,
    appComment,
    route: convertRoute(rosenNode),
  };
}

/**
 * ファイルを読み込んでパースする。
 * .oud は Shift_JIS、.oud2 は UTF-8 として読み込む。
 */
export async function parseOudiaFile(file: File): Promise<ParseResult> {
  const isOud2 = file.name.toLowerCase().endsWith(".oud2");

  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    if (isOud2) {
      reader.readAsText(file, "UTF-8");
    } else {
      reader.readAsText(file, "Shift_JIS");
    }
  });

  return parseOudiaText(text);
}
