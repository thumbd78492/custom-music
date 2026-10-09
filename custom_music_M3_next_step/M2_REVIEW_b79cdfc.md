# custom-music — M2 收尾審查與 M3 進入條件

日期：2026-10-09  
審查基準：`b79cdfce3dba150ac36150a6bb89065e2e72db0f`（`master` 查得的最新提交）  
結論：**可作為 M3-A1 的開發基線；人工音樂品質仍 Pending。**

本文件是審查結果，不代表已在使用者的 Windows 重跑完整回歸，也不是 GitHub 上的程式修改。

## 1. 審查範圍與證據等級

- 透過 GitHub 連接器讀取指定 commit 的 `plan.md`、CURRENT_STATE、角色 ADR、Host、PluginSession、BarPlanner、PhraseCoordinator、Piano melody、ToneClock 與短稿報告；另核對相對前版的檔案變更。
- 獨立以 Python/SoundFile 讀取本次上傳的三份 WAV，計算 PCM 時長、RMS、sample peak 與 SHA-256。數值存於同目錄 `audio_review_metrics.json`。
- 未取得被 Git 忽略的 `.verification/` 與 `.isolation/` 本機原始收據。127 Vitest、38 Edge E2E、四件隔離與其他完整回歸結果，是開發文件及使用者回報，而非本次重新執行。
- 嘗試在審查容器取得完整 repository 以重跑測試，但容器無法解析 github.com；GitHub 連接器的原始碼讀取正常。因此本次不宣稱已獨立建置或執行完整專案。
- WAV 是離線試聽稿，不能證明真實 UI 操作、Transport 切換或背景恢復。没有從混音自動分離聲部，沒有以整體 RMS 推定主奏是否對等。

## 2. 已確認的架構成果

### 2.1 兩個鋼琴角色不是複製兩個 Piano Plugin

Host 透過 metadata 產生角色位置，以 `instanceId` 管理 Entry；身份含 `pluginId / characterId / instanceId`。每個 Entry 各自持有 session、voice 載入 ownership、音軌及 desired/actual 狀態。

PluginSession 的 state 封裝在每次建立的 closure，傳給生成器前取得 JSON snapshot；PRNG 派生包含實例三種 ID 與 Plugin 版本，不依 async load 完成順序。這符合「共用樂器程式與素材、隔離演奏狀態」的方向。

目前是每種角色一個穩定舞台位置 `characterId:1`。這足夠支援本輪兩種鋼琴角色；**不等於已完成 UI 中任意複製同角色 N 位**，後者不是下一輪必要範圍。

### 2.2 自己與其他角色的意圖已分開

BarPlanner 傳入每個 session 的 `coordinate(...)` 明確排除自身 ID，再另外提供自己的 assignment。Muted、Solo 抑制、volume 0 的角色不占一般領句名額。這避免兩位主奏把自己的活動也當成需要退讓的對象。

### 2.3 原本改善的小提琴發聲沒有被重做

本輪差異集中於角色 metadata、生成任務、Host 與協調器。小提琴取樣、校準、performance/voice 與 -9 dB 發聲基線保留。下一輪應繼續保護此基線；節奏改變需驗證連奏間隔與 note-off，不以重新調音色補救排程問題。

## 3. 發現與下一步處置

### R1 — 樂句分工仍是固定模板（確定；音樂品質改進，非阻擋缺陷）

`PhraseCoordinator.assign()` 的時段目前是硬編排：例如第 3 小節以 step 4 交接，句尾以 step 9 交接，回答者第一小節休止。在兩位固定主奏下，least-recently-led 的排序也傾向嚴格輪替。

這是合理的 M2 起點，但即使主角輪流，問答節奏仍可機械化。M3-A1 先加入少量可重現的 2/4 小節節奏布局，同一布局持續一個樂句，再在邊界有限變奏；避免每小節隨機換模板。長期主題發展留 M3-B。

來源：`src/core/PhraseCoordinator.ts`。

### R2 — 鋼琴主題的節奏材料仍有限（確定；主要留 M3-B）

`piano/melody.ts` 目前使用三個輪廓、三個節奏型，建立兩小節主題；兩小節使用同一個節奏型。`vary` 主要改第三個音的音級，而不是改節奏。

M3-A1 只需讓節奏身份、回應長短與 Groove 有關，不要整個重寫 Melody。M3-B 再加入縮短/延展、節奏位移、較長問答、主題回想與有上限的更新策略。不要為了消除重複而每小節生成新旋律。

來源：`src/instruments/piano/melody.ts`。

### R3 — Swing 的時序契約尚未具備（確定；M3-A1 必做）

BarPlanner 仍要求 step 是 0–15 的整數，且非零 microOffsetMs 被拒絕；ToneClock 以 Transport ticks 排程。整數作曲網格本身不是缺陷，但它不是 Swing 的實際發聲時間。

新增通用「邏輯時間 → 演奏 tick」映射。**音符起點與 note-off 都要映射**；只延後起音卻保留原秒數音長，可能破壞原本連奏、插出重疊或提早止音。混音/生命週期小節邊界不可跟著 Swing。只保留一個 Swing 實作者，不疊加 Transport.swing 與自訂偏移。

來源：`src/core/BarPlanner.ts`、`src/audio/ToneClock.ts`。

### R4 — 失敗的 Solo 角色需要補針對性回歸（靜態風險，未在完整專案重現）

BarPlanner 的 `anySolo` 在排除 propose 失敗的角色之前計算。若雙主奏中的唯一 Solo 角色提案失敗，健康的非 Solo 主奏仍可能被排除於 audible roster，取得 rest 任務，無法在該小節接手。generate 階段失敗亦值得驗證。

下一輪第一步用最小失敗注入重現。確認問題後只做局部修正；保留既有「使用者刻意 Mute 唯一 Solo」的靜音語意，不把使用者靜音與角色故障混淆。若需重新分配，禁止無上限重試，也不能把同一 session state 推進兩次。若無法重現，記錄測試證據，不任意重構。

來源：`src/core/BarPlanner.ts` 中 proposals、failed、anySolo、audible 與 assignments 的計算順序。

### R5 — Runtime 控制與未提交計畫需要正式契約（新增需求，不是 M2 缺陷）

現有 Host 的 VariationMode 播放中禁止切換；新 Groove/Style API 不能照抄此限制。要立即接受請求，但只在最近未提交、安全的小節套用。不可呼叫 Stop/Start、重建 Director、重設 seed/instance state，或改寫已排程音符。

Live Style 還會碰到預先快取的段落與已公布的 nextChord。M3-A2 必須從保留的音樂邊界建立 TransitionPlan，而不是清空全域快取或同時播放兩首完整混音。

來源：`src/core/EnsembleHost.ts`；既有計畫的不可變排程原則。

## 4. 上傳 WAV 的獨立量測

| 檔案 | 秒數 | RMS dBFS | Sample peak dBFS | 滿刻度取樣點 |
|---|---:|---:|---:|---:|
| melody-piano-full.wav | 46.8305 | -31.6373 | -15.0120 | 0 |
| equal-duet-full.wav | 78.3035 | -34.3641 | -15.0900 | 0 |
| five-role-full.wav | 78.3035 | -29.7744 | -10.3290 | 0 |

三份都是 22050 Hz、雙聲道，四捨五入後與 repository 短稿報告一致。沒有滿刻度點不代表所有失真或音樂性都通過；sample peak 不是 true peak。RMS 計算採所有 channel samples 的 mean square，不先將 stereo 加成 mono。

三份短稿不能取代 10–30 分鐘連續播放；本次沒有將人工品質 Pending 改為 Passed。先帶著這份基線進行 M3-A1，而不是繼續無限擴張 M2。

## 5. 下一輪範圍決策

**先做 M3-A1：律動引擎與播放中切換律動。** 同 BPM 下可聽出 Straight / Light Swing / Half-time 的差異，搭配切分、跨小節變奏、過門與問答節奏變化。

**M3-A2：播放中切換曲風是必做，不是等 M5 才做。** 先兩種再三種風格，2–8 小節過渡，持續同一 session 與角色實例。A1 先交付一次，A2 沿用同一控制與排程契約。

其後 M3-B 主題與長時間發展、M3-C 重播/事件匯出、M4 UI/品質、M5 LLM 都保留。實作規格見 `M3_IMPLEMENTATION_PLAN.md`；開始指令見 `START_M3_A1.md`。

## 6. 可追溯來源

以下所有專案來源固定到審查 commit，不隨 master 漂移：

- https://github.com/thumbd78492/custom-music/commit/b79cdfce3dba150ac36150a6bb89065e2e72db0f
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/plan.md
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/CURRENT_STATE.md
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/docs/adr-m2-role-instances.md
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/docs/M2_DUAL_LEAD_REVIEW.md
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/src/core/PluginSession.ts
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/src/core/PhraseCoordinator.ts
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/src/core/BarPlanner.ts
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/src/core/EnsembleHost.ts
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/src/instruments/piano/melody.ts
- https://github.com/thumbd78492/custom-music/blob/b79cdfce3dba150ac36150a6bb89065e2e72db0f/src/audio/ToneClock.ts
