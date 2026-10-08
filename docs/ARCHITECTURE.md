# M0 架構

本輪僅實作 `plan.md` 的 M0。音樂內容是基本示範模式；四種音色均為 synth placeholder。

## 模組邊界

```text
React App / InstrumentLab
    -> discoverPlugins (lazy manifest + lazy index)
    -> EnsembleHost
        -> MusicDirector -> BarPlanner -> EnsembleCoordinator
        -> InstrumentPlugin -> MusicEvent
        -> AudioEngine -> ToneClock / MasterMixer

Plugin index -> own generator / manifest / voice / samples
Plugin generator -> contracts + shared SeededRandom only
Plugin voice -> injected, track-scoped AudioServices
```

`contracts/` 不依賴 React、DOM、Tone.js。`AudioEnginePort` 讓 Host 測試可使用 fake audio；Host 只在型別層引用它。實際音訊層只消費已完成的 `MusicEvent`。

每個 Plugin 對外入口為 `index.ts`，metadata 為 `manifest.ts`。Host 不 import 具名樂器，也不解讀 Plugin state、音域策略或 sampleKey。通用 PRNG 是唯一允許 generator 使用的 core utility。

## 發現與載入

兩份 `import.meta.glob` 都使用預設 lazy。完整 App 只載入各個 manifest，點擊「加入」才載入 index、generator、voice 與該 Plugin 的 sample mapping。Lab 依 `?instrument=<directory-id>` 先過濾路徑，只讀該件的 manifest 與入口；未知 ID 顯示錯誤。

建置工具仍會掃描所有現存目錄。runtime lazy load 不等於建置時忽略其他目錄。`npm run test:isolation` 會建立只含一件 Plugin 的實體 fixture，分別 typecheck、Vitest、build，補足缺席情境的證據。

新增第五件：加入 `src/instruments/<id>/`，實作與 Piano 同樣的結構和契約，manifest.id 必須等於目錄名稱，新增自己的測試與授權紀錄。無需修改 Host、Director、音訊排程器或 UI。M0 的 controls 為空；尚未實作 M4 的專屬參數面板。

## 音樂生成

MusicDirector 是 BPM、調性與和弦的唯一生成來源：4/4、88 BPM、C Major、Cmaj7 → Am7 → Dm7 → G7。Tonal 僅由 Director 使用；計算好的 pitch classes 放進 BarPlan，各 Plugin 自行選擇音域、音長與音量。

每小節先讓所有 active Plugin `proposeBar`，按 ID 穩定排序聚合匿名 `EnsembleIntent`，再逐件 `generateBar`。Mute／Solo 只改混音，M0 仍推進所有 active Plugin 的 state。Plugin state 藉 closure 封裝，Host 不可讀寫；各次呼叫取得 JSON snapshot，只有 nextState 被提交。

Seed 使用 `JSON.stringify([rootSeed, barIndex, pluginId, purpose])`、FNV-1a 與 Mulberry32。載入順序不影響事件。保證相同引擎版本、輸入、state、操作生效小節的 MusicEvent 相同；不保證不同裝置上的音訊位元相同。

## 最小排程與生命週期

開始時預先準備小節 0、1、2。100ms 的控制執行緒 timer 補至目前小節後兩小節；它不是音樂時鐘。Tone Transport 是唯一播放時間基準，使用 musical ticks 排程。Audio callback 只套用凍結 flags 與呼叫 voice.play，不作曲或載入。

生成結果一旦提交即不可變。播放中的加入／移除／Mute／Solo 記錄 `requestedAtBar` 與 `effectiveAtBar`，在第一個未規劃小節套用。UI 顯示 pending，該件在生效前停用下一次操作。UI／清理工作在音訊邊界透過 Tone Draw 更新。Host 使用場次 epoch 與獨立 voiceRequest，過期的非同步載入只能釋放自己的 voice，不能覆蓋新場次。

Start 需使用者手勢解鎖 AudioContext。Stop 取消本引擎的 callbacks、關閉 gain、release 並 dispose track voices；下次 Start 重建 voices/state，從第一小節重播同一 Seed。此 M0 Stop 是明確停止，尚無 M1 的自然尾音／跨界淡出策略。

M0 不接受非零 microOffset。所有事件驗證 step、排序、音長、MIDI、力度。單一生成失敗會標示該件錯誤並停止該件；其他件可繼續。

## ADR-001：在契約補充和弦 pitch classes

理由：避免各 Plugin 依賴 Tonal 或自行解析 Director 的 chord 字串。`BarPlan.chordPitchClasses` 是一般音樂資料，保持聲部獨立。這是 M0 首次建立契約，無既有相容性負擔。

## ADR-002：由音訊服務提供通用發聲原語

Plugin voice 擁有自己的合成器 envelope／音色與 sample mapping，注入的 AudioServices 負責 track routing 與 Tone 節點資源。Percussion 工廠依 Plugin 提供的聲音定義建構通用原語，不依賴樂器 ID。SampleBank 可切換 pitched Sampler 或 percussion Players；實際資產與授權仍屬該 Plugin。

## 限制與延後項目

- 尚無真實 samples、motif memory、長程段落、進階互相避讓或 LLM 網路服務。
- 尚未宣稱背景分頁節流、行動裝置或長時間播放可靠性；M1 應處理排程落後／恢復及尾音。
- OperationLog 僅保留本次 Host 內的控制記錄；未提供 M3 匯出／完整 replay UI。
- 沒有 service worker；執行時無後端與外部請求，首次載入仍需取得本地伺服器或靜態部署資產。
- 共用 React／Tone.js 主 chunk 約 528 kB（gzip 約 145 kB），目前保留 Vite 的大小警告；各 Plugin 與 voice 已分開 lazy chunks。
- 部分 Tonal 套件的 CommonJS main 指向未提供的檔案；Vitest 設定經 Vite inline 並優先解析 ESM module，未修改 node_modules。

參考：[Vite glob import](https://vite.dev/guide/features.html#glob-import)、[Tone Sampler](https://tonejs.github.io/docs/15.1.22/classes/Sampler.html)。實作以 lockfile 安裝的型別為準。
