# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

OuDia (.oud/.oud2) の時刻表データを読み込み、CTC風の在線図としてリアルタイム再生するアプリケーション。
Windows 11 環境で動作。

## 開発方針

- くらちゃん（Claude）が自律的に開発を進める。迷った時だけユーザーに確認
- コミットは意味のあるまとまり単位で自分の判断で切る
- セッション終了時に push

## 技術スタック

- **言語**: TypeScript (strict mode)
- **描画**: HTML Canvas (2Dアニメーション)
- **ビルド**: Vite
- **パッケージ管理**: npm
- **デスクトップ化**: Tauri (将来的に。初期はブラウザで動作)

## コマンド

```bash
npm run dev      # 開発サーバー起動
npm run build    # tsc + vite build
npm run preview  # ビルド結果プレビュー
npx tsc --noEmit # 型チェックのみ
```

## アーキテクチャ

```
OuDia Parser → 内部データモデル → シミュレーションエンジン → CTC風レンダラー
```

- **OuDia Parser** (`src/parser/`): .oud (Shift_JIS) / .oud2 (UTF-8) → 内部モデル変換
- **内部データモデル** (`src/model/`): OuDia フォーマット非依存。将来の編集・保存に備えて疎結合
- **シミュレーションエンジン**: 現在時刻 → 各列車の駅間位置を補間計算
- **CTC風レンダラー**: Canvas で路線模式図 + 列車標識を描画
- **操作パネル**: 再生/停止/倍速/時刻スライダー

### CTC 表示仕様

- 駅を横一列に配置（模式図）
- 各駅は番線数に応じた配線を描画（EkiTrack2 データ使用）
- 本線/副本線を DownMain/UpMain から判定
- 列車は種別色付き標識として駅間を移動
- 退避: 停車列車と通過列車が同時にいる場合、副本線に寄せて表示

## OuDia ファイルフォーマット

詳細は `docs/research/oudia-format.md` を参照。要点のみ:

- テキストファイル、`key=value` 形式、`.` で階層管理
- .oud = Shift_JIS、.oud2 (v1.03+) = UTF-8
- 主要セクション: Rosen > Eki / Ressyasyubetsu / Dia > Kudari/Nobori > Ressya
- EkiJikoku: `停車種別;着時刻/発時刻` をカンマ区切り（`1`=停車, `2`=通過）
- RessyaTrack: 各駅の使用番線インデックス
- OuDia にない情報: 単線/複線、連結/解結 → 独自補足データで対応

## 開発フェーズ

### Phase 1: ビューア (MVP) ← 現在
- [x] .oud / .oud2 ファイル読み込み・パース
- [x] CTC風模式図の描画（単路線、複線/単線対応）
- [x] 時間再生（play / pause / 速度調整）
- [x] 列車の駅間位置リアルタイム補間
- [x] 番線・入線アニメーション
- [x] 拡張情報ファイル (.ext.json) 対応
- [ ] 表示精度向上（棒線駅、退避表現）
- [ ] ズーム/スクロール

### Phase 2: 簡易編集
- 列車時刻変更、.oud2 保存

### Phase 3: フルエディタ
- 列車追加/削除、種別変更、駅編集

## サンプルデータ

`samples/` にテスト用 OuDia ファイル:
- `KeiseiLine_Diagram2018-01-01.oud2` — 京成線（23駅, 下り77本/上り76本）
- `sample.oud` — JPTI-OuDia 付属サンプル（Shift_JIS, 番線情報なし）

## ドキュメント管理

### docs/ の構成
- `docs/research/` — 調査事実の記録（フォーマット仕様、既存ツール調査等）
- `docs/specs/` — 設計・仕様（モジュール設計、データ構造定義等）
- `docs/handoff.md` — セッション引き継ぎ（毎セッション終了時に上書き更新）

### ルール
- 調査で得た情報は `docs/research/` に保存する（会話の中だけで完結させない）
- 実装中に得た知識（API の癖、データ仕様等）は該当ドキュメントに追記する
- 仕様を変更したら対応するドキュメントも更新する
- CLAUDE.md は簡潔さを維持する。詳細は docs/ に置く

### compact 時の方針
- CLAUDE.md + docs/handoff.md で次のセッションに必要な文脈を復元できるようにする
- handoff.md には「今どこまで進んだか」「次に何をするか」「未解決の問題」を書く
- CLAUDE.md のフェーズチェックリストを最新に保つ

## 参考リソース

- CloudDia (TypeScript, OuDia パーサー実装): https://github.com/01397/clouddia
- 既存ツール調査: `docs/research/existing-tools.md`
- OuDia フォーマット詳細: `docs/research/oudia-format.md`
