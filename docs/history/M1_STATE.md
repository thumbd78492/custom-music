# M1 歷史狀態（2026-10-08）

以下保留當時記錄；其中相對證據路徑以 repository 根目錄為基準。
最新狀態請讀 [CURRENT_STATE](../../CURRENT_STATE.md)。

# 開發狀態

日期：2026-10-08。M1 工程實作與工程驗證已完成，包含實際背景分頁切換與恢復。
**人工四個 Seed 各 10 分鐘聆聽仍為 Pending；M1 尚未正式完成，不進入 M2。**

## 基線與範圍

開始前 Repository 無未提交變更；M0 HEAD 為 `5aebdde1b3d1efae2b25e95decef14fb1b21b02e`。
重新執行 M0 Typecheck、70 項 Vitest、Production Build、6 項 Edge E2E 均通過。
僅實作 M1，沒有新增 M2–M5 功能、LLM API、後端、複雜 Motif Memory 或曲風。

MusicDirector、EnsembleCoordinator、BarPlanner、PluginSession、SeededRandom、
四件 generator、MusicEvent 及創意指令契約均維持原內容。新增固定 M0 音樂事件
快照涵蓋四個 Seed × 15 個非空組合 × 12 小節及反向載入順序。

## 已實作

- 四件均為 CC0 真實樂器錄音；41 個素材合計 17,148,524 bytes，僅加入該件時載入。
- Piano：Kawai 鋼琴，7 根音 × 2 力度層，多音和弦、音長與 0.7 秒 Release。
  精簡素材保留最長 8 秒錄音衰減；沒有踏板 UI。
- Violin：VSCO solo arco vibrato，5 根音 × 2 層，錄音 sustain loop、45 ms attack、
  350 ms Release、90 ms 換音淡出。loop 1.2–3.2 秒，非錄製的 legato transition。
- Drums：Virtuosity 真實鼓組，Kick 2 層、Snare 3 層、Hi-hat 2 層各 2 次錄音；
  每次鼓擊獨立 gain，交替取樣邏輯僅存在此 Plugin。
- Bass：Karoryfer Darkblack 真實手指撥弦，4 根音 × 2 層，180 ms note-off、
  35 ms 單音換音。原始來源的音名有八度差，已以基頻測量改選正確錄音，未修改生成事件。
- `SampleBank` 最小通用擴充：region、tune、力度、loop、attack、gain、polyphony、transition。
  Plugin 持有所有具體 mapping／音色／演奏參數；Host／Director／Scheduler 無具名樂器分支。
- 通用 SampleVoice 使用同一 Tone context 的原生 BufferSource／Gain，排程不依賴 React。
  HTTP／decode 失敗可見；不接受部分 bank 成功、不使用 synth fallback。
- 20 秒 loading timeout；取消、Stop、失敗會 Abort 同批 fetch，過期 decode 結果不得安裝。
  import 無法中止但過期結果會被忽略。可立即取消／重試，不受舊 Promise 覆寫。
- 正常 Release 在 audio time 淡出；Stop／Remove 軌道 30 ms 淡出，50 ms 後釋放。
  Source onended 主動 disconnect，同 ID 新軌道不受舊清理影響。共用 Context／Master
  在 Stop 後保留供重新 Start，Host dispose 才釋放 Mixer；不聲稱關閉瀏覽器共享 Context。
- 背景／排程落後：每次最多按序推進 32 小節 state，過期起音不補奏，從未來小節恢復。
  UI／生命週期不再依賴 rAF；音符仍由 Transport／audio time 觸發。
- 修正取消音量 ramp 的不連續問題，採 cancelAndHoldAtTime；原生離線音訊已驗證
  中途 Release 不改寫之前的波形。尚不等於人耳 Click／Pop 驗收。

## 已執行驗證

完整工程批次：[results.json](.verification/2026-10-08T15-05-35-028Z/results.json)。
背景測試設定修正後，另外完整重跑全部 29 項 E2E：
[最終瀏覽器收據](.verification/2026-10-08T15-05-35-028Z/final-e2e/results.json)。

| 檢查                         | 結果                                                    |
| ---------------------------- | ------------------------------------------------------- |
| TypeScript Typecheck         | 通過                                                    |
| Vitest                       | 15 檔、150 項通過（含 61 個 M0 事件基準檢查）           |
| Production Build             | 通過，主 JS 531.46 kB／gzip 146.88 kB，非阻擋警告       |
| Sample 完整性                | 41 音檔與 4 份授權 hash 全數一致                        |
| Piano 實體隔離               | Typecheck + 70 tests + build 通過                       |
| Violin／Drums／Bass 實體隔離 | 每件 Typecheck + 71 tests + build 通過                  |
| Edge E2E 最終完整批次        | 29 通過、0 失敗、0 跳過（5.9 分鐘）                     |
| ESLint                       | 通過                                                    |
| Prettier                     | 通過                                                    |
| 原始／輸出音高稽核           | 32 有音高素材八度一致性檢查通過；不是精密調音或人工聆聽 |

實體隔離證據：[四份 fixture 收據](.isolation/2026-10-08T15-05-41-355Z/results.json)。
fixture 中只存在該件 Plugin，沒有移動或刪除原本目錄。

最終瀏覽器證據：[e2e.log](.verification/2026-10-08T15-05-35-028Z/final-e2e/e2e.log)、
[合奏截圖](.verification/2026-10-08T15-05-35-028Z/final-e2e/browser/screenshots/ensemble-m1.png)。
已檢視截圖，四件真實音色標記、Start／Stop／Mute／Solo／Lab 連結皆正常呈現。
每件 offline-render-metrics.json 保存在同一 browser 目錄的測試子資料夾。
四件 Lab 的本輪截圖亦保存在 browser/screenshots。

瀏覽器實際驗證：加入前無 sample 請求、單件只載入自己的音檔、WAV／FLAC
原生解碼並用該 buffer 發聲、多音疊加、力度差異、Release 後歸零、未來起音取消、
HTTP／decode 失敗與其他聲部隔離、取消／Stop／重試、反覆 live Remove／加入、
Stop 後所有已啟動取樣 sources 均 ended。完整合奏的 Mute／Solo／Remove 安全小節
及空 Host 邊演奏邊加入維持通過。

排程恢復已驗證 9.5 秒主執行緒停頓後不補奏過期音符，及 AudioContext 實際
suspend／resume。原 headless 批次的背景案例曾跳過，另以獨立測試 profile 啟動
原生有視窗 Edge，再以 CDP `noDefaults: true` 連接，保留正常背景政策並停用
focus emulation，觀察真實 visible → hidden → visible。實際隱藏 10,116.8 ms，
小節 1 → 4，回前景後有新取樣起音；前 500 ms 只有 2 次起音、遲到音符 0。
Stop 後 sources 全部釋放，測試專用 Edge 程序亦確認退出。啟動使用與一般
Playwright 測試相同的 `--no-sandbox` 執行環境旗標；沒有停用背景節流。

補驗證據：[background-result.json](.verification/2026-10-08T15-05-35-028Z/background-result.json)、
[background-policy.log](.verification/2026-10-08T15-05-35-028Z/background-policy.log)、
[背景可見性與音訊指標](.verification/2026-10-08T15-05-35-028Z/background-browser/audio-real-background-brow-783e2-ynchronized-sample-playback/background-visibility.json)。
先前四次測試設定／啟動失敗紀錄亦保留；最後補驗 1 通過、0 失敗、0 跳過，
其後 Typecheck／ESLint／Prettier 通過。這不涵蓋作業系統長時間睡眠或省電策略。

隨後的最終完整 29 項 E2E 同批全數通過，原 28 項與原生 Edge worker 可共存。
該批次背景分頁實際隱藏 10,127 ms，恢復後前 500 ms 只有 2 次起音、遲到音符 0；
音訊與小節仍前進。測試專用原生 Edge PID 43116 已確認退出，見
[process-cleanup.json](.verification/2026-10-08T15-05-35-028Z/final-e2e/process-cleanup.json)。
舊批次、補驗及先前失敗證據皆未覆蓋。

來源與音高證據：[sample-provenance.json](docs/sample-provenance.json)、
[sample-pitch-audit.json](docs/sample-pitch-audit.json)。Piano 某單一片段二次諧波偏強，
保留原本歧義並用第二個獨立片段的相同門檻確認，沒有放寬判定或改動錄音。

## 驗證命令與證據

```sh
npm run verify:m1
npm run verify:samples
```

verify:m1 依序執行 Typecheck、Vitest、Production Build、素材完整性、四件實體隔離、
Playwright、ESLint、Prettier，保留 `.verification/<UTC timestamp>/results.json`、各步 log
與 browser 證據。任一步失敗即停止且保留收據；不是人工品質核可。

Windows 本機 npm 捷徑損壞時使用：

```powershell
node 'C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js' run verify:m1
```

未修改全域 npm、Git 設定，未部署。

## 尚未完成與進入 M2 的條件

- **Pending：** `alpha`、`beta`、`音樂`、`0` 各 10 分鐘真實人工聆聽，共 40 分鐘。
  步驟與空白驗收表見 [M1_LISTENING](docs/M1_LISTENING.md)。
- 自然音色、Click／Pop、Violin loop／換音、合奏音量、長時間疲勞感，仍需人耳認可。
- 真實作業系統長時間節能／凍結、行動裝置及其他瀏覽器未驗證。極長凍結後可能
  有安靜的追趕時間，不宣稱瀏覽器被凍結時仍無間斷播放。
- 共用 JS chunk 約 531 kB 的 Vite 警告仍為非阻擋項，未為此重構。

**M1 尚未達到包含人工聆聽的完整完成標準，暫不進入 M2。**
授權與來源見 [SAMPLE_LICENSES](docs/SAMPLE_LICENSES.md)；架構變更與取捨見
[ARCHITECTURE](docs/ARCHITECTURE.md)、兩份 M1 ADR。
