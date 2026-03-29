# セッション引き継ぎ

最終更新: 2026-03-30

## 現在の状況

Phase 1 (ビューア MVP) の実装中。基本機能は動作、配線表示も実装済み。

### 完了したこと
- OuDia フォーマット調査・ドキュメント化
- 技術スタック: TypeScript + Vite + Canvas
- GitHub 連携 (qzmochi/Oudia-player)
- OuDia パーサー (.oud/.oud2, EkiJikoku, RessyaTrack, $番線形式)
- 上り EkiJikoku 逆順対応、3桁時刻パース修正
- シミュレーションエンジン（方向別走査、デフォルト停車時間）
- CTC風レンダラー
  - 複線表示（左側通行: Kudari=上線路, Nobori=下線路）
  - 駅構内配線描画（番線ごとの分岐・合流、ホーム表現）
  - 入線アニメーション（smoothstep で番線に遷移）
  - 停車中列車の白枠強調
  - 単線/複線の描き分け（拡張ファイル .ext.json 対応）
- 操作パネル（再生/停止/倍速/スライダー/キーボード）
- 列車表示モード切替（番号/種別）
- 列車情報パネル（クリック表示、時刻順ソート）
- ドラッグ&ドロップ（複数ファイル対応）
- 仙山線サンプルの配線データ修正（haisenryakuzu.net 基づく）

### 次にやること（優先度順）
1. 表示精度向上（棒線駅で分岐しない、単線すれ違い表現）
2. 退避・交換の可視化改善
3. 方向ラベル反転設定（ext.json → UI反映）
4. 分岐駅対応（京成線の駒井野等）
5. 折り返しポイント表現
6. ズーム/スクロール対応

## 未解決の問題
- 複々線対応は設計が必要（走行経路判定、種別→線路マッピング）
- RessyaTrack の複合形式（`0;2/A` 等）の正確な意味が未確定
- 連結/解結の表現方法は未設計
- OuDia の Kudari/Nobori と実際の上り/下りが逆になるケースあり（ファイル依存）

## ファイル構成
```
src/
├── main.ts                    # エントリ、UI、ファイル読み込み
├── model/
│   ├── types.ts               # 内部データモデル
│   └── extension.ts           # 拡張情報（単線/複線等）
├── parser/
│   └── oud-parser.ts          # OuDia パーサー
├── renderer/
│   └── ctc-renderer.ts        # CTC風 Canvas レンダラー
└── simulation/
    └── engine.ts              # 時刻→列車位置補間
samples/
├── KeiseiLine_Diagram2018-01-01.oud2
├── sample.oud
├── 仙山線_R050318.oud2        # 配線修正済み
└── 仙山線_R050318.ext.json    # 全線単線の拡張情報
docs/
├── handoff.md                 # このファイル
├── research/
│   ├── oudia-format.md
│   └── existing-tools.md
└── specs/
    └── known-issues.md
```
