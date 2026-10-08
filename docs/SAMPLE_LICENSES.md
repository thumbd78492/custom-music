# 音色與依賴授權紀錄 — M1

確認日期：2026-10-08。四件均使用真實樂器錄音，素材授權在音訊下載前確認並保存。
本輪沒有用合成音或完整演奏錄音冒充逐音 Samples。所有取樣皆為 **CC0-1.0**，
允許修改、使用及再散布，不強制 Attribution；以下仍保留製作者 credit。

逐檔原始／輸出 SHA-256、下載 URL、固定 commit、音訊格式、mapping、增益、
轉換／loop 方法與限制，見 [sample-provenance.json](sample-provenance.json)。
該檔是本紀錄的逐檔清單；授權全文另外放在每件自己的 samples/LICENSE-CC0.txt。

| Plugin | 錄音子集                                                          | 檔案 | 音檔 bytes | 授權    |
| ------ | ----------------------------------------------------------------- | ---: | ---------: | ------- |
| piano  | Versilian Community Sample Library — Grand Piano, Kawai           |   14 |  9,879,016 | CC0-1.0 |
| violin | VSCO 2 Community Edition — Solo Violin Arco Vibrato               |   10 |  2,911,040 | CC0-1.0 |
| drums  | Virtuosity Drums                                                  |    9 |    830,116 | CC0-1.0 |
| bass   | Karoryfer Black And Blue Basses — Darkblack regular finger plucks |    8 |  3,528,352 | CC0-1.0 |

共 41 個音檔，17,148,524 bytes（約 16.35 MiB）。音檔是獨立資產，只有加入該件才載入；不包入共用 JS chunk。

## 保存與重現

- 原始完整錄音：`.sample-sources/<id>/`，Git 忽略，不隨網頁散布。
- 精簡可再散布音檔：`src/instruments/<id>/samples/`。
- Python 3 標準函式庫轉換，無第三方 DSP 依賴；本輪 Python 3.13。
- `python scripts/import-samples.py <piano|violin|drums|bass>`：先取得並確認固定來源的 CC0 授權，再下載或使用保留的原始檔，重現精簡子集。
- `npm run verify:samples`：檢查每件授權雜湊、41 個輸出 SHA-256、檔案位置、格式頭與大小。
- `python scripts/audit-sample-pitches.py`：對保留的原始 WAV 與輸出各取短片段，檢查 32 件有音高素材的八度一致性；結果見 [sample-pitch-audit.json](sample-pitch-audit.json)。這不是精密調音或人耳音色驗收，原始檔未取得時須先執行 import 命令。
- 聲音與人工品質驗收分開，見 [M1_LISTENING](M1_LISTENING.md)。

## piano

- 官方來源：[音源頁](https://versilian-studios.com/vcsl-keys/)；[素材 Repository](https://github.com/sgossner/VCSL)。
- 固定來源 commit：`c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`。
- 授權：[來源 CC0 全文](https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/LICENSE)；本地 [LICENSE-CC0.txt](../src/instruments/piano/samples/LICENSE-CC0.txt)。
- Credit：Versilian Studios LLC.; original sample mapping by Peter Eastman。CC0 不強制署名。
- 重現命令：`python scripts/import-samples.py piano`。

原錄音 stereo16-bit44.1k；平均為 mono、各力度層使用共同增益，輸出 PCM16／44.1k。保留前 8 秒，截尾時使用 150 ms cosine fade。沒有重採樣、重合成或逐檔正規化。原始來源的 C3 對應 MIDI60；mapping 按官方 SFZ 及其 tune 音分，不按原名猜八度。自然衰減超過 8 秒的部分不包含在 Web 子集。

| 使用的原始檔案                                                                      | 散布檔名（本件 samples/） |
| ----------------------------------------------------------------------------------- | ------------------------- |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_C3_v1_rr1_Player.wav`  | `c4-soft.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_C3_v3_rr1_Player.wav`  | `c4-loud.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_D3_v1_rr1_Player.wav`  | `d4-soft.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_D3_v3_rr1_Player.wav`  | `d4-loud.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_E3_v1_rr1_Player.wav`  | `e4-soft.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_E3_v3_rr1_Player.wav`  | `e4-loud.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_F#3_v1_rr1_Player.wav` | `fs4-soft.wav`            |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_F#3_v3_rr1_Player.wav` | `fs4-loud.wav`            |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_G#3_v1_rr1_Player.wav` | `gs4-soft.wav`            |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_G#3_v3_rr1_Player.wav` | `gs4-loud.wav`            |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_A#3_v1_rr1_Player.wav` | `as4-soft.wav`            |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_A#3_v3_rr1_Player.wav` | `as4-loud.wav`            |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_C4_v1_rr1_Player.wav`  | `c5-soft.wav`             |
| `Chordophones/Zithers/Grand Piano, Kawai/Sustains/GPiano_sus_C4_v3_rr1_Player.wav`  | `c5-loud.wav`             |

## violin

- 官方來源：[音源頁](https://versilian-studios.com/vsco-community/)；[素材 Repository](https://github.com/sgossner/VSCO-2-CE)。
- 固定來源 commit：`440300901dfe9275fd84e0b7763af1f8443ae62e`。
- 授權：[來源 CC0 全文](https://raw.githubusercontent.com/sgossner/VSCO-2-CE/440300901dfe9275fd84e0b7763af1f8443ae62e/LICENSE)；本地 [LICENSE-CC0.txt](../src/instruments/violin/samples/LICENSE-CC0.txt)。
- Credit：Versilian Studios LLC.; solo violin performed by Lily Lyons。CC0 不強制署名。
- 重現命令：`python scripts/import-samples.py violin`。

Lily Lyons 演奏的真實 solo arco vibrato。Stereo 平均為 mono，兩層共同增益，輸出 PCM16／44.1k，各 3.3 秒。Loop 1.2–3.2 秒；尾端 150 ms 原錄音 crossfade 接到 loop 起點之前的連續片段。循環外檔尾另淡出 50 ms。原始運弓結尾未包含在 compact loop，Release 由 Plugin 包絡處理。機械連續性通過不代表 loop 與換音已獲人耳認可。

| 使用的原始檔案                                        | 散布檔名（本件 samples/） |
| ----------------------------------------------------- | ------------------------- |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_C5_p.wav` | `c5-soft.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_C5_f.wav` | `c5-loud.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_E5_p.wav` | `e5-soft.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_E5_f.wav` | `e5-loud.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_G5_p.wav` | `g5-soft.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_G5_f.wav` | `g5-loud.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_A5_p.wav` | `a5-soft.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_A5_f.wav` | `a5-loud.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_C6_p.wav` | `c6-soft.wav`             |
| `Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_C6_f.wav` | `c6-loud.wav`             |

## drums

- 官方來源：[音源頁](https://versilian-studios.com/virtuosity-drums/)；[素材 Repository](https://github.com/sfzinstruments/virtuosity_drums)。
- 固定來源 commit：`9f04cf9a734527edfbb0a4eee1f674e45bbf71bc`。
- 授權：[來源 CC0 全文](https://raw.githubusercontent.com/sfzinstruments/virtuosity_drums/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc/LICENSE)；本地 [LICENSE-CC0.txt](../src/instruments/drums/samples/LICENSE-CC0.txt)。
- Credit：Versilian Studios LLC. and Karoryfer Samples; performed by Austin McMahon at Virtuosity Musical Instruments, Boston。CC0 不強制署名。
- 重現命令：`python scripts/import-samples.py drums`。

真實鼓組 Kick 2 層、Snare 3 層、閉合 Hi-hat 2 層各 2 次錄音。保留原始 FLAC 位元與尾音，未轉檔。Kick／Snare 為近場 mono，Hi-hat 為 stereo overhead，48 kHz。Drums voice 擁有 logical key、力度選擇與交替取樣；不修改 MusicEvent。

| 使用的原始檔案                                           | 散布檔名（本件 samples/） |
| -------------------------------------------------------- | ------------------------- |
| `Samples/kickmic/kick/kickmic_kick_snon_vl2_rr1.flac`    | `kick-soft.flac`          |
| `Samples/kickmic/kick/kickmic_kick_snon_vl4_rr1.flac`    | `kick-accent.flac`        |
| `Samples/snaremic/snare/snaremic_snare_center_vl8.flac`  | `snare-soft.flac`         |
| `Samples/snaremic/snare/snaremic_snare_center_vl18.flac` | `snare-medium.flac`       |
| `Samples/snaremic/snare/snaremic_snare_center_vl28.flac` | `snare-accent.flac`       |
| `Samples/oh/hh/oh_hh_closed_vl2_rr1.flac`                | `hat-soft-1.flac`         |
| `Samples/oh/hh/oh_hh_closed_vl2_rr2.flac`                | `hat-soft-2.flac`         |
| `Samples/oh/hh/oh_hh_closed_vl4_rr1.flac`                | `hat-accent-1.flac`       |
| `Samples/oh/hh/oh_hh_closed_vl4_rr2.flac`                | `hat-accent-2.flac`       |

## bass

- 官方來源：[音源頁](https://shop.karoryfer.com/pages/free-black-and-blue-basses)；[素材 Repository](https://github.com/sfzinstruments/karoryfer.black-and-blue-basses)。
- 固定來源 commit：`6e7d674cdb41be7a54dbccb15472401ad01099b9`。
- 授權：[來源 CC0 全文](https://raw.githubusercontent.com/sfzinstruments/karoryfer.black-and-blue-basses/6e7d674cdb41be7a54dbccb15472401ad01099b9/license)；本地 [LICENSE-CC0.txt](../src/instruments/bass/samples/LICENSE-CC0.txt)。
- Credit：Karoryfer Samples / D. Smolken。CC0 不強制署名。
- 重現命令：`python scripts/import-samples.py bass`。

真實黑色空心五弦電貝斯 regular finger plucks，未使用來源庫的加工假奏法。Mono24-bit44.1k 轉 PCM16、各層共同增益，保留完整 5 秒，無 loop／重採樣／人工八度移調。實測原檔 c2 等低一個八度，因此改選原檔 c3/e3/g3/b3，對應實際發聲 MIDI36/40/43/47，輸出採科學音名 c2/e2/g2/b2。原來錯八度子集保留於原始備份，但不屬本次散布檔案。此修正不改變生成事件。

| 使用的原始檔案                                  | 散布檔名（本件 samples/） |
| ----------------------------------------------- | ------------------------- |
| `Samples/darkblack/reg/darkblack_c3_p_rr1.wav`  | `c2-soft.wav`             |
| `Samples/darkblack/reg/darkblack_c3_mf_rr1.wav` | `c2-loud.wav`             |
| `Samples/darkblack/reg/darkblack_e3_p_rr1.wav`  | `e2-soft.wav`             |
| `Samples/darkblack/reg/darkblack_e3_mf_rr1.wav` | `e2-loud.wav`             |
| `Samples/darkblack/reg/darkblack_g3_p_rr1.wav`  | `g2-soft.wav`             |
| `Samples/darkblack/reg/darkblack_g3_mf_rr1.wav` | `g2-loud.wav`             |
| `Samples/darkblack/reg/darkblack_b3_p_rr1.wav`  | `b2-soft.wav`             |
| `Samples/darkblack/reg/darkblack_b3_mf_rr1.wav` | `b2-loud.wav`             |

## 直接程式依賴

沿用 M0 lockfile，沒有新增音訊／AI 套件。Tone.js 15.1.22、React／React DOM、
Vite、Vitest、Tonal、ESLint、typescript-eslint、Prettier 為 MIT；TypeScript 與
Playwright 為 Apache-2.0。各套件 LICENSE 保留於 node_modules，精確版本見
`package-lock.json`。取樣 CC0 與程式相依套件授權分開記錄。
