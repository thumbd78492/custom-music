# 給 Coding Agent 的開始 Prompt（只執行 M0）

你是一位擅長 TypeScript、Web Audio、插件式系統與程序式音樂的資深軟體工程師。請在這個 repository 中開始建立「Generative Ensemble」互動式即興樂團 Web App。

**先完整閱讀 repository 根目錄的 `plan.md`。該文件是需求與架構的最高優先級依據。這一次只完成 M0，不要提前開發 M1–M5。** 如果專案目前是空的，直接初始化 Vite + React + TypeScript，不要等我逐項批准。

## 最重要的硬性約束

1. 第一版固定四種樂器：**Piano、Violin、Drums、Electric Bass**；每個樂器都必須有完全獨立的 plugin 目錄，包含自己的 `manifest`、`generator`、`voice`、測試、音色映射／素材。
2. 主程式必須輕量。Host 只能依共用 `InstrumentPlugin` 契約管理 plugin、時計、編排與 UI；**不能寫任何特定樂器的 if/switch 或靜態 import**。
3. **禁止一個樂器 import 或調用另一個樂器。** 修改／測試任何樂器只需要 Host、contracts、該樂器本身及其素材；即使另外三種樂器目錄不存在也能運作。
4. 四種樂器可獨奏也可合奏，共用 MusicDirector 的節拍、調性與和弦。禁止只有鼓手在場才有節拍、只有鋼琴在場才有和弦。
5. 生成器輸出結構化 `MusicEvent[]`，音訊 adapter 才觸發 Tone.js。不能把整段完整歌曲的音檔循環播放當成生成式音樂。
6. 所有隨機值以 Seeded PRNG 生成；同一輸入應重現同一事件序列，不能直接使用 `Math.random()` 作演奏決策。
7. 使用 `import.meta.glob` 的 lazy loading 實現 plugin 發現；由 manifest 自動產生控制 UI，不能將新增樂器寫死在 App 中。
8. **未來 LLM 創意指令要保留 port 與型別**：`CreativeIntent` → 驗證／安全小節套用 → MusicDirector。M0 僅作 local/rule-based adapter 和 `docs/LLM_FUTURE.md`，不要接真實 LLM、API key、後端。

## 這次 M0 要完成的可執行成果

- 初始化能 `npm install`、`npm run dev`、`npm run typecheck`、`npm run test`、`npm run build` 的專案。
- 建立 `contracts/`、`core/`、`audio/`、`app/`，且 Host 可在 0／1／4 個 plugins 下啟動。
- 實作最小版本的 InstrumentPlugin 合約：`manifest`、`createInitialState`、`proposeBar`、`generateBar`、`createVoice`，以及 `MusicEvent`、`BarPlan`、`InstrumentIntent`、`EnsembleIntent`。
- 提供簡單的共同 4/4、88 BPM、C Major、Cmaj7 → Am7 → Dm7 → G7 小節計畫；四種樂器各自可以輸出最簡單且有音樂性的不同事件，不是所有樂器共用同一個 generator。
- 實作 Tone.js Transport 與最小 Mixer；瀏覽器點擊 Start 才啟動音訊。音樂生成提前準備，音訊 callback 只排程，不能做大量計算。
- 做最小 UI：Start/Stop、Seed、四種插件卡片、加入／移除、Mute/Solo、已載入狀態。加上 `?instrument=violin` 類的單樂器工作台，確認只載入指定插件。
- 提供可聽見聲音的四個聲部。音源若無法取得明確授權且合理大小的真實 sample，**先做清楚標記的合成音 placeholder**，並把尚未完成的真實音色列為 M1，絕不假裝已完成。
- 用 Vitest 實作：每個插件單獨載入與生成、禁止跨插件依賴、相同 Seed 可重現、合法 MusicEvent、零插件不崩潰；記錄瀏覽器手動音訊測試方式。
- 產生 `docs/ARCHITECTURE.md`、`docs/SAMPLE_LICENSES.md`、`docs/LLM_FUTURE.md` 和可用的 `README.md`。

## 執行方式

1. 先檢查 repository，簡述準備建立的模組邊界與 M0 工作拆解；然後**直接實作，不要只給規劃**。
2. 優先完成一個端到端 vertical slice（例如 Host + Piano），驗證共用契約，再依相同介面建立 Violin、Drums、Bass。第二個樂器開始就不得修改 Host 的具名樂器邏輯。
3. 讓 `InstrumentLab` 真的能以 Host + 一種 Plugin 運作；做隔離測試，不可以只檢查模組有 export。
4. 適時執行 typecheck、test、build，遇到錯誤修復。不要把沒跑過的測試描述成通過。
5. 完成後回報：已做事項、檔案／模組樹、實際測試命令與結果、實際使用的音色或 placeholder、未完成事項、下一個 milestone 的建議步驟。

**重要：程式架構的簡單與獨立性優先於 UI、美術或進階音樂變奏。不要在這次擴充功能至 M1–M5。**
