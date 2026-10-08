# M1 架構

M1 在 M0 的 Plugin 邊界、音樂生成與共同時鐘上，加入真實錄音取樣及音訊生命週期處理。沒有修改 M0 作曲演算法，也沒有提前實作 M2–M5。[CURRENT_STATE](../CURRENT_STATE.md) 記錄各項實作及測試結果；[四個 Seed 各 10 分鐘人工聆聽](M1_LISTENING.md) 仍為 Pending，因此 M1 尚未正式驗收完成。

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
AudioServices -> generic SampleVoice -> native buffer source / gain
```

`contracts/` 不依賴 React、DOM、Tone.js。`AudioEnginePort` 讓 Host 測試可使用 fake audio；Host 只在型別層引用它。實際音訊層只消費已完成的 `MusicEvent`。

每個 Plugin 對外入口為 `index.ts`，metadata 為 `manifest.ts`。它自己擁有 samples、mapping、voice 入口、包絡／單音換音設定及生成器 state；不能 import 其他 Plugin。Host、Director、Coordinator、Scheduler 不 import 具名樂器，不解讀音域策略或 sampleKey。通用 PRNG 是唯一允許 generator 使用的 core utility。

修改一件樂器只需要理解該件模組、共用 contracts 及注入的 AudioServices。新增樂器不需要為 Host 增加 if／switch 或資產清單。

## 發現與載入

兩份 `import.meta.glob` 都使用預設 lazy。完整 App 只載入各個 manifest，點擊「加入」才載入 index、generator、voice 與該 Plugin 的 sample mapping，並由該 voice 請求自己的音檔。加入前沒有該件 sample 的 HTTP 請求。Lab 依 `?instrument=<directory-id>` 先過濾路徑，只讀該件的 manifest 與入口；未知 ID 顯示錯誤。

Plugin 以 module-relative URL 指定本地 `.wav`／`.flac`，production build 輸出獨立音訊資產；不把完整原始音源庫包入網站。下載來源保存在 Git 忽略的 `.sample-sources/`。授權、人類可讀的來源說明與逐檔 hash 分別記錄於 [SAMPLE_LICENSES](SAMPLE_LICENSES.md) 和 [sample-provenance.json](sample-provenance.json)。

建置工具仍會掃描所有現存目錄。runtime lazy load 不等於建置時忽略其他目錄。`npm run test:isolation` 會建立只含一件 Plugin 的實體 fixture，分別 typecheck、Vitest、build，補足缺席情境的證據。

新增第五件：加入 `src/instruments/<id>/`，實作相同結構與契約，manifest.id 必須等於目錄名稱，新增自己的測試、素材與授權紀錄。無需修改 Host、Director、音訊排程器或 UI。controls 仍為空，未實作 M4 的專屬參數面板。

## 音樂生成

MusicDirector 維持 M0 的 BPM、調性與和弦來源：4/4、88 BPM、C Major、Cmaj7 → Am7 → Dm7 → G7。Tonal 僅由 Director 使用；計算好的 pitch classes 放進 BarPlan，各 Plugin 自行選擇音域、音長與音量。

每小節先讓所有 active Plugin `proposeBar`，按 ID 穩定排序聚合匿名 `EnsembleIntent`，再逐件 `generateBar`。Mute／Solo 只改混音，仍推進所有 active Plugin 的 state。Plugin state 藉 closure 封裝，Host 不可讀寫；各次呼叫取得 JSON snapshot，只有 nextState 被提交。

Seed 使用 `JSON.stringify([rootSeed, barIndex, pluginId, purpose])`、FNV-1a 與 Mulberry32。Director、Coordinator、PRNG、四件 generator、MusicEvent 與原有創意接口保持不變。固定 M0 事件資料用來檢查更換音色沒有改變相同輸入的 MusicEvent。

保證相同引擎版本、輸入、state、操作生效小節的 MusicEvent 相同；載入順序不影響事件，不保證不同裝置上的音訊位元相同。LLM port 與離線 adapter 仍未接線；詳見 [LLM_FUTURE](LLM_FUTURE.md)。

## 取樣聲部與資源

`SampleBank` 以可選欄位描述 MIDI root、力度區域、微調音高、持續音 loop、attack／release、音量、polyphony 與單音換音長度。具體數值全部由 Plugin 提供。AudioServices 只將該件路由到自己的 mixer gain，使用與 Transport 相同的 AudioContext 建立通用 SampleVoice。

每次起音使用獨立 AudioBufferSourceNode 和 GainNode；和弦可以多音同時發聲，連續鼓擊不會改變前一擊的力度。原生 audio-time automation 控制 attack、note-off、release 及 source.stop；`onended` 斷開 source／gain，dispose 清除 buffers 的引用。換音／停止修改既有 ramp 時使用 `cancelAndHoldAtTime` 保留連續性。正常尾音由該 Plugin 的 sample 與包絡共同決定；不以 React render 或 JavaScript timer 觸發音符。

每次載入持有 AbortController。任一 HTTP、解碼或 metadata 驗證失敗，整件 voice 都不安裝，錯誤呈現在該件 UI，其他聲部保留。取消、Stop、失敗與 20 秒 timeout 中止同批請求；decode 本身不能中止，完成後若已取消便丟棄結果。沒有部分成功或 synth fallback；原合成工廠僅為 contracts 相容性保留。

真實錄音的精簡策略也有限制：Piano 子集最多保留來源前 8 秒，裁切處淡出，未保留完整長衰減；Violin 由持續弓奏錄音製作 loop，以包絡及交疊淡出換音，未使用錄製的 legato transition 或原始收弓尾音。這些取捨的音質仍須人工聆聽，波形／非零輸出測試不能代替。

## 排程與非同步生命週期

開始時預先準備小節 0、1、2。100 ms 的控制執行緒 timer 補至目前小節後兩小節；它不是音樂時鐘。Tone Transport 是唯一播放時間基準，使用 musical ticks 排程。Audio callback 只套用凍結 flags 與呼叫 voice.play，不作曲或載入。

生成結果一旦提交即不可變。播放中的加入／移除／Mute／Solo 記錄 `requestedAtBar` 與 `effectiveAtBar`；前者讀取 audio bar，後者不早於第一個未規劃小節及目前 audio bar 的下一小節。UI 顯示 pending，該件在生效前停用下一次操作。

Host 使用 request、voiceRequest 與場次 epoch 辨識非同步擁有權。取消載入會立即解除 loading，允許重試；dynamic import 無法中止，但過期結果不能安裝 voice、清除新 loading 或移除新 Track。排程 callbacks 捕捉 Track 實例，因此舊 callback 不會對相同 ID 的新 Track 發聲。

Start 需使用者手勢解鎖 AudioContext。Stop 取消本引擎 callbacks，立即中止未完成載入並以 30 ms mixer ramp 淡出。Remove 到達安全小節後使用相同清理機制。Track 立即離開活躍 map，50 ms 後的清理 closure 只釋放原 Track 的 voice、services 與 gain；同 ID 重新加入不受影響。下次 Start 重建 voices／state，從第一小節重播同一 Seed。

UI／生命週期通知使用檢查 audio deadline 的 timer，停止時取消；不依賴 Tone.Draw／requestAnimationFrame。資源清理 timer 使用牆鐘，AudioContext 暫停時輸出本來已無聲；背景節流可能延後記憶體釋放，但不會重新開啟輸出。

## 背景分頁與排程落後

Transport callback 若已落後於 AudioContext，略過該音符，不補奏過期 attacks。Host 每次 refill 最多處理 32 個小節；缺少的生成器 state 仍逐小節推進，但過期及目前小節不再提交音訊。追上後從未來小節恢復，保持原 Seed 與 state 演進。追趕過程會同步清除已生效 pending、處理移除，延遲通知不能把 UI 小節倒退。

因此極長停頓可能產生安靜的恢復區間，無法保證作業系統凍結分頁時仍連續出聲。AudioContext 暫停時音訊時間停止；恢復後繼續使用同一時間基準。已用有視窗的原生 Edge、獨立 profile 及 CDP `noDefaults: true` 驗證真實分頁隱藏／恢復，避免 Playwright 預設 focus emulation 及停用背景節流的旗標遮蔽問題。單次受控停頓、suspend／resume 與約 10 秒背景切換的證據，不代表所有裝置、省電政策或長時間人工音質已驗收。

本階段仍不接受非零 microOffset，未加入 M2 的人性化作曲。所有事件繼續驗證 step、排序、音長、MIDI、力度。單一生成失敗標示該件錯誤並停用該件；其他件可繼續。

## ADR-001：在契約補充和弦 pitch classes

理由：避免各 Plugin 依賴 Tonal 或自行解析 Director 的 chord 字串。`BarPlan.chordPitchClasses` 是一般音樂資料，保持聲部獨立。這是 M0 首次建立契約，無既有相容性負擔。

## ADR-002：由音訊服務提供通用發聲原語

M0 建立 track-scoped AudioServices，Plugin 擁有 envelope／音色與 mapping，服務擁有 routing／資源。M1 延續此邊界，取樣播放由下列 ADR 擴充，原先合成工廠僅供契約相容性保留。

## M1 決策記錄

- [ADR-003：可取消的通用錄音取樣播放器](adr-m1-samples.md)：SampleBank 的可選擴充、原生 buffer 播放及失敗／取消規則。
- [M1 排程與生命週期 ADR](adr-m1-engine.md)：bounded catch-up、過期音符、非同步 ownership、淡出與清理策略。AudioEnginePort 與 InstrumentPlugin 的既有方法保持相容。

## 驗證與延後項目

`npm run verify:m1` 依序執行全部工程檢查，將 log、`results.json` 及瀏覽器證據保存到 `.verification/<timestamp>/`。`npm run verify:samples` 另外核對 provenance 所列授權文字／音檔 hash、格式標頭及大小；不代替授權來源審核。完整結果見 [CURRENT_STATE](../CURRENT_STATE.md)，不以待執行的檢查推定通過。

- 四個 Seed 各 10 分鐘人工聆聽仍為 Pending；音色自然度、Click／Pop、loop 可聞度與長時間疲勞感須填入 [聆聽紀錄](M1_LISTENING.md)。未完成前不正式結案 M1 或開始 M2。
- 未加入 motif memory、長程段落、進階互相避讓、多曲風或 LLM 網路服務。行動裝置與不同瀏覽器的完整驗收仍待後續。
- OperationLog 僅保留本次 Host 內的控制記錄；未提供 M3 匯出／完整 replay UI。
- 沒有 service worker、後端或遠端模型服務。資產由本地伺服器或靜態部署提供；首次載入仍需取得頁面、模組與所選音檔。
- 共用 React／Tone.js 主 chunk 在 M0 約 528 kB（gzip 約 145 kB）；保留 Vite 非阻擋大小警告，未因此大幅重構。各 Plugin／voice 仍為 lazy chunks，音檔為獨立資產；實際大小以 build log 為準。
- 部分 Tonal 套件的 CommonJS main 指向未提供的檔案；Vitest 設定經 Vite inline 並優先解析 ESM module，未修改 node_modules。

實作以 lockfile 安裝的型別與本地原始碼為準；取樣 source 使用同一 AudioContext，沒有第二套演奏時鐘。
