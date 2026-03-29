import { parseOudiaFile } from "./parser/oud-parser";
import type { Route } from "./model/types";

const fileInput = document.getElementById("file-input") as HTMLInputElement;
const output = document.getElementById("output") as HTMLPreElement;

function formatTime(minutes: number | undefined): string {
  if (minutes === undefined) return "--:--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

const STOP_TYPE_LABELS: Record<number, string> = {
  0: "運行なし",
  1: "停車",
  2: "通過",
  3: "経由なし",
};

function summarizeRoute(route: Route): string {
  const lines: string[] = [];

  lines.push(`=== 路線: ${route.name || "(名称なし)"} ===`);
  lines.push(`起点時刻: ${formatTime(route.startTime)}`);
  lines.push("");

  // 駅一覧
  lines.push(`--- 駅 (${route.stations.length}駅) ---`);
  for (const st of route.stations) {
    const tracks = st.tracks.length > 0
      ? ` [${st.tracks.length}番線: ${st.tracks.map((t) => t.shortName || t.name).join(",")}] 下本=${st.downMain} 上本=${st.upMain}`
      : "";
    const dist = st.nextStationDistance !== undefined
      ? ` dist=${st.nextStationDistance}`
      : "";
    lines.push(`  ${st.name} (${st.scale})${tracks}${dist}`);
  }
  lines.push("");

  // 列車種別
  lines.push(`--- 列車種別 (${route.trainTypes.length}種) ---`);
  for (const tt of route.trainTypes) {
    lines.push(`  ${tt.name} (色: ${tt.diagramLineColor ?? "default"})`);
  }
  lines.push("");

  // ダイヤ
  for (const dia of route.diagrams) {
    lines.push(`--- ダイヤ: ${dia.name} ---`);
    lines.push(`  下り: ${dia.downTrains.length}本`);
    lines.push(`  上り: ${dia.upTrains.length}本`);

    // 最初の数本を詳細表示
    const showTrains = (trains: typeof dia.downTrains, dir: string) => {
      const sample = trains.slice(0, 3);
      for (const tr of sample) {
        const typeName = route.trainTypes[tr.typeIndex]?.name ?? `種別${tr.typeIndex}`;
        lines.push(`  [${dir}] ${tr.number ?? "?"} ${typeName} ${tr.name ?? ""}`);
        if (tr.operationNumber) lines.push(`    運用: ${tr.operationNumber}`);
        if (tr.comment) lines.push(`    備考: ${tr.comment}`);

        // 停車駅の時刻
        for (let i = 0; i < tr.stationTimes.length; i++) {
          const st = tr.stationTimes[i];
          if (st.stopType === 0) continue; // 運行なし
          const stName = route.stations[i]?.name ?? `駅${i}`;
          const stopLabel = STOP_TYPE_LABELS[st.stopType as number] ?? "?";
          const arr = formatTime(st.arrival);
          const dep = formatTime(st.departure);
          const track = st.trackIndex !== undefined ? ` 番線=${st.trackIndex}` : "";
          lines.push(`      ${stName}: ${stopLabel} 着${arr} 発${dep}${track}`);
        }
      }
      if (trains.length > 3) {
        lines.push(`    ... 他 ${trains.length - 3}本`);
      }
    };

    showTrains(dia.downTrains, "下り");
    showTrains(dia.upTrains, "上り");
    lines.push("");
  }

  return lines.join("\n");
}

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  output.textContent = `読み込み中: ${file.name} ...`;

  try {
    const result = parseOudiaFile(file);
    const parsed = await result;
    output.textContent = [
      `FileType: ${parsed.fileType}`,
      parsed.appComment ? `AppComment: ${parsed.appComment}` : "",
      "",
      summarizeRoute(parsed.route),
    ]
      .filter(Boolean)
      .join("\n");
  } catch (e) {
    output.textContent = `エラー: ${e instanceof Error ? e.message : String(e)}`;
  }
});

output.textContent = "OuDia ファイル (.oud / .oud2) を選択してください";
