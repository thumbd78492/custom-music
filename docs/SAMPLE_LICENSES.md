# 音色與依賴授權紀錄

記錄日期：2026-10-08。M0 **未下載、未散布任何外部音訊 sample**；所有聲部均為 Tone.js 執行時合成的 placeholder，UI 與 README 明確標示。不能視為 v1 真實音色完成。

| Plugin        | M0 音色                    | 素材檔案／轉換 | Sample 授權狀態 |
| ------------- | -------------------------- | -------------- | --------------- |
| Piano         | triangle synth、短音包絡   | 無             | 無外部素材      |
| Violin        | sawtooth synth、持續音包絡 | 無             | 無外部素材      |
| Drums         | membrane／noise 原語       | 無             | 無外部素材      |
| Electric Bass | 低音 synth                 | 無             | 無外部素材      |

每件的 `samples/index.ts` 目前匯出 `null`；`voice.ts` 選擇 placeholder。未加入空白音檔或以合成聲假裝 sample-backed。

## M1 加入每個實際素材前須補齊

來源頁 URL、實際下載 URL／版本日期、實際檔案的 license URL 與授權文字、原始檔名、新檔名、pitch/sampleKey mapping、必要 attribution、轉換工具版本與完整命令，以及原始／輸出 SHA-256。確認可再散布後才納入 plugin-local mapping。

`plan.md` 的候選音源尚未在本輪下載或逐檔查核授權，不作為已核准素材紀錄。

## 直接依賴

安装時從 npm registry 查核，精確版本以 `package-lock.json` 為準。Tone.js 15.1.22、React／React DOM、Vite、Vitest、Tonal、ESLint、typescript-eslint、Prettier 的 package license 為 MIT；TypeScript 與 Playwright 為 Apache-2.0。安裝時一併保留套件中的 LICENSE。

本輪沒有外部 AI 依賴、API key 或遠端合成服務。
