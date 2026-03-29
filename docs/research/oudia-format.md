# OuDia ファイルフォーマット調査

調査日: 2026-03-30

## 概要

OuDia は鉄道・バスの時刻表を記述するテキストベースのファイルフォーマット。
OuDia → OuDiaSecond → OuDiaSecondV2 と発展。

## バリエーション

| バージョン | 拡張子 | 文字コード | FileType ヘッダ例 |
|---|---|---|---|
| OuDia (オリジナル) | .oud | Shift_JIS | `OuDia.1.02` |
| OuDiaSecond v1.02以前 | .oud2 | Shift_JIS | `OuDiaSecond.1.02` |
| OuDiaSecond v1.03以降 / V2 | .oud2 | UTF-8 | `OuDiaSecond.1.03` |

## 構文

- テキストファイル、行ベース
- `key=value` 形式のプロパティ
- `セクション名.` で階層開始、`.` 単独で階層終了
- セミコロン `;` で複合値を連結（フォント定義等）
- 同一キーが複数回出現可能（配列として扱う）

## 階層構造

```
Root
├── FileType=...
├── FileTypeAppComment=...
└── Rosen.
    ├── Rosenmei=
    ├── KitenJikoku=
    ├── Comment=
    ├── EnableOperation=
    ├── Eki.  (複数)
    │   ├── Ekimei=
    │   ├── Ekijikokukeisiki=
    │   ├── Ekikibo=
    │   ├── DownMain=
    │   ├── UpMain=
    │   ├── NextEkiDistance=
    │   ├── BrunchCoreEkiIndex=
    │   └── EkiTrack2Cont.
    │       └── EkiTrack2.  (複数)
    │           ├── TrackName=
    │           └── TrackRyakusyou=
    ├── Ressyasyubetsu.  (複数)
    │   ├── Syubetsumei=
    │   ├── Ryakusyou=
    │   ├── DiagramSenColor=
    │   ├── DiagramSenStyle=
    │   └── DiagramSenIsBold=
    ├── Dia.  (複数)
    │   ├── DiaName=
    │   ├── Kudari.
    │   │   └── Ressya.  (複数)
    │   │       ├── Houkou=
    │   │       ├── Syubetsu=
    │   │       ├── Ressyabangou=
    │   │       ├── Ressyamei=
    │   │       ├── EkiJikoku=
    │   │       ├── RessyaTrack=
    │   │       ├── Bikou=
    │   │       └── OperationNumber=
    │   └── Nobori.
    │       └── Ressya.  (同上)
    └── DispProp.
        └── (表示設定プロパティ群)
```

## EkiJikoku フォーマット

駅ごとの値をカンマ `,` 区切り。1駅分:

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
| `3` | 経由なし |

- 停車種別: `0`=運行なし, `1`=停車, `2`=通過, `3`=経由なし
- 時刻: `HHMM` 形式（例: `1030` = 10:30）。秒精度の場合は `HHMMSS`

## RessyaTrack フォーマット

EkiJikoku と同じ駅順。各駅の使用番線インデックスをカンマ区切り。

```
RessyaTrack=,,,,,,,0;2/A,0,0,1,0
```

- `0` = デフォルト（本線）
- 数値 = EkiTrack2 のインデックス
- セミコロン/スラッシュ付きの複合形式あり（着発で異なる番線？詳細未確定）

## Ekijikokukeisiki（駅時刻形式）

| 値 | 意味 |
|---|---|
| `Jikokukeisiki_Hatsu` | 発時刻のみ表示 |
| `Jikokukeisiki_Hatsuchaku` | 着発時刻を表示 |
| `Jikokukeisiki_KudariChaku` | 下り着時刻を表示 |
| `Jikokukeisiki_NoboriChaku` | 上り着時刻を表示 |

## Ekikibo（駅規模）

| 値 | 意味 |
|---|---|
| `Ekikibo_Syuyou` | 主要駅 |
| `Ekikibo_Ippan` | 一般駅 |
| `Ekikibo_Seishijo` | 信号場 |

## OuDia に含まれない情報

- **単線/複線**: 駅間の線路本数は未定義
- **連結/解結**: 直接のフィールドなし（Bikou に記載されるケースあり）
- **配線図**: 駅の線路配置の詳細はない（番線数と本線指定のみ）

## 参考ソース

- [OuDia形式ファイルのパース - Qiita](https://qiita.com/access3151fq/items/51ccb22d4165ea92c126)
- [OuDiaSecond ファイル形式について](http://oudiasecond.seesaa.net/article/448953948.html)
- [CloudDia DiagramParser.ts](https://github.com/01397/clouddia) — プロパティ一覧の実データ確認に使用
- [JPTI-OuDia sample.oud](https://github.com/KameLong/JPTI-OuDia/blob/master/sample.oud)
- [四直運用資料室 ダイヤグラム](https://nkth.info/diagram/) — .oud2 サンプル入手元

## 検証結果

京成線サンプル (`KeiseiLine_Diagram2018-01-01.oud2`) をパースして確認:
- 23駅、5種別（普通/普通(延長)/特急/シティライナー/回送）
- 下り77本 / 上り76本
- EkiTrack2, DownMain/UpMain, RessyaTrack, OperationNumber すべて正常にパース
