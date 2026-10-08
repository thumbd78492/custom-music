# 開發狀態

日期：2026-10-09。M1 音量修正、M2 生成式音樂已分階段實作。
**M2 工程實作與完整回歸已完成；人工連續 10 分鐘音樂品質驗收仍 Pending。**

本次基線 `bf1be8488d275ac53263c1a3499bb8f60c2b4c8e`，開始時工作目錄乾淨。
使用者明確授權修正音量後進入 M2，並將 Motif Memory 納入本輪。
[2026-10-08 M1 歷史紀錄](docs/history/M1_STATE.md) 與所有舊收據保留。
本次未部署、未加入 LLM API、未修改音檔或 sample tuning。

## 階段 1：M1 混音修正

- Bass gainDb：-9 → **-12**。Violin：-12 → -7 初測後再調 **-5**。
- 使用原 M1 事件、真實 stereo Samples、原 voice 包絡、Master 0.65，
  四個 Seed 各 32 小節；測量整段 RMS、400 ms 最大 RMS、未經 limiter 的 sample Peak。
- 初測 Violin RMS 仍比 Piano 低約 3–5 dB，故增加 2 dB。最終 Bass RMS 約
  -29.2 至 -29.0 dBFS、Violin -32.8 至 -30.8 dBFS，合奏 Peak -10.3 至 -9.0 dBFS。
- [初測](.verification/mix-2026-10-08T16-27-22-423Z/metrics-and-events.json)、
  [最終候選](.verification/mix-2026-10-08T16-29-02-916Z/metrics-and-events.json)；
  原 M0 音樂 golden 61/61 通過，確認此階段沒有改作曲事件。
- Before 是相同聲部波形按原 gain 線性還原；沒有 Peak Normalize。
  RMS 不等於 LUFS／感知音量，sample Peak 也不是 oversampled true peak。
  最終設定仍待人工複聽；所有變更僅在 Plugin 的 sample bank。

## 階段 2：M2 音樂演化

- 引擎音樂版本 **m2.1**。初始 BPM 80–105，依 Seed 可重現；8–16 小節段落邊界
  才依能量方向小幅變速。Subtle／Balanced／Experimental，預設 Balanced。
- 條件式 Introduction／Main／Variation／Breakdown／Return 轉移、多組大／小調
  功能和聲；近系／關係調經共同和弦 pivot → 新調 V → I，非每小節亂數換調。
- ToneClock 以 immediate audio time 的 Transport ticks 定位小節，提前安裝
  BPM automation；所有樂器共用時鐘，音長不跨變速小節，release 使用 Plugin 包絡。
- Violin 私有 2–4 小節 Motif 保存節奏與相對音程，重現、變奏、更新及 Return 回想；
  MIDI 69–84，最短約 257 ms，具休止，不假裝錄製的真實 legato。
- Piano 轉位／聲部連接／琶音與主奏留白裝飾；Bass 依匿名 Kick 重音演奏，
  加入五度、八度、切分與經過音；Drums 依樂句改 groove、段落尾加 fill。
- EnsembleIntent 實際控制各件音域／密度／重音；Mute／Solo 不可聽聲部不佔意圖，
  仍推進其私有 state。Host 無具名樂器演奏分支、Plugin 不互相 import。
- CreativeDirectorPort 與 LocalRuleBasedAdapter 保留，沒有 LLM API。
- 分段檢查：2a Typecheck + 25 tests 通過；2b Typecheck + 103 tests 通過。
  新增靜音意圖隔離後完整批次為 104 tests。

## 階段 3：工程驗證

執行 `npm run verify:m2`（共用既有工程驗證 runner）。
[本次完整批次收據](.verification/2026-10-08T16-53-08-653Z/results.json)。

| 檢查               | 最新結果                                                |
| ------------------ | ------------------------------------------------------- |
| Typecheck          | 通過                                                    |
| Vitest             | 16 檔、104 項通過                                       |
| Production Build   | 通過；主 chunk 537.87 kB / gzip 149.00 kB，既有大小警告 |
| Samples／授權 hash | 41 音檔、4 份授權一致；17,148,524 bytes                 |
| 四件實體隔離       | 全部 Typecheck、Piano 77、其餘各 78 tests、build 通過   |
| Edge E2E           | 32 通過、0 失敗、0 跳過（7.2 分鐘）                     |
| ESLint／Prettier   | 全部通過                                                |

[實體隔離收據](.isolation/2026-10-08T16-53-14-953Z/results.json)：每個 fixture
只存在該件 Plugin；原目錄未移除或改名。M2 重現性涵蓋三模式 × 四 Seed ×
280 小節（每次超過 10 分鐘）、全部非空樂器子集合、反向載入順序、完整事件及
Tempo／Harmony Plan；不是只比較音量亂數。

真實 AudioContext 的 18 小節變速測試單獨執行已通過（45.5 秒），三條測試音軌
起音相對解析式誤差小於 0.2 ms，並驗證 mute 邊界。先前 OfflineContext 測試配置
只跑前三小節而失敗，已改為真實時鐘；不把該次失敗當成同步證據。
M0 golden 與原測試保留為歷史；M2 作曲輸出刻意改變，不宣稱 m0.1 事件相容。

## 試聽稿與人工驗收

已生成 [alpha / Balanced 試聽 WAV](.verification/listening-2026-10-08T16-59-37-055Z/alpha-balanced.wav)
與 [段落／完整事件／量測](.verification/listening-2026-10-08T16-59-37-055Z/plan-and-metrics.json)。
602.47 秒、250 小節、23 段，9 個 BPM 值（95–104）、8 個調性；未經 limiter 的
sample Peak -9.71 dBFS、RMS -28.41 dBFS。這些是結構與波形證據，不是好聽的證據。
真實 Samples、原 voice、Master 0.65，22050 Hz stereo PCM；未 Normalize，
不是 live Transport 錄音。先前試聽稿與所有量測收據仍保留，未覆蓋。

**[M2 人工聆聽表](docs/M2_LISTENING.md)：alpha、beta、音樂、0 各 10 分鐘仍 Pending。**
M1 使用者回饋已記錄，但沒有擅填聆聽時間或核可。重點確認持續 10 分鐘風格一致、
速度／和弦／主題／節奏／編曲有自然可辨變化，以及 Bass／Violin 平衡、Click／Pop、
loop、Release 與疲勞感。

極長背景凍結可有安靜追趕區；略過未提交的過期 attacks／tempo 轉換，在下一個
未來安全小節恢復 BPM，不回寫歷史 automation。未驗證 OS 長時間睡眠、行動裝置
或所有瀏覽器。沒有擴充 M4 UI、M3 replay 匯出或 LLM 網路服務。
架構與取捨見 [ARCHITECTURE](docs/ARCHITECTURE.md)、[M2 ADR](docs/adr-m2-generative.md)。

## 最終瀏覽器證據

完整 32 項 E2E 同批通過，包含原 M1 的 29 項 Samples、Stop／Release、取消、
重試、活躍 sources 歸零、主執行緒停頓、AudioContext suspend／resume 及真實背景測試。
新增完整 10 分鐘渲染、四 Seed RMS／Peak 稽核、原生 Transport 變速測試。
[瀏覽器 log](.verification/2026-10-08T16-53-08-653Z/e2e.log)。

背景實際 visible → hidden → visible，隱藏 10,168.7 ms、小節 1 → 4；
回到前景前 500 ms 只有 2 次新起音、遲到起音 0。
[背景收據](.verification/2026-10-08T16-53-08-653Z/browser/audio-real-background-brow-783e2-ynchronized-sample-playback/background-visibility.json)。

最終 M2 四 Seed 32 小節混音 Peak -10.9 至 -9.7 dBFS，Violin RMS -31.2 至
-28.5、Bass -31.3 至 -30.6 dBFS；保留不同音色／角色的差異，沒有自動對齊 Peak。
[最終混音收據](.verification/mix-2026-10-08T16-59-42-009Z/metrics-and-events.json)。
已檢視 [M2 UI 截圖](.verification/2026-10-08T16-53-08-653Z/browser/ensemble-m1.png)，
變化模式、實際 BPM／和聲／段落、四件控制正常呈現；截圖沿用既有測試檔名。
