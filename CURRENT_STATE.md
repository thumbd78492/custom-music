# 開發狀態

日期：2026-10-08。M0 可運行版本與工程驗證完成；人工音樂品質關卡尚未完成。未進入 M1–M5。

## 已實作

- TypeScript strict、React、Vite、Tone.js；npm lockfile 固定依賴，無後端、外部 AI SDK 或 API key。
- 共用 InstrumentPlugin／MusicEvent／BarPlan／意圖／sample 契約；CreativeDirectorPort、CreativeIntent 與未接線的離線 adapter。
- Host、Director、基本兩階段 Coordinator／BarPlanner、Seeded PRNG、共用 Transport、Mixer、音訊 factories。
- Piano 端到端流程先通過，再依同契約加入 Violin、Drums、Electric Bass；四件各自有 generator、voice、manifest、samples、tests。
- UI Start／Stop、加入／移除、Mute／Solo、Seed、pending／loading／error；只載入單件的 InstrumentLab。
- 首三小節預先生成，持續補至兩小節之後；控制在第一個未規劃小節生效。停止取消 callback 並 dispose voices。六個非同步生命週期回歸案例。
- 四件均為明確標記的 synth placeholder；未下載或散布外部 sample。

## 已執行驗證

系統 `npm` 捷徑指向不存在的 roaming npm-cli，故使用同一台電腦既有的 npm CLI 完整路徑呼叫 package scripts：

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run typecheck
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run build
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:isolation
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run test:e2e
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run lint
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run format:check
```

| 檢查                   | 結果                              |
| ---------------------- | --------------------------------- |
| TypeScript Typecheck   | 通過                              |
| Vitest                 | 11 檔、70 項通過                  |
| Production Build       | 通過，輸出 dist                   |
| Piano 實體隔離         | Typecheck + 46 tests + build 通過 |
| Violin 實體隔離        | Typecheck + 47 tests + build 通過 |
| Drums 實體隔離         | Typecheck + 47 tests + build 通過 |
| Electric Bass 實體隔離 | Typecheck + 47 tests + build 通過 |
| Edge 瀏覽器 E2E        | 6 項通過                          |
| ESLint                 | 通過                              |
| Prettier               | 通過                              |

最新隔離證據：`.isolation/2026-10-08T13-58-58-622Z/results.json`；其中各 fixture 的 `src/instruments` 確認只包含自身 Plugin，沒有移動或刪除原始碼。

瀏覽器測試逐件驗證 Lab 只有一張卡、加入前未載入 implementation、請求中沒有其他 Plugin、非零 Web Audio 輸出、小節前進、Stop 後歸零、重新 Start 發聲。另驗證四件合奏、Mute／Solo／移除的小節邊界，以及空 Host 啟動後加入樂器。透過 analyser 量測真實瀏覽器音訊；未宣稱人工耳聽品質。

已檢視 `test-results/ensemble-m0.png` 的 UI 截圖：控制、placeholder 標記與四件卡片可見。每件 Lab 截圖同在 test-results。

## 未完成與限制

- 真實 Piano／Violin／Drums／Electric Bass samples 與逐檔授權尚未導入。
- `plan.md` 的四個 Seed 各 10 分鐘人工聆聽未執行；音樂性、長音自然度與長時間疲勞感尚未驗收。
- 尚未驗證行動裝置、背景分頁節流或長時間運行；Stop 為明確停止，未實作尾音淡出。
- Vite 共用主 chunk 約 528 kB（gzip 約 145 kB），有非阻擋大小警告；Plugin／voice 已獨立 lazy chunks。
- Tonal ESM 解析 workaround 已記錄於架構文件；全域 npm 捷徑損壞保留原狀。

## M1 建議工作

1. 挑選小體積真實 samples，逐檔確認來源、再散布授權、原始／輸出檔名與 hash，填寫音色授權紀錄。
2. 驗證每件 sample 載入／失敗／取消與 release／dispose，尤其 Violin 持續音與換音。
3. 測試安全小節操作、背景節流後恢復、排程落後與尾音策略，完成長時間聆聽紀錄。

本輪到此停止；尚未實作以上 M1 工作。
