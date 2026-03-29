# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

OuDia (.oud/.oud2) の時刻表データを読み込み、CTC風の在線図としてリアルタイム再生するアプリケーション。
Windows 11 環境で動作。

## 技術スタック

- **言語**: TypeScript
- **描画**: HTML Canvas (2Dアニメーション)
- **デスクトップ化**: Tauri (将来的に。初期はブラウザで動作)
- **パッケージ管理**: npm or pnpm
- **ビルド**: Vite (予定)

## アーキテクチャ

```
OuDia Parser → 内部データモデル → シミュレーションエンジン → CTC風レンダラー
```

### レイヤー構成

- **OuDia Parser**: .oud (Shift_JIS) / .oud2 (UTF-8) を読み込み、内部モデルに変換
- **内部データモデル**: OuDia フォーマット非依存。将来の編集・保存に備えて疎結合にする
- **シミュレーションエンジン**: 現在時刻から各列車の駅間位置を補間計算
- **CTC風レンダラー**: Canvas で路線模式図 + 列車標識を描画
- **操作パネル**: 再生/停止/倍速/時刻スライダー

### CTC 表示仕様

- 駅を横一列に配置（模式図）
- 各駅は番線数に応じた配線を描画（EkiTrack2 データ使用）
- 本線/副本線を DownMain/UpMain から判定
- 列車は種別色付き標識として駅間を移動
- 退避: 停車列車と通過列車が同時にいる場合、副本線に寄せて表示

## OuDia ファイルフォーマット

### バリエーション

| バージョン | 拡張子 | 文字コード |
|---|---|---|
| OuDia (オリジナル) | .oud | Shift_JIS |
| OuDiaSecond v1.02以前 | .oud2 | Shift_JIS |
| OuDiaSecond v1.03以降 / V2 | .oud2 | UTF-8 |

### 構文

- テキストファイル、行ベース
- `key=value` 形式のプロパティ
- `セクション名.` で階層開始、`.` 単独で階層終了
- セミコロン `;` で複合値を連結
- 同一キーが複数回出現可能（配列として扱う）

### 主要データ構造

**Rosen (路線)**
- Rosenmei, Comment, EnableOperation, KitenJikoku

**Eki (駅)**
- Ekimei, Ekikibo, Ekijikokukeisiki
- EkiTrack2 (番線定義: TrackName, TrackRyakusyou)
- DownMain / UpMain (上下本線インデックス)
- NextEkiDistance (次駅までの距離)

**Ressyasyubetsu (列車種別)**
- Syubetsumei, Ryakusyou, DiagramSenColor, DiagramSenStyle

**Dia (ダイヤ) → Kudari/Nobori → Ressya (列車)**
- Ressyabangou (列車番号), Ressyamei (列車名)
- Syubetsu (種別インデックス)
- EkiJikoku (駅ごとの着発時刻)
- RessyaTrack (駅ごとの使用番線)
- Bikou (備考), OperationNumber (運用番号)

### EkiJikoku フォーマット

駅ごとの値をカンマ `,` で区切る。1駅分の書式:

```
停車種別;着時刻/発時刻
```

| 記法 | 意味 |
|---|---|
| (空) | 経由しない（運行なし） |
| `1;HHMM` | 停車、発時刻のみ |
| `1;HHMM/HHMM` | 停車、着時刻/発時刻 |
| `2` | 通過、時刻なし |
| `2;HHMM` | 通過、時刻あり |

- 停車種別: `1`=停車, `2`=通過
- 時刻: `HHMM` 形式（例: `1030` = 10:30）

### RessyaTrack フォーマット

EkiJikoku と同じ駅順で、各駅の使用番線インデックスをカンマ区切りで指定。

```
RessyaTrack=,,,,,,,0;2/A,0,0,1,0
```

- `0` = デフォルト（本線）
- `1`, `2`, ... = EkiTrack2 のインデックスで副本線等を指定

### OuDia に含まれない情報

- **単線/複線**: 駅間の線路本数は未定義 → 独自補足データで対応
- **連結/解結**: 直接のフィールドなし → Bikou からの推定 or 独自定義

## 開発フェーズ

### Phase 1: ビューア (MVP)
- .oud / .oud2 ファイル読み込み・パース
- CTC風模式図の描画（単路線）
- 時間再生（play / pause / 速度調整）
- 列車の駅間位置リアルタイム補間
- 番線・退避の表示

### Phase 2: 簡易編集
- 列車時刻変更
- .oud2 保存

### Phase 3: フルエディタ
- 列車追加/削除、種別変更、駅編集

## サンプルデータ

`samples/` にテスト用の OuDia ファイルを配置:
- `KeiseiLine_Diagram2018-01-01.oud2` — 京成線（OuDiaSecond 1.03, UTF-8）番線・RessyaTrack 情報あり
- `sample.oud` — JPTI-OuDia 付属サンプル（OuDia 1.02, Shift_JIS）番線情報なし

## 参考リソース

- CloudDia (TypeScript, OuDia パーサー実装): https://github.com/01397/clouddia
- OuDia形式パース解説: https://qiita.com/access3151fq/items/51ccb22d4165ea92c126
- MBTA Marey diagram (在線図の参考): https://github.com/mbtaviz/mbtaviz.github.io
