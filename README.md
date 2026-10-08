# Generative Ensemble · M0

TypeScript + React + Vite + Tone.js 的最小程序式樂團。四個獨立 Plugin：Piano、Violin、Drums、Electric Bass。每件可獨奏或共同演奏，由同一個 MusicDirector 提供 4/4、88 BPM、C Major 與 Cmaj7 → Am7 → Dm7 → G7。

**所有音色均為 synth placeholder，尚未使用真實樂器取樣。** 本輪範圍僅 M0，不含 M1–M5。

## 啟動

Node.js 22.14+（或相容的較新 LTS），安裝 npm。

```sh
npm ci
npm run dev
```

開啟終端顯示的本地網址，點「加入」載入 Plugin，再按 Start 解鎖瀏覽器音訊。可在播放中加入／移除、Mute／Solo；顯示的待生效小節是已準備區段之後的第一個小節。Solo 為多選；Muted 的 Solo 聲部仍維持靜音。

Stop 後可改 Seed；再次 Start 從該 Seed 的第一小節重新生成。事件可重現，聲音不保證跨瀏覽器 bit-perfect。沒有選擇樂器也可啟動共同時鐘。

單件工作台：`/?instrument=piano`、`/?instrument=violin`、`/?instrument=drums`、`/?instrument=bass`。Lab 只探索及載入指定 Plugin，不載入其餘三件。

## 驗證

```sh
npm run typecheck
npm run test
npm run build
npm run test:isolation
npm run test:e2e
npm run lint
npm run format:check
```

E2E 預設使用已安裝的 Microsoft Edge。若環境沒有 Edge，先安裝 Playwright 支援的瀏覽器，並調整 `playwright.config.ts` 的 channel。測試用 Web Audio analyser 驗證真實瀏覽器輸出非零及 Stop 後歸零；不等於人工音質驗收。

`test:isolation` 將共用原始碼與單件 Plugin 複製到 `.isolation/<run>/<id>`，逐件 typecheck、Vitest、production build；fixture 中不存在另外三件。原始碼不被移動或刪除。

本輪結果：Typecheck、70 項 Vitest、Production Build、四件實體隔離（Piano 46、其餘各 47 項）、6 項瀏覽器 E2E 與 ESLint 通過。Build 有共用主 chunk 約 528 kB 的非阻擋大小警告。詳細限制與驗證證據見 [開發狀態](CURRENT_STATE.md)。

若本機 `npm` 捷徑損壞，可改以既有 npm 安裝的完整 `npm-cli.js` 路徑執行。本次 Windows 環境使用 `node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run <script>`；未改動全域 Node/npm 安裝。

## 原始碼

```text
src/app/          通用 React UI、lazy Plugin Loader、InstrumentLab
src/contracts/    音樂、Plugin、sample 與未來創意指令契約
src/core/         Host、Director、兩階段 BarPlanner、PRNG
src/audio/        AudioEngine、ToneClock、MasterMixer、注入式音訊工廠
src/instruments/  各 Plugin 的 generator、voice、manifest、samples、tests
tests/            core／isolation／reproducibility／E2E
docs/             架構、授權與未來 LLM 接口
```

新增 Plugin 不需修改核心或 UI，見 [架構文件](docs/ARCHITECTURE.md)。[音色授權紀錄](docs/SAMPLE_LICENSES.md)、[LLM 接口](docs/LLM_FUTURE.md) 與 [開發狀態](CURRENT_STATE.md) 列出限制及後續工作。

## 人工聆聽程序

分別在四個 Lab 與合奏中 Start；檢查持續發聲、共同和弦及節拍、Mute/Solo、移除／重新加入、Stop／重啟。四個 Seed 各聽 10 分鐘，記錄突兀和聲、無意義重複、節奏與長音尾端問題。此長時間人工關卡尚未完成，不能以自動化通過代替。
