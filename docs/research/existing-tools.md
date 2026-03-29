# 既存ツール・類似アプリ調査

調査日: 2026-03-30

## 結論

「OuDia データを在線図として再生する」アプリは確認できなかった。
ダイヤ図エディタ/ビューアは複数存在する。

## OuDia 関連プロジェクト

| プロジェクト | 技術 | 内容 | URL |
|---|---|---|---|
| CloudDia | TypeScript | Web版ダイヤグラムエディタ。OuDia/oud2パーサー付き | https://github.com/01397/clouddia |
| JPTI-OuDia | Kotlin/Java | JPTI(SQLite) ↔ OuDia 相互変換 | https://github.com/KameLong/JPTI-OuDia |
| AOdia | Android (Kotlin) | Android版OuDiaビューア | https://github.com/KameLong/AOdia |
| OuDiaParser | Java | OuDia/OuDiaSecond → Java オブジェクトパーサー | https://github.com/KameLong/OuDiaParser |
| oudia-online | PHP/CakePHP | Web版。時刻表表示のみ（ダイヤ図未実装） | https://github.com/thgm3116/oudia-online |
| UnicodeOuDia | 不明 | OuDia の Unicode 対応版 | https://github.com/SecretU4/UnicodeOuDia |
| diaparse | 不明 | OuDia/GTFS パーサー（初期段階） | https://github.com/kaito3desuyo/diaparse |

## 在線図・列車可視化の参考

| プロジェクト | 技術 | 内容 | URL |
|---|---|---|---|
| MBTA Visualization | JavaScript | ボストン地下鉄の Marey 図＋地図連動。コンセプトが近い | https://github.com/mbtaviz/mbtaviz.github.io |
| train-diagram.com | Web | 時刻表データ → SVG ダイヤグラム生成 | https://www.train-diagram.com/ |
| DynamicTrainOperationDiagramGenerator | Python | 列車動態運行略図生成 | https://github.com/QianCheng-China/DynamicTrainOperationDiagramGenerator |
| react-diagram-maker | TypeScript | React + Chart.js でダイヤ図 | https://github.com/tenpaMk2/react-diagram-maker |

## その他のダイヤ関連ソフト

- **OuDiaSecond**: 本家。Windows デスクトップアプリ。ダイヤ作成・編集・番線設定・運用管理
- **スジ太郎**: ダイヤグラム編集ソフト
- **HyperDia クラウド型ダイヤ作成システム**: 日立システムズ提供
