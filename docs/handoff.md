# セッション引き継ぎ

最終更新: 2026-03-30

## 現在の状況

Phase 1 (ビューア MVP) の実装中。

### 完了したこと
- OuDia フォーマット調査 → `docs/research/oudia-format.md`
- 既存ツール調査 → `docs/research/existing-tools.md`
- 技術スタック選定: TypeScript + Vite + Canvas
- プロジェクト初期化 (Vite + TypeScript)
- 内部データモデル定義 (`src/model/types.ts`)
- OuDia パーサー実装 (`src/parser/oud-parser.ts`)
  - .oud (Shift_JIS) / .oud2 (UTF-8) 両対応
  - EkiJikoku, RessyaTrack パース対応
  - 京成線サンプルで動作確認済み（23駅, 下り77本/上り76本）

### 次にやること
- CTC風レンダラーの実装（Canvas で路線模式図 + 列車標識）
- シミュレーションエンジン（時刻→列車位置の補間計算）
- 操作パネル（再生/停止/倍速/時刻スライダー）

## 未解決の問題
- RessyaTrack の複合形式（`0;2/A` 等）の正確な意味が未確定
- 単線/複線情報の独自定義フォーマットは未設計
- 連結/解結の表現方法は未設計
