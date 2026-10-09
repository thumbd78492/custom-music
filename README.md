# Generative Ensemble · M3-A1

TypeScript + React + Vite + Tone.js 的生成式樂團。Piano、Violin、Drums、Electric Bass
是四個完全獨立的 Plugin，由同一 Transport 與 MusicDirector 共享速度、和聲及段落。
M2 收尾增補有五張文字角色卡：旋律鋼琴、伴奏鋼琴、旋律小提琴、貝斯、鼓。
兩位鋼琴手共用 Piano Plugin／素材，各有私有生成器 state、主題、voice／音軌及載入生命週期。
每位可獨立加入／移除、音量、Mute／Solo；旋律鋼琴與小提琴按樂句輪替領句與回應。
音樂版本 m3.a1；[角色與分工 ADR](docs/adr-m2-role-instances.md) 與
[Groove／時序 ADR](docs/adr-m3-groove-timeline.md)。

M3-A1 新增 Straight、Light Swing、Half-time，播放中可連續操作 Groove 選單。
請求立即接受，畫面顯示目前／pending 律動、提交狀態與生效小節／tick；不停止播放，
不重設 Seed／主題／角色。未提交請求 latest-wins，完整保留 superseded 收據。
Half-time 改拍型與呼吸，維持同 BPM；Swing 同時映射起音與止音。
鼓／Bass／伴奏鋼琴各自保存專用節奏型，主奏只有限節奏適配。

M2 依 Seed 選擇 80–105 BPM、大／小調與功能和聲，在 8–16 小節段落間演化速度、
轉調與能量。Violin 記住 2–4 小節旋律主題；四件透過匿名 EnsembleIntent 協調音域、
密度與重音。三種變化模式 Subtle／Balanced／Experimental，預設 Balanced。
M1 真實 Samples 與生命週期保留，Bass gain -12 dB、Violin **-9 dB**。
M2 小提琴保留 0.2.2 固定 Loud 層、校準音頭與弓段連奏，本輪只調整樂句任務與留白；
[同 Seed -8／-9／-10 A/B 與人工複聽紀錄](docs/M2_VIOLIN_REVIEW.md) 仍待人工音質驗收。

**工程驗證不代表音樂品質驗收。10 分鐘人工聆聽仍 Pending**，見
[M2 聆聽表](docs/M2_LISTENING.md) 與 [最新實作／測試證據](CURRENT_STATE.md)。
沒有 LLM API、後端或金鑰。

[M2 收尾短稿與五角色 stems](docs/M2_DUAL_LEAD_REVIEW.md) 已提供，人工驗收 Pending。
下一交付為 M3-A2 **播放中曲風轉場**，沿用控制 timeline，不延後到 M5。
M3-B 主題發展／長時間即興、M3-C Session 重播／匯出、M4 UI／品質與 M5 LLM 保留。
A1 不代表多曲風完成；短稿與工程證據見 [M3_HANDOFF](docs/M3_HANDOFF.md)。
目前停在 A1 可執行子交付點：183 Vitest 與42 E2E通過，原生 Edge 背景案例在
播放前仍 hidden，1項失敗，整體工程驗收未全過；人工品質 Pending。

## 啟動

Node.js 22.14+（或相容的較新 LTS），安裝 npm。

```sh
npm ci
npm run dev
```

開啟終端顯示的本地網址，點「加入」才載入該 Plugin 與其取樣，再按 Start 解鎖瀏覽器音訊。加入前不發出該件音檔的 HTTP 請求。載入中可取消或按 Stop；失敗會顯示錯誤，可重新加入重試，沒有合成音 fallback，也不把部分音檔載入當成成功。

播放中可加入／移除、Mute／Solo；待生效小節位於已準備區段之後，操作生效前該件會顯示 pending。Solo 為多選；Muted 的 Solo 聲部仍維持靜音。Stop 使用短淡出，取消排程及載入並釋放聲部資源；再次 Start 會重新準備聲部，從相同 Seed 的第一小節開始。事件可重現，聲音不保證跨瀏覽器 bit-perfect。沒有選擇樂器也可啟動共同時鐘。

背景恢復時跳過已錯過的起音，按原順序推進生成器 state，從未來小節接回共同拍點。極長停頓可能先有一段安靜的追趕時間；不會一次補奏過期音符。音樂時鐘始終由 Audio Engine 管理。

單件工作台：`/?instrument=piano`、`/?instrument=violin`、`/?instrument=drums`、`/?instrument=bass`。Lab 只探索及載入指定 Plugin，不載入其餘三件。
Piano Lab 同時顯示旋律／伴奏兩位角色，可加入其中一位或同時測兩位。

## 真實音色與素材

每件 Plugin 自己擁有 samples、音高／力度 mapping、演奏參數與 voice 入口。共用播放器僅提供原生 Web Audio buffer、逐音 gain 與資源管理；Host／Director／Scheduler 不認識樂器名稱。

授權與來源見 [SAMPLE_LICENSES](docs/SAMPLE_LICENSES.md)，逐檔原始／輸出 SHA-256、來源版本、轉換命令及處理限制見 [sample-provenance.json](docs/sample-provenance.json)。完整下載來源保存在被 Git 忽略的 `.sample-sources/`；網站只使用 Plugin 目錄內的精簡素材。Production build 將使用中的 `.wav`／`.flac` 音檔輸出為獨立資產，加入該件時才以 HTTP 取得及解碼。

Piano 使用兩層力度的 Kawai 錄音；Web 子集保留每個來源前最多 8 秒，裁切時加上末端淡出，沒有保留完整原始長衰減。Violin 由私有演奏策略決定連奏／換弓，連奏跳過錄音音頭、平滑交叉淡化，同音延續既有 Source；0.2.2 固定使用校準 Loud 單層，原 velocity 控制樂句表情。這不是另行錄製的 legato transition。鋼琴尾音自然度、小提琴 Vibrato、力度混合與連奏品質仍須人工聆聽。

## 驗證

```sh
npm run verify:m2
```

此命令依序執行 Typecheck、Vitest、Production Build、素材完整性、四件實體隔離、瀏覽器 E2E、ESLint 與 Prettier。記錄放在 `.verification/<timestamp>/`，包含逐項 log、`results.json` 與瀏覽器證據；遇到失敗即停止，未執行項目不能視為通過。人工聆聽狀態仍記為 Pending。

也可單獨執行：

```sh
npm run typecheck
npm run test
npm run build
npm run verify:samples
npm run test:isolation
npm run test:e2e
npm run lint
npm run format:check
```

`verify:samples` 核對 provenance 所列檔案的授權文字 hash、音檔 SHA-256、格式標頭及大小；這是素材完整性檢查，不代替來源授權審核或人工音質驗收。Vitest 保留生命週期、依賴與隔離測試，並驗證 M2 三模式、四個 Seed 各 280 小節、全部樂器子集合、tempo／和聲／主題與協作。M3-A1 追加控制／起止映射／故障 Solo／三種 Groove 的角色組合回歸；M0 事件 golden 與原測試保留為歷史資料，不要求新引擎產生 M0 事件。

E2E 預設使用已安裝的 Microsoft Edge。若環境沒有 Edge，先安裝 Playwright 支援的瀏覽器，並調整 `playwright.config.ts` 的 channel。測試使用 Web Audio analyser、原生 source 追蹤與離線渲染，檢查實際輸出、取樣請求、失敗隔離、釋放、停止、重啟及受控停頓後恢復；自動化量測不等於人工耳聽。

實際背景分頁案例在 Windows 短暫開啟有視窗的 Edge，使用獨立測試 profile 並透過 CDP `noDefaults: true` 連接，保留正常背景政策後切換分頁；其他案例維持 headless。此案例需要已安裝的 Edge 與可用桌面，未模擬作業系統睡眠或長時間省電模式。

`test:isolation` 將共用原始碼與單件 Plugin 複製到 `.isolation/<run>/<id>`，逐件 typecheck、Vitest、production build；fixture 中不存在另外三件。原始碼不被移動或刪除。最新測試數量、結果與證據路徑見 [開發狀態](CURRENT_STATE.md)。

共用主 chunk 在 M0 約 528 kB，其 Vite 大小警告不是本階段阻擋項目；M1 未因此大幅重構。實際 build 大小與告警以驗證 log 為準。

若本機 `npm` 捷徑損壞，可改以既有 npm 安裝的完整 `npm-cli.js` 路徑執行。本次 Windows 環境使用 `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`；未改動全域 Node/npm 安裝。

## 更新與交付

每次完成專案更新（包含程式、測試與文件）並完成相應驗證後，直接 commit 並 push 到目前工作分支的 GitHub 遠端，不需再次詢問確認。提交僅包含本次工作相關變更，保留其他未相關的修改。

推送後核對遠端分支與本機 commit 一致，才回報已推送；若推送失敗，明確記錄原因與尚未推送的狀態。GitHub 推送與工程驗證不代表人工音質驗收通過。

## 原始碼

```text
src/app/          通用 React UI、lazy Plugin Loader、InstrumentLab
src/contracts/    音樂、Plugin、sample 與未來創意指令契約
src/core/         Host、Director、兩階段 BarPlanner、PRNG
src/audio/        AudioEngine、ToneClock、MasterMixer、SampleVoice、注入式服務
src/instruments/  各 Plugin 的 generator、voice、manifest、samples、tests
tests/            core／isolation／reproducibility／E2E
docs/             架構、ADR、授權、provenance、人工驗收與未來 LLM 接口
```

新增 Plugin 不需修改核心或 UI，見 [架構文件](docs/ARCHITECTURE.md)。M1 的通用擴充已記錄於 [取樣播放器 ADR](docs/adr-m1-samples.md) 及 [排程與生命週期 ADR](docs/adr-m1-engine.md)。[LLM 接口](docs/LLM_FUTURE.md) 仍只保留未來擴充契約，本階段無 LLM API、模型 SDK 或金鑰。

## 人工聆聽關卡

依 [M2_LISTENING](docs/M2_LISTENING.md) 連續聽完整合奏，另測獨奏、Mute／Solo、
Stop／Release 與背景恢復。四個 Seed 各 10 分鐘仍待人工填表。瀏覽器測試會輸出
`alpha` 的完整 10 分鐘 WAV 與段落／事件計畫到 `.verification/listening-*/`，供複聽。
WAV 使用真實 Samples、原 voice 包絡、Master 0.65，未 Normalize，未經 limiter；
它是離線試聽稿，不是即時 Transport 錄音，也不代替真人驗收。
