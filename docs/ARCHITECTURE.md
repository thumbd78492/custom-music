# M2 架構（m2.2：角色實例與雙主奏）

2026-10-09 收尾增補；[實作前 ADR／相容性](adr-m2-role-instances.md)。
M3–M5 保留，本輪停在 M2，人工品質仍 Pending。

## 收尾增補後的模組與契約

`manifest.id` 為 pluginId，`manifest.characters` 宣告角色。characterId 是角色設定，
instanceId 是穩定舞台位置 `characterId:1`。Host／UI 只展開 metadata：四個 Plugin、
五個角色，沒有具名樂器分支。Piano 的兩位演奏者共用聲音程式與唯讀 sampleBank。
每個位置獨有 session、state／主題／和弦配置／歷史、voice／performance、track gain、
Mute／Solo／volume、request／voiceRequest ownership。音量 0–1，預設 1，於安全小節生效。
Lab 只載入所選 Plugin 的角色，Piano-only 可選一位或同時測兩位。

```text
Host -> CharacterInstances (metadata -> stable identities) -> PluginSession
Director (shared plan) -> BarPlanner -> PhraseCoordinator (tasks only)
BarPlanner -> per-recipient EnsembleCoordinator (OTHER audible occupancy)
Plugin generator -> own events -> AudioEngine -> instance-scoped voice / mixer
```

InstrumentPlugin 的 state／propose／generate 增加可選 InstrumentInstance 上下文。
PluginSession 以 JSON tuple 將三種身分及 Plugin version 納入 rootSeed，再沿用各用途 PRNG。
不以 Date.now、載入順序或 Promise 完成順序產生身分／音樂亂數。相同 m2.2、Seed、模式、
角色配置與操作生效小節可重現完整計畫、分工與事件；不保證跨裝置 PCM bit-perfect。
舊單參數 session 保留歷史上下文；舊 Host add(pluginId) 只解析 metadata default，
正式 UI、排程、音軌及 Operation 均使用 instanceId，收據另明記 pluginId／characterId。

PhraseCoordinator 按角色 tasks、leadWeight、近期 lastLed／lastResponded、可聽 roster 與
共同樂句 Seed 分工，不產生音符。四小節中：首兩小節完整領句，搭檔先休止、再單音支撐；
第三小節短句／回應；末小節共同收句，主奏在 step 14 後休止。下句優先給較久未領句者。
只有一位主奏時每小節可領句；Muted／Solo 隱藏／volume 0／移除者不占名額，在下一個
未提交小節重新分工。Muted 私有 state 仍推進，已提交事件不改寫。

EnsembleIntent.assignment 是自己的 task／stepRange／densityScale／register；其餘聚合
只含 OTHER audible instances，避免自我避讓。leadActivity／音域佔用依其他聲部任務與
時段縮減，pulseAccents 仍為匿名低頻節奏重音。沒有傳送其他 Plugin 的事件或對位系統。

Piano 自有 generator 依角色選 `melody.ts` 或 `accompaniment.ts`。旋律保存兩小節節奏／
音階輪廓，重複、局部變奏、更新／引用及句尾休止，主要單音且有非和弦經過音。
MIDI 62–76，既有根音 60–72，最近根音移調最多 4 semitones；領句力度穩定在 Loud 層，
支撐單音較輕，gain 仍 -8 dB。伴奏保留和弦／琶音與聲部連接；低頻聲部存在時採兩音
rootless 配置，雙主奏時少拍點、上緣 69、不加高音裝飾，單獨仍有完整和聲演奏。
低頻佔用只要大於零便保留低音空間；不能用平均密度門檻判定低頻搭檔是否存在，
否則其他角色或疏鬆段落會稀釋貝斯意圖。移除／Mute／Solo 隱藏後佔用歸零，伴奏可補回根音。

Violin 0.2.2 voice／performance／regions、所有樣本與校準、起播位置、包絡、連奏及
-9 dB 均保持本輪基準 hash；只改 generator 的任務篩選、支撐長音與留白。
素材檔與 Piano sampleBank 不複製；各 voice／buffers／取消獨立，未重做全域音色快取。
CreativeDirectorPort 保留，未來透過 metadata／宣告式偏好影響分工，本輪無 LLM API。

Vite 忽略 `.isolation/`／`.verification/` 監視，避免 fixture 的 tsconfig 觸發播放頁 HMR。
測試收據與短稿見 CURRENT_STATE；新快照不是人工驗收，m2.1 程式／音訊與舊收據保留。

## 前輪 M2 基礎架構紀錄

以下為 m2.1 的共用音訊／時鐘與最初生成架構；角色、協調與版本以上方 m2.2 增補為準。

M2 在 M1 真實 Samples、Plugin 獨立性與音訊生命週期上加入生成式音樂。
2026-10-09 使用者明確授權先調整 M1 混音再實作 M2，並納入主題記憶。
工程證據見 [CURRENT_STATE](../CURRENT_STATE.md)，人工聆聽仍見
[M2_LISTENING](M2_LISTENING.md)，不得以自動化測試代替。

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

MusicDirector 只產生共用音樂上下文。SectionPlan 用 Seed、上段能量與狀態決定
Introduction／Main／Variation／Breakdown／Return 的條件式轉移，並限制連續高能量
段落。長度為 8、12 或 16 小節，4 小節樂句。HarmonyPlan 擁有大／小調功能和聲，
多組進行與近系／關係調候選；轉調最後兩小節採共同和弦 pivot、新調 dominant，
新段落 tonic 落地。BarPlan 的 scale／chord／nextChord pitch classes 由 Director
計算，Plugin 不解析調名、不改 sample tuning 模擬轉調。引擎音樂版本為 m2.1。

初始 BPM 80–105；後續速度只在段落邊界依能量方向小幅變化。Subtle／Balanced／
Experimental 的最大步幅為 2／4／7 BPM，並調整轉調機率、複雜度及主題更新頻率。
預設 Balanced，播放前可在 UI 選擇，播放中設定凍結。CreativeDirectorPort 保留，
Director constructor 可接受一般 CreativeIntent；沒有 LLM adapter 或網路呼叫。

BarPlanner 先收集所有 active Plugin 提案，再聚合匿名 EnsembleIntent。leadActivity
採 max；pitch register load 排除 rhythmic 提案；pulseAccents 是匿名低頻節奏重音。
Mute／Solo 隱藏的聲部仍推進私有 state，但不參與可聽見的意圖聚合。
Coordinator 不知道樂器身份，也不傳送其他 Plugin 的事件。

各 Plugin 自己決定音符：Piano 用三音轉位、鄰近聲部連接、和弦／琶音及留白裝飾，
主奏活躍時限制上緣，低頻聲部存在時避免低音。Violin 私有 Motif 保存 2–4 小節
節奏、相對音階音程與輪廓，依和弦調整強拍，重現／變奏／更新並在 Return 引用原主題；
MIDI 69–84，最短音長 1.8 steps（105 BPM 約 257 ms），不用急促碎音假裝 arco 技巧。
Drums 每樂句選擇 groove，回應主奏密度、樂句尾及段落 fill；Bass 跟隨匿名 pulse，
在低密度時保留兩個錨點，加入五度／八度、切分與通往下一和弦的經過音。

Seed 使用 JSON tuple、FNV-1a、Mulberry32，各用途分流。相同版本、Seed、模式、
Plugin state 與操作生效小節，可重現完整計畫及事件；不保證跨裝置音訊 bit-perfect。
M0 golden 保留為 M1 歷史資料，原測試移到 history，不偽造新 golden 假稱向後事件相容。

## 取樣聲部與資源

`SampleBank` 以可選欄位描述 MIDI root、力度區域、微調音高、持續音 loop、attack／release、音量、polyphony 與單音換音長度。具體數值全部由 Plugin 提供。AudioServices 只將該件路由到自己的 mixer gain，使用與 Transport 相同的 AudioContext 建立通用 SampleVoice。

每次起音使用獨立 AudioBufferSourceNode 和 GainNode；和弦可以多音同時發聲，連續鼓擊不會改變前一擊的力度。原生 audio-time automation 控制 attack、note-off、release 及 source.stop；`onended` 斷開 source／gain，dispose 清除 buffers 的引用。換音／停止修改既有 ramp 時使用 `cancelAndHoldAtTime` 保留連續性。正常尾音由該 Plugin 的 sample 與包絡共同決定；不以 React render 或 JavaScript timer 觸發音符。

每次載入持有 AbortController。任一 HTTP、解碼或 metadata 驗證失敗，整件 voice 都不安裝，錯誤呈現在該件 UI，其他聲部保留。取消、Stop、失敗與 20 秒 timeout 中止同批請求；decode 本身不能中止，完成後若已取消便丟棄結果。沒有部分成功或 synth fallback；原合成工廠僅為 contracts 相容性保留。

真實錄音的精簡策略也有限制：Piano 子集最多保留來源前 8 秒，裁切處淡出，未保留完整長衰減；Violin 由持續弓奏錄音製作 loop，以包絡及交疊淡出換音，未使用錄製的 legato transition 或原始收弓尾音。這些取捨的音質仍須人工聆聽，波形／非零輸出測試不能代替。

## 排程與非同步生命週期

開始時預先準備小節 0、1、2。每次提交先安裝 BPM automation，再提交事件。100 ms 的控制執行緒 timer 補至目前小節後兩小節；它不是音樂時鐘。Tone Transport 是唯一播放時間基準，使用 musical ticks 排程。currentBar 讀取 immediate audio time 的 getTicksAtTime，不使用固定 BPM 除秒數，也不使用帶 lookahead 的 now 定位 UI 操作。未來變速以 TickParam.getDurationOfTicks 積分已提交的 tempo timeline，提前在正確 audio time 安裝 setValueAtTime；小節內 BPM 固定，不作 ramp。音符音長限於當前小節，release 尾音維持 Plugin 的秒數。Audio callback 只套用凍結 flags 與呼叫 voice.play，不作曲或載入。

生成結果一旦提交即不可變。播放中的加入／移除／Mute／Solo 記錄 `requestedAtBar` 與 `effectiveAtBar`；前者讀取 audio bar，後者不早於第一個未規劃小節及目前 audio bar 的下一小節。UI 顯示 pending，該件在生效前停用下一次操作。

Host 使用 request、voiceRequest 與場次 epoch 辨識非同步擁有權。取消載入會立即解除 loading，允許重試；dynamic import 無法中止，但過期結果不能安裝 voice、清除新 loading 或移除新 Track。排程 callbacks 捕捉 Track 實例，因此舊 callback 不會對相同 ID 的新 Track 發聲。

Start 需使用者手勢解鎖 AudioContext。Stop 取消本引擎 callbacks，立即中止未完成載入並以 30 ms mixer ramp 淡出。Remove 到達安全小節後使用相同清理機制。Track 立即離開活躍 map，50 ms 後的清理 closure 只釋放原 Track 的 voice、services 與 gain；同 ID 重新加入不受影響。下次 Start 重建 voices／state，從第一小節重播同一 Seed。

UI／生命週期通知使用檢查 audio deadline 的 timer，停止時取消；不依賴 Tone.Draw／requestAnimationFrame。資源清理 timer 使用牆鐘，AudioContext 暫停時輸出本來已無聲；背景節流可能延後記憶體釋放，但不會重新開啟輸出。

## 背景分頁與排程落後

Transport callback 若已落後於 AudioContext，略過該音符，不補奏過期 attacks。Host 每次 refill 最多處理 32 個小節；缺少的生成器 state 仍逐小節推進，但過期及目前小節不再提交音訊。追上後從未來小節恢復，保持原 Seed 與 state 演進。停頓跨過未提交的變速時不回寫過去 automation；時鐘先維持最後已提交速度，在第一個未來安全小節採用新計畫 BPM。追趕過程會同步清除已生效 pending、處理移除，延遲通知不能把 UI 小節倒退。

因此極長停頓可能產生安靜的恢復區間，無法保證作業系統凍結分頁時仍連續出聲。AudioContext 暫停時音訊時間停止；恢復後繼續使用同一時間基準。已用有視窗的原生 Edge、獨立 profile 及 CDP `noDefaults: true` 驗證真實分頁隱藏／恢復，避免 Playwright 預設 focus emulation 及停用背景節流的旗標遮蔽問題。單次受控停頓、suspend／resume 與約 10 秒背景切換的證據，不代表所有裝置、省電政策或長時間人工音質已驗收。

本階段仍不接受非零 microOffset，表情來自節奏、力度與 Plugin 音長；沒有第二套 humanization timer。所有事件繼續驗證 step、排序、音長、MIDI、力度。單一生成失敗標示該件錯誤並停用該件；其他件可繼續。

## ADR-001：在契約補充和弦 pitch classes

理由：避免各 Plugin 依賴 Tonal 或自行解析 Director 的 chord 字串。`BarPlan.chordPitchClasses` 是一般音樂資料，保持聲部獨立。這是 M0 首次建立契約，無既有相容性負擔。

## ADR-002：由音訊服務提供通用發聲原語

M0 建立 track-scoped AudioServices，Plugin 擁有 envelope／音色與 mapping，服務擁有 routing／資源。M1 延續此邊界，取樣播放由下列 ADR 擴充，原先合成工廠僅供契約相容性保留。

## M1 決策記錄

- [ADR-003：可取消的通用錄音取樣播放器](adr-m1-samples.md)：SampleBank 的可選擴充、原生 buffer 播放及失敗／取消規則。
- [M1 排程與生命週期 ADR](adr-m1-engine.md)：bounded catch-up、過期音符、非同步 ownership、淡出與清理策略。AudioEnginePort 與 InstrumentPlugin 的既有方法保持相容。

## 驗證與延後項目

`npm run verify:m2` 依序執行全部工程檢查，將 log、`results.json` 及瀏覽器證據保存到 `.verification/<timestamp>/`。`npm run verify:samples` 另外核對 provenance 所列授權文字／音檔 hash、格式標頭及大小；不代替授權來源審核。完整結果見 [CURRENT_STATE](../CURRENT_STATE.md)，不以待執行的檢查推定通過。

- 四個 Seed 各 10 分鐘人工聆聽仍為 Pending；音色、loop、合奏平衡與長程生成品質須填入 [M2 聆聽紀錄](M2_LISTENING.md)。本次已有明確 M2 實作授權，尚未宣告人工品質通過。
- 尚無多曲風、LLM 網路服務或完整 replay UI。行動裝置及跨瀏覽器驗收仍待後續。
- OperationLog 僅保留本次 Host 內的控制記錄；未提供 M3 匯出／完整 replay UI。
- 沒有 service worker、後端或遠端模型服務。資產由本地伺服器或靜態部署提供；首次載入仍需取得頁面、模組與所選音檔。
- 共用 React／Tone.js 主 chunk 在 M0 約 528 kB（gzip 約 145 kB）；保留 Vite 非阻擋大小警告，未因此大幅重構。各 Plugin／voice 仍為 lazy chunks，音檔為獨立資產；實際大小以 build log 為準。
- 部分 Tonal 套件的 CommonJS main 指向未提供的檔案；Vitest 設定經 Vite inline 並優先解析 ESM module，未修改 node_modules。

實作以 lockfile 安裝的型別與本地原始碼為準；取樣 source 使用同一 AudioContext，沒有第二套演奏時鐘。

M2 共用契約與時鐘取捨見 [ADR](adr-m2-generative.md)。
