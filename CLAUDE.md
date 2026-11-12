# CLAUDE.md

育ての街クラブ（sodate-club）：自分で選んだ県にサッカークラブを作り、無名の若手が育っていくのを見守るゲーム。
Vite + TypeScript。ライブラリは使わず、画面は `src/ui/`、ゲームの中身は `src/core/` に分けている。

## 話し方

- 返事は日本語で書く。
- 質問するときは、選択肢に「おすすめ」とその理由を必ず添える。
  例：「A と B があります。おすすめは A です。理由：セーブの形を変えずにすむため」
- 技術的な説明は「なぜそうなったか」を1〜2文で短く書く。細かい手順や長いコードの説明はしない。
- 専門用語はできるだけ使わず、使うときはひとこと言いかえる（docs/ の書き方に合わせる）。

## 遊ぶ環境：iPhone のブラウザ・縦持ち

- iPhone の Safari（ホーム画面に追加したアプリとしても）で遊ぶ。パソコン向けの見た目は考えなくてよい。
- **縦持ちの画面幅（375px、狭い機種では 320px）で崩れないこと。** 横にはみ出す・文字が重なる・ボタンが押しにくい、はすべて不具合として扱う。
  - 画面の中身は `max-width:480px` で真ん中に置いている（`src/ui/style.css` の `.app`）。この形を守る。
  - 長い名前は `text-overflow:ellipsis` などで切る。横スクロールを出さない。
  - 上下のすき間は `env(safe-area-inset-*)` を使う（ノッチと下のバーに隠れないように）。
  - ボタンは指で押せる大きさ（高さ44px前後）にする。マウスのホバーだけに頼る動きは作らない。
- 画面を変えたら、幅375pxで見て確かめる：
  1. `npm run build && npx vite preview`
  2. 別の画面で `node scripts/smoke.cjs`（`W=320` で狭い幅も試せる。横のはみ出しとエラーを調べる）
  3. 撮影が必要なら `node scripts/shots.cjs`（`docs/reports/shots/` に保存）

## 公開：GitHub Pages

調べた結果（`.github/workflows/deploy.yml`・`vite.config.ts`）：

| 項目 | 内容 |
|---|---|
| 公開に使うブランチ | `main`（main にプッシュすると自動で公開。手動でも Actions から動かせる） |
| 公開するフォルダ | `dist/`（`npm run build` で作られる。リポジトリには入れない＝`.gitignore` 済み） |
| 公開のしかた | GitHub Actions（テスト → 組み立て → 公開）。`gh-pages` ブランチは使っていない |
| Pages の設定 | 公開元を「GitHub Actions」にしておく（ブランチ指定ではない） |
| 公開先のURL | https://hinata101718-bot.github.io/sodate-club/ |
| Vite の `base` | `/sodate-club/`（リポジトリ名と同じ。変えると画像や読みこみが切れる） |

- `public/` の中身（画像・アイコン・`manifest.webmanifest`）は、そのまま `dist/` にコピーされて公開される。
- `prototype/` は公開されない（試作の記録として残しているだけ）。
- 組み立てるたびに `dist/version.json` ができ、遊んでいる画面が古い版だと気づけるようにしている（感想25）。
- docs/ だけを変えたコミットには `[skip ci]` をつけて、公開を動かさない。
- 公開ではテストも走るので、`npm test` が通らないと公開されない。

## 作業の決まり

- コマンド
  - `npm run dev`：手元で動かす
  - `npm test`：テスト（`tests/*.test.ts`、vitest）
  - `npm run build`：型の確認 + 組み立て
  - `npx vite-node scripts/xxx.ts`：数字のバランスなどの確かめ（例：`scripts/balance.ts`、`scripts/season50.ts`）
- コミットの前に `npm test` と `npm run build` を通す。どのコミットのあとも、最初から遊べる状態にする。
- セーブの形を変えたら、`src/core/migrate.ts` で古いセーブを読めるようにし、`tests/fixtures/save-v*.json` で確かめる。
  理由：iPhone に残っているセーブが読めなくなると、それまでの遊びが消えるため。
- 外から読みこむのは Google Fonts だけ。ほかに必要なものは npm で入れて組み立てに含める。

## 記録は docs/ に置く

仕様や決めたことは、会話の中だけで終わらせず、必ず `docs/` に書き残す。

| ファイル | 書くこと |
|---|---|
| `docs/new/kikaku.md` | 企画書（ゲームの仕様のもと） |
| `docs/new/hearing.md` | 質問と答えの記録（「問N」の番号つき。おすすめと、選ばれた答え） |
| `docs/feedback.md` | 遊んだ感想と直し方（「感想N」の番号つき。言葉・原因・直し方・状態） |
| `docs/night-plan.md`・`docs/night*.md` | 作る順番と、作業の指示書 |
| `docs/reports/` | 作業の報告と、数字の確かめの結果 |

- 新しく決めたことは、hearing.md に次の「問」の番号で足す。仕様が変わったら kikaku.md も直す。
- 感想を直したら feedback.md の「状態」を更新する。
- コードのコメントには、もとになった番号（例：`感想25`、`問133`）を書いておくと、あとで理由をたどれる。
- 新しい種類の記録が必要なら、docs/ の中に置き、この表に足す。
