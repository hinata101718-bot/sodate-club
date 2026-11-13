# 効果音（`src/pc/sound.ts`・`src/pc/sfx/`）

## 決めたこと（2026-11-13 のヒアリング）
| 項目 | 決めたこと |
|---|---|
| 鳴らす場所 | 試合の中・ゴールや結果の演出・画面の操作。BGMはなし |
| 音の種類 | 本物っぽい録音の音。無料で使えるライセンス（CC0）のものだけ |
| はじめの設定 | 音あり・音量は控えめ（50%）。「セーブ・設定」で音量とオフを変えられる |
| 試合が2倍より速いとき | 大事な音だけ（笛・シュート・セーブ・外れ・ゴール）。ボールをける音は鳴らさない |

## どこで何が鳴るか
- **試合**（試合のエンジンが出来事を `sim.sfx` に記録し、画面が見せている時刻に鳴らす）
  - キックオフ・ファウル・オフサイド：短い笛。退場：長い笛。前半終了：長い笛。試合終了：短い笛2回と長い笛1回
  - パス・クリア：ボールをける音（3種類を少し高さを変えて）。シュート：強いける音
  - セーブ：拍手と「おおっ」。外れ・ポスト・ブロック：ため息
  - ゴール：自分のクラブなら歓声、相手ならため息
  - スタンドのざわめき：ずっと流れる。ボールがゴールに近いほど大きく、一時停止すると小さく
  - 「見どころだけ」で先へ飛ばしているあいだは鳴らさない。見どころの場面は鳴らす。「結果へ」で飛ばしても、試合終了の笛は鳴らす
- **結果**：勝利・引き分け・敗戦の短い曲（勝利は拍手も）。天皇杯の決勝で勝つと大きなファンファーレと大きな拍手。シーズンの終わりに昇格・1部優勝でファンファーレ、降格でさみしい曲。覚醒の曲。実績解除の曲
- **画面**：ボタン・メニュー・週を進める・閉じる・切りかえ、トースト（よい知らせ・注意・メッセージ）。トーストがたくさん出るときは1つだけ

## 作り方
- `src/pc/sfx/*.mp3` はモノラルで、切り出し・音量の最大をそろえ（−1dB）・はじめと終わりのフェードをしてある（ffmpeg）
- ブラウザの決まりで、最初にどこかを押すまでは音を出せない。最初に押したときに準備して、よく使う音を先に読む
- ざわめきは30秒の音を、2.5秒ずつ重ねてくり返す（つなぎ目が聞こえない）

## 出典（すべて CC0 1.0。自由に使え、表示もいらないが、感謝をこめて書いておく）
### Freesound（https://freesound.org）
| ファイル | 元の音 | 作者 |
|---|---|---|
| whistle_short・whistle_end | Referee whistle sound.wav（#538422） | Rosa-Orenes256 |
| whistle_long・whistle_end | Referee whistle blow, gymnasium.wav（#218318） | SpliceSound |
| kick1 | Soccer Ball Kick（#555042） | bittermelonheart |
| kick2 | Soccer Kick.wav（#261267） | musita182 |
| kick3 | Ball Kick（#446639） | Nicolas4677 |
| crowd_loop | Milan Derby (Milan vs Inter) at San Siro Stadium（#424354） | neilraouf |
| goal_cheer | Crowd Cheer（#397434） | FoolBoyMedia |
| save_clap・win_crowd | cheering and clapping crowd 2（#221567） | AlaskaRobotics |
| big_applause | Large crowd applause.wav（#160493） | Bansemer |
| opp_goal | Crowd Sigh In Disappointment（#763880） | ShangusBurger |
| near_miss | Crowd Sigh In Disappointment（#764324） | ShangusBurger |

### Kenney（https://kenney.nl）
- 画面の音（ui_*）：Interface Sounds（click_002・select_001・confirmation_001・confirmation_002・maximize_006・back_002・toggle_002・error_004・glass_002）
- 短い曲（j_*）：Music Jingles のサックス（jingles_sax_10＝勝利・sax_2＝昇格や優勝・sax_7＝敗戦・sax_13＝引き分け・sax_8＝実績・sax_4＝覚醒）
