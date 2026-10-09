# M2 小提琴音量與連奏修正 — 待人工複聽

日期：2026-10-09。範圍停在 M2；Violin Plugin 版本 `0.2.1`。
使用者已聽原 `alpha-balanced.wav`，指出合奏中小提琴過大、相鄰音像每次重新拉弓。
使用者已聽修正稿，仍回報音符進出太突兀、同一旋律內音量忽大忽小；
兩項均為 **人工回饋未通過**，其他項目維持 Pending。以下是上一輪的歷史工程證據，
不能當成本輪音質通過。最新根因診斷另行記錄，範圍停在 M2。

[本輪根因實驗與短稿](M2_VIOLIN_DIAGNOSIS.md)。歷史 `audio-quality.json` 與
`legato-probe` WAV 曾被舊測試重寫，現檔不是原 `0.2.1` 收據；詳見本輪資料註記。

## 可複聽的比較

所有受控 A/B 使用 `alpha`／Balanced 前 64 小節、22050 Hz stereo PCM16，
相同 BPM／和聲計畫、Master 0.65，沒有 limiter、Peak／Loudness／Master Normalize。
原版事件逐項等於已聽十分鐘稿的前 64 小節；身份與 hash 在
[baseline-identity.json](../.verification/violin-m2-2026-10-09/baseline-identity.json)。

| 比較            | Full Ensemble                                                                      | Violin Only                                                                                 | 演奏差異                     |
| --------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| 原版 -5         | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-before-minus5-full.wav)     | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-before-minus5-violin-only.wav)     | 原演奏、原 sample mapping    |
| 只改音量 -8     | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-gain-only-minus8-full.wav)  | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-gain-only-minus8-violin-only.wav)  | 相同原演奏、只調增益         |
| 只改音量 -9     | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-gain-only-minus9-full.wav)  | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-gain-only-minus9-violin-only.wav)  | 相同原演奏、只調增益         |
| 只改音量 -10    | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-gain-only-minus10-full.wav) | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-gain-only-minus10-violin-only.wav) | 相同原演奏、只調增益         |
| 演奏策略修正 -9 | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-voice-only-minus9-full.wav) | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-voice-only-minus9-violin-only.wav) | 相同原演奏、改連奏與力度混合 |
| 完整修正 -8     | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-after-minus8-full.wav)      | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-after-minus8-violin-only.wav)      | 新小提琴旋律、連奏與力度混合 |
| 完整修正 -9     | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-after-minus9-full.wav)      | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-after-minus9-violin-only.wav)      | 本次預設候選                 |
| 完整修正 -10    | [Full](../.verification/violin-m2-2026-10-09/wav/alpha-after-minus10-full.wav)     | [Violin](../.verification/violin-m2-2026-10-09/wav/alpha-after-minus10-violin-only.wav)     | 新小提琴旋律、連奏與力度混合 |

[Ensemble Without Violin](../.verification/violin-m2-2026-10-09/wav/alpha-ensemble-without-violin.wav)
是所有比較共用的相同伴奏。Solo／Without 是從合奏演奏事件抽取聲部，不重新生成。
新旋律版保留原版伴奏事件與 PCM；實際 App 中新的 Violin 意圖仍正常參與匿名協作，
可能間接影響其他聲部事件，但其他三件生成器及設定均未修改。

原版、只調音量、只改演奏策略、再加入旋律修正四階段可分辨原因。
請保持播放器與裝置音量固定，先比較 -9 對原版，再選 -8 或 -10。
檢查小提琴是否掩蓋鋼琴、同弓內是否仍有重起音、同音延續、轉調與句尾是否自然。
[短連奏 Before](../.verification/violin-m2-2026-10-09/wav/legato-probe-before.wav)／
[After](../.verification/violin-m2-2026-10-09/wav/legato-probe-after.wav) 使用相同音符與 -9 dB。

## 量測與主觀結果

完整數值與 100 ms hop 的 3 秒短時間 Loudness 曲線：
[metrics.json](../.verification/violin-m2-2026-10-09/metrics.json)。
RMS 是 stereo channel mean 的 dBFS；Peak 是 sample peak，不是 oversampled true peak。
LUFS 是本地 BS.1770 K-weighted meter 的結果，包含 400 ms Momentary、3 秒 Short-term，
及 -70 LUFS／-10 LU 的 Integrated gating；不是經認證的 broadcast meter。
量測基於未量化 Float32，WAV 不會自動補償播放音量。

| 原演奏增益 | Full RMS dBFS | Full 最大 3 s LUFS | Full Peak dBFS | Violin RMS dBFS | Violin 最大 3 s LUFS | Violin Peak dBFS | 人工聽感                   |
| ---------- | ------------- | ------------------ | -------------- | --------------- | -------------------- | ---------------- | -------------------------- |
| -5         | -29.25        | -22.96             | -10.60         | -34.33          | -24.84               | -17.10           | 已收到過大、換音不自然回饋 |
| -8         | -29.98        | -24.46             | -11.38         | -37.33          | -27.84               | -20.10           | Pending                    |
| -9         | -30.15        | -24.84             | -11.59         | -38.33          | -28.84               | -21.10           | Pending                    |
| -10        | -30.28        | -25.17             | -11.79         | -39.33          | -29.84               | -22.10           | Pending                    |

伴奏 Without Violin：RMS -30.85 dBFS、最大短時間 -26.19 LUFS、Peak -11.99 dBFS。

| 聲部（相同 Master） | RMS dBFS | 最大 400 ms RMS dBFS | 最大 3 s LUFS | Peak dBFS |
| ------------------- | -------- | -------------------- | ------------- | --------- |
| Piano               | -38.54   | -32.02               | -32.68        | -19.54    |
| Bass                | -34.63   | -30.80               | -30.48        | -20.46    |
| Drums               | -34.65   | -25.05               | -28.47        | -13.80    |
| Violin 原 -5        | -34.33   | -25.79               | -24.84        | -17.10    |

四聲部各自 RMS、400 ms RMS、Momentary／Short-term／Integrated LUFS、Peak 均有獨立紀錄。
RMS／LUFS 支持相對量級比較，無法代替實際合奏中的掩蔽與聽感。
新演奏的 source 校準和音長會改變整體 RMS，不能只用 gainDb 判定兩稿等響。

| 完整修正候選 | Full RMS dBFS | Full 最大 3 s LUFS | Full Peak dBFS | Violin RMS dBFS | Violin 最大 3 s LUFS | Violin Peak dBFS | 人工聽感 |
| ------------ | ------------- | ------------------ | -------------- | --------------- | -------------------- | ---------------- | -------- |
| -8           | -30.43        | -25.69             | -11.64         | -40.79          | -34.37               | -26.74           | Pending  |
| -9           | -30.51        | -25.79             | -11.68         | -41.79          | -35.37               | -27.74           | Pending  |
| -10          | -30.58        | -25.87             | -11.71         | -42.79          | -36.37               | -28.74           | Pending  |

完整修正 -9 的 Violin RMS 比原版 -5 低約 **7.46 dB**：包含指定的 -4 dB track gain，
以及 sample 校準、力度與演奏事件的影響。仍須確認是否變得過小，不能用工程測試
替使用者選定主觀音量。-8／-10 版本只對同一份完整修正演奏做線性 gain 比較。

前 64 小節的旋律平均音長 **0.548 → 0.651 s**；>4 semitones 的相鄰音程
**22 → 0**；重複同音比例 **25.1% → 20.1%**，108 個 Legato 事件，仍有 10 個休止小節。
[melody-metrics.json](../.verification/violin-m2-2026-10-09/melody-metrics.json) 是旋律結構統計，
不是好聽證據；四 Seed 280 小節測試另限制重複同音比例 <55%，避免聲部連接變成停留原音。

## 演奏與旋律

- `performance.ts` 只屬於 Violin。實際音訊時間的間隔不超過 75 ms、音程不超過
  4 semitones 且沒有指定換弓時可連奏；明確休止、大跳、Detached／Rebow 保留音頭。
- 連奏從錄音穩定弓奏區 1.2 s 起播，70 ms sine／cosine 交叉淡化；Detached 使用
  錄音開頭與 45 ms attack。問題來自每音重播音頭，不是把不足一秒的音歸咎於 loop seam。
- 同音且相同錄音層延長既有 Source、重新安排 gain／note-off／stop，維持錄音相位。
  改變音高只在新 Source 建立固定 playbackRate；沒有 pitch ramp／glide。
- 兩力度層採 smoothstep 的連續 equal-power 混合；同弓內力度混合只緩慢移動。
  錄音 1.2–3.1 秒持續區 RMS 校準到 -21 dBFS，補償層與根音原始錄音大小。
  最大補償為 +4.315 dB，不改 sample 檔、不做 Master Normalize；
  [校準與來源 hash](violin-sample-calibration.json) 可用 `python scripts/audit-violin-samples.py` 重現。
- Motif Memory 仍保留 2–4 小節的節奏與相對輪廓、變奏、更新與 Return 回想。
  多用 3–6 step 音長、同弓分組、句尾呼吸，降低不必要跳進；重拍和弦音改為偏好，
  轉調時優先近距離聲部連接。四 Seed 各 280 小節測試要求平均音長 >0.55 s、
  相鄰音程 <=4 semitones，並保留連奏與休止。

這仍是 sustain recordings 的連奏近似，並非錄製的真實 legato transition samples。
不同根音／力度錄音的 Vibrato 無法保證完全同相，是否聽來自然仍需要人工判定。

## 架構與安全驗證

共用 AudioServices 只新增通用 `SamplePerformance`：指定錄音層／權重、source offset、
包絡、交叉淡化和相同 Source 延續。Host／AudioEngine 沒有 Violin 專用分支。
其他 Plugin 不需使用新契約；共同時鐘、動態 BPM／和聲與轉調、Seed、
Motif Memory、CreativeDirectorPort／LLM 擴充入口均保留。

`SampleVoice` 用包絡節點追蹤 gain，Stop／取消時保留已排程前綴；
continue 僅在 Source 尚未結束且 MIDI／region 相符時重排 future stop。
有限 source cap、onended disconnect、dispose 冪等、載入取消／timeout 都保留。
Web Audio 的 future stop 重排與 automation hold 依
[W3C Web Audio](https://www.w3.org/TR/webaudio-1.0/)；量測時間尺度依
[EBU Tech 3341](https://tech.ebu.ch/docs/tech/tech3341.pdf)。

[audio-quality.json](../.verification/violin-m2-2026-10-09/audio-quality.json) 包含實際 Samples 渲染：
連奏 20 ms RMS windows、八組音程／sample root 轉換、所有五根音跨 0.6 門檻、
同音 waveform 連續性、Attack／Crossfade／Release 期間 Stop 的前綴與尾音、
72 次快速換音的 144 Sources 完整生命週期。此紀錄不是人耳驗收。

八組換音的 20 ms RMS 相對鄰近穩態參考，最大增加 **+2.554 dB**，
最低相對值 **-5.686 dB**；本輪門檻是 <+3.1／>-9 dB，沒有將這寫成零波動。
原 0.5999／0.6001 門檻對五根音造成 3.35–20.42 dB 差，修正後 0.0063–0.0097 dB。
同音延續與單一長音的非尾段 waveform 相同；在 Attack／Crossfade／Release 中 Stop，
已播放前綴最大誤差 <=7.46e-9，尾端歸零；快速換音最高 6 個 live Sources，最後全部釋放。

完整工程收據與最新十分鐘整段試聽稿見 [CURRENT_STATE.md](../CURRENT_STATE.md)。

最新完整批次 [results.json](../.verification/2026-10-08T18-06-29-299Z/results.json)：
Typecheck、111 Vitest、Build、Samples hash、四件實體隔離、34 Edge E2E、ESLint、Prettier 全通過。
最新 [10 分鐘正常合奏稿](../.verification/listening-2026-10-08T18-12-56-076Z/alpha-balanced.wav)
是 App 正常的匿名協作事件，與受控 A/B 固定伴奏的用途不同。人工驗收仍 Pending。

重新匯出受控 WAV：`npm run export:violin-ab`，需先有 ignored baseline stems。
在未修改原版時執行 `$env:VIOLIN_AB_PHASE='before'; npm run test:e2e -- tests/e2e/violin-ab.spec.ts`
才可建立新的原版基準，不能在修正後覆蓋成 Before。

開發期間兩次嚴格的伴奏 Float32 hash 比較失敗，差異上限為約 5.96e-8（浮點 ULP），
改為驗證重渲染誤差 <1e-7，再固定原版伴奏 PCM；原始失敗截圖保留在
`.verification/violin-m2-2026-10-09/attempts/exact-float-hash/`。
曾以 Node 22 不含 strip-types 的指令啟動 exporter，收到 unsupported .ts extension；
現已將 `--experimental-strip-types` 寫入 package script。這些失敗不算通過證據。

中間候選曾因過度偏好前一個音，造成 169／179 次換音重複同音，已撤下。
該 WAV 與原因保留在 `.verification/violin-m2-2026-10-09/attempts/melody-hold/`；
前一完整回歸於 E2E 中途停止，收據 `.verification/2026-10-08T18-02-24-710Z/`
僅記錄已完成項目，不能當完整通過。最新候選與回歸是修正這個問題後重新生成。
