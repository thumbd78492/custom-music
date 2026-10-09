# M2 小提琴根因診斷與短稿 — 待人工複聽

日期：2026-10-09；Plugin `0.2.2`；停在 M2。
使用者已聽 `0.2.1` 修正稿，**音符進出太突兀、同一旋律內音量忽大忽小，
兩項人工回饋未通過**。新短稿的人工複聽 Pending，其他未驗收項目仍 Pending。
工程測試與以下 3 dB 目標都不構成人工音質通過。

## 凍結範圍

保留 Violin gainDb **-9**、Master **0.65**、最新 Generator／Motif、四件
MusicEvent、Seed alpha／Balanced、原 BPM／和聲。取用上一版正常合奏的前
11 小節；沒有重新生成獨奏旋律，Full／Violin Only 均來自同一次分軌合奏渲染。
三件伴奏先驗證重渲染誤差 <1e-7，再固定相同 PCM，Before／After 伴奏 bytes 相同。
未使用 Master Normalize、Limiter 或 Compressor。

- [來源凍結與 hash](../.verification/violin-diagnosis-2026-10-09/baseline/freeze.json)
- [完整合奏事件凍結](../.verification/violin-diagnosis-2026-10-09/baseline/ensemble.json)
- [受測事件前綴](../tests/fixtures/violin-m2-frozen-ensemble.json)
- [受保護來源與事件比對](../.verification/violin-diagnosis-2026-10-09/scope-verification.json)

Runtime 修改只在 `src/instruments/violin/**`。共用 SampleVoice／契約、Host、
Director、AudioEngine、CreativeDirectorPort、其他三件來源均未修改。

## 單因素實驗

只載入 Violin 取樣，44100 Hz OfflineAudioContext，WAV 另乘固定 Master 0.65。
所有版本使用完全相同的診斷 MusicEvent；逐一比較以下因素：

1. 現行雙層、固定 Soft 單層、固定 Loud 單層；其他播放條件相同。
2. 每種層選擇的現行 offset（0／1.2 秒），對照一律 1.2 秒穩定區。
3. 固定 Loud／1.2 秒，同音 Source 延續開／關。

統一穩定區版本只作診斷。正式候選保留各錄音有效音頭，不把所有音頭永久切掉。
每片約 25–28 秒，涵蓋：69–84 慢速上／下行、根音選擇邊界
74→75／77→78／80→81／82→83 及反向、每個 MIDI 的 Detached→Legato→Rebow、
同音重複與延續、0.26／0.3／0.5／0.6／0.75／0.9／1.9／2.1／2.4 秒。
四組固定力度 0.50／0.56／0.62／0.74 覆蓋凍結 Generator 實際
0.547155–0.624624 的力度範圍；沒有指定漸強。

以下是相鄰音穩定區的最大絕對差，單位 dB；不是整段 RMS：

| 同一固定音列，力度 0.56 | 雙層現行 offset | 固定 Loud 現行 offset | 雙層統一穩定區 | 固定 Loud 統一穩定區 | 修正候選 |
| ----------------------- | --------------: | --------------------: | -------------: | -------------------: | -------: |
| 69–84 上／下行          |           5.184 |                 1.702 |          5.184 |                1.702 |    1.660 |
| 每 MIDI 三種奏法        |           6.199 |                 2.742 |          4.636 |                1.670 |    1.224 |
| 六個根音短／長音        |           6.783 |                 2.010 |          4.489 |                1.419 |    1.737 |
| 同音／Rebow／長音       |           5.437 |                 2.909 |          7.216 |                2.029 |    2.068 |
| 69–76 各音高短／長音    |           6.746 |                 1.206 |          2.656 |                1.664 |    1.271 |
| 77–84 各音高短／長音    |           5.157 |                 2.742 |          5.029 |                1.748 |    1.370 |

固定三奏法音列在 0.50 的雙層差達 **7.629 dB**；0.56／0.62／0.74 的修正候選
與 0.50 一樣約 **1.224 dB**。所有固定音列的全組穩定區跨度也檢查 <=3 dB，
目前最差 **2.524 dB**。這是本次待聆聽確認的工程目標，不是通用音樂標準。

### A：校準區段沒有涵蓋實際起音

原 Soft 的來源前 150 ms 比 1.2–3.1 s 持續區低約
E5 **19.79 dB**、G5 **22.79 dB**、C6 **18.90 dB**。
舊 sustain gain 同時套在 offset 0 的 Detached／Rebow，無法校準短音真正播放的區段。
固定 Loud 的三奏法全組跨度由現行起播 **4.629 dB** 降至統一穩定區 **2.940 dB**，
證實音頭／區段選擇也是變因；但統一 offset 仍未修好雙層起伏。

本輪依實際 MIDI、playbackRate、offset、音長、奏法與同音延續位置測量。
使用 Loud 及有效音頭，補償錄音本身區段能量，不放大弱 Soft 音頭與底噪。

### B：雙力度層額外引入包絡與相干項

雙層即使統一穩定區，上／下行仍有 **5.184 dB** 相鄰差；單 Loud 是 **1.702 dB**。
0.56 的 C5 Detached／Rebow，實際雙層混合穩定 RMS 比按各層功率相加的
不相干預測低約 **4.00 dB**。這個實測交叉項與不同錄音的包絡變化一起作用，
equal-power 權重不能保證真實錄音混合後等響。

因此目前固定 Loud；原始 velocity 仍控制線性演奏增益，保留樂句表情。
沒有把揉弦拉成平線。是否恢復 Soft／Loud 混合，要等短稿通過再評估。

### 同音延續的限度

Loud／穩定區的同音序列，延續開啟相鄰差 **2.029 dB**，關閉為 **1.463 dB**；
延續保留錄音原有包絡，並不保證完全固定響度。
正式版保留相連同音的 Source，避免每音重置錄音相位；Rebow 保留新音頭。
真實長音／兩音延續 waveform、Stop 與 disconnect 另作回歸。

## 正式候選的取樣設定

| Loud 根音 | Detached／Rebow offset（來源秒） | Legato offset | Region gain dB | 音頭額外衰減 dB |
| --------- | -------------------------------: | ------------: | -------------: | --------------: |
| C5        |                             0.06 |           1.2 |         -7.884 |               0 |
| E5        |                             0.03 |           1.2 |         -1.699 |               0 |
| G5        |                             0.06 |           1.2 |         -1.128 |            -1.8 |
| A5        |                             0.16 |           1.2 |         -6.489 |            -1.2 |
| C6        |                             0.09 |           1.2 |         -4.856 |               0 |

音頭額外衰減用 Plugin 的單層 weight 表示；最大為 1，不新增共用播放器能力。
Detached／Rebow attack／transition 80 ms，Legato 保留 70 ms equal-power crossfade。
350 ms release、原 sample bytes／tuning／loop 都保留。所有 Loud region gain 都是衰減。
不是逐窗自動調平，也不是壓縮器。

第一候選在同音→Rebow 差 **3.256 dB**，未通過且保留；再依實際區段校準。
沒有放寬 3 dB 目標或刪除該組。測試由舊 -9 dB 換音下限收緊至 -5 dB，
並新增全部 MIDI／奏法／音長／力度的逐音量測，沒有只測 0.5999／0.6001。

## 原始包絡與尚未通過的項目

每音紀錄 MIDI、奏法、velocity、取樣 key、region gain、層 weight、實際 source ID、
playbackRate、Source 起播 offset、同音延續時的有效 loop 位置、起止時間與發聲時間。
保留有效發聲區 RMS、穩定區 RMS、前 100／250 ms RMS、起音延遲，
20／100 ms 包絡（5 ms hop），以及換音前／中／後視窗與完整原始曲線。

起音延遲定義為：在去除前音干擾的相同 Source 位置／速率／層包絡渲染中，
第一個 20 ms window 達該音穩定 RMS -12 dB 的時間。同音延續沒有新 onset，記 null。
孤立渲染只用來量測；交付 Violin Only 始終抽自合奏渲染。
續音的孤立參考從當下有效位置與新目標增益開始；換音期間的真實 gain automation
以實際連續渲染曲線為準，不能用孤立參考取代。

穩定區目標通過不代表所有短窗都在 ±3 dB。Rebow、錄音揉弦與重疊波形仍有低谷；
保留「修正前最差」及「修正後最差」的對應前後曲線，不只挑改善最大的案例。
有休止的最低視窗另列，沒有移除事件，也不把自然休止當成連奏缺陷。

**音符進出自然度、同一旋律的感知響度、Loud 固定音色是否合適、合奏平衡仍須複聽。**
短稿人工確認前，不開始長時間音樂品質驗收，也不開始 M3。

## 執行與收據

只診斷：`VIOLIN_DIAG_PHASE=before` 執行 `violin-diagnostic.spec.ts` 可重跑凍結版
七個單因素版本；預設執行完整候選矩陣。沒有靠 ignored 歷史 WAV 才能跑測試。
`violin-ab.spec.ts` 專門輸出凍結 11 小節的相同事件短 A/B。
所有輸出用新 UTC timestamp 目錄保留；樣本與主程式不因量測而改寫。
完整工程回歸使用 `npm run verify:m2`；既有十分鐘離線測試是程式回歸，
不是本輪的長時間音樂品質驗收。

歷史資料註記：一次執行修改前的 `violin-quality.spec.ts`，重寫了舊目錄
`.verification/violin-m2-2026-10-09/audio-quality.json` 及兩份 `legato-probe` WAV。
它們現在包含本輪中間稿，不再當成 `0.2.1` 的原始收據。
先前完整回歸 log／其他歷史 A/B 仍保留；本輪 Before 使用事前凍結的原 performance／bank
與相同事件重新渲染，來源及數值可查。測試輸出現已改成各次獨立目錄。

## 本輪交付與工程回歸

全部 **27.7206 秒**，四件使用同一凍結事件前綴，Violin Only 從分軌合奏抽取：

| 範圍          | 修正前 0.2.1                                                                                                    | 修正候選 0.2.2                                                                                                |
| ------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Violin Only   | [Before](../.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/before-violin-only.wav) | [After](../.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/after-violin-only.wav) |
| Full Ensemble | [Before](../.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/before-full.wav)        | [After](../.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/after-full.wav)        |

[相同伴奏](../.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/before-without-violin.wav)、
[事件 hash／WAV hash／量測收據](../.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/receipts.json)。
三件重渲染最大誤差 Piano 1.49e-8、Bass 0、Drums 5.96e-8；交付固定相同伴奏 PCM。
Violin 30 個相同事件的穩定區相鄰最大差 **7.672 → 1.644 dB**；
實際樂句保留原 velocity 表情，全段穩定區跨度仍 **3.130 dB**。
短稿 Violin 整段 RMS -42.21 → -40.50 dBFS；去除混合抵消、調整實際區段會改變輸出能量，
沒有再動 -9 track gain 或 Master 來匹配整段 RMS。因此合奏音量仍須人工複聽。

- [70 份單因素短稿／逐音與原始包絡摘要](../.verification/violin-diagnosis-2026-10-09/attempts/2026-10-08T19-28-28-962Z/summary.json)
- [完整回歸同批的候選矩陣](../.verification/violin-diagnosis-2026-10-09/attempts/2026-10-08T19-26-49-194Z/summary.json)
- [補強實際 Source ID 延續斷言後的完整候選矩陣](../.verification/violin-diagnosis-2026-10-09/attempts/2026-10-08T19-35-33-705Z/summary.json)
- [前後彙整與最差案例](../.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/comparison.json)
- [逐音穩定 RMS 圖](../.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/stable-note-rms.png)／[SVG](../.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/stable-note-rms.svg)
- [20／100 ms 原始曲線](../.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/worst-transition-curves.png)／[SVG](../.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/worst-transition-curves.svg)
- [第一候選未通過的同音組](../.verification/violin-diagnosis-2026-10-09/attempts/2026-10-08T19-07-54-638Z/same-v0.56-candidate.json)

已改善：固定力度的跨音高／取樣邊界／奏法／音長響度一致性、弱音頭接強持續區的量級落差、
雙層錄音混合的相干項。仍未全面改善：所有 20 ms 換音低谷。
例如 C5 同音 Rebow，20 ms 最低相對值 **-15.531 → -11.383 dB**，
100 ms **-8.732 → -2.696 dB**；實際旋律 81→79，20 ms
**-3.614 → -7.444 dB** 反而更深，100 ms **-1.015 → -1.219 dB**。
原始曲線明示這個較差案例，沒有以穩定區目標取代人工自然度驗收。

`npm run verify:m2` 完整工程結果：

| 檢查               | 本輪結果                                                              |
| ------------------ | --------------------------------------------------------------------- |
| Typecheck          | 通過                                                                  |
| Vitest             | 17 檔、111 項通過                                                     |
| Build              | 通過；主 chunk 540.37 kB，既有大小警告                                |
| Samples／授權 hash | 41 音檔、4 份授權一致，sample bytes 未修改                            |
| 四件實體隔離       | 各自 Typecheck／Build 通過；Bass／Drums 81、Piano 80、Violin 85 tests |
| Edge E2E           | 35 通過、0 失敗、0 跳過，7.3 分鐘                                     |
| ESLint／Prettier   | 通過                                                                  |

[完整回歸收據](../.verification/2026-10-08T19-19-27-671Z/results.json)、
[實體隔離收據](../.isolation/2026-10-08T19-19-33-414Z/results.json)、
[E2E log](../.verification/2026-10-08T19-19-27-671Z/e2e.log)、
[真實 Samples 生命週期](../.verification/violin-diagnosis-2026-10-09/lifecycle/2026-10-08T19-26-57-314Z/audio-quality.json)。
同音 E5 用 1 個 Source 與長音 waveform 完全一致；72 次快速換音建立 72 Sources，
最多 3 個活躍，最後全部各 disconnect 一次，沒有 pitch ramps。
Attack／Crossfade／Release 中 Stop 的已播放前綴保留、尾端歸零。
既有八組換音 20 ms 視窗：最大 **+2.996 dB**、最低 **-4.514 dB**；
這個子測試下限由 -9 收緊至 -5，完整診斷的更差短窗另列且沒有省略。
後續僅在診斷測試補 Source ID 延續斷言與量測位置標籤，完整候選矩陣再跑通過；
Runtime 音訊程式未再修改。逐音目標與完整工程回歸仍不是人工音質通過。
