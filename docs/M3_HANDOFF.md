# M3-A1 交付與續作

日期：2026-10-09。審查／開始 HEAD：`b79cdfce3dba150ac36150a6bb89065e2e72db0f`。
開始時 HEAD 未前進，只有提供的 zip／解壓附件未追蹤，未回退或覆蓋使用者修改。
本輪僅 M3-A1，人工音樂品質維持 **Pending**。最終 commit／remote SHA 另記於
`.verification/m3-a1-2026-10-09/delivery.json`（完成提交後寫入）。
本輪在 **A1 可執行子交付點**停止；原生背景分頁案例未通過，工程驗收未全過。
沒有開始 A2／B／C／M4／M5，沒有承諾背景繼續工作。

已實作 Straight／Light Swing／Half-time、四小節節奏變奏／Ghost／Fill／Break，
鼓／Bass／伴奏 Piano 自有節奏型；主奏保留主題，只有限呼吸與問答適配。
五角色、雙鋼琴與雙主奏、私有 state／PRNG／voice／track 保留。
播放中 Groove 選單立即接受，顯示 pending／提交狀態／生效小節及 tick。
最早安全邊界為 max(nextBarIndex,floor(requestedTick/768)+1)，不撤回已提交區段。

契約見 [ADR](adr-m3-groove-timeline.md)。固定 PPQ192；custom swing0.6，Transport.swing0。
logical MusicEvent 與 frozen PlaybackEvent 分開，on／off 同映射，精確時長送入原 voice。
共同小節／Mixer／階梯 tempo 邊界不移動。A1 為離散邊界切換，沒有聲稱 Style 漸變。
timeline 保存 ID／順序／source／target／revision／requested/effective tick／版本與狀態，
accepted latest-wins，scheduled 不回寫，boundary completed；過期／無 revision 的 async
控制被拒絕。Stop 後在途收據 superseded，既有重啟規則保留。

R4 原先 propose／generate 故障均重現，修正前 2 fail／1 deliberate Mute Solo pass 收據
保留於 `.verification/m3-a1-2026-10-09/baseline/r4-reproduction.log`。
通用 Solo／任務排序、故障後 roster 更新、一次 bounded healthy replan，checkpoint／
phrase rollback 保證健康 state 只提交一次，失敗角色不重試。多故障鏈與刻意靜音分開測。

實際基線：`node node_modules/typescript/bin/tsc --noEmit`、
`node node_modules/vitest/vitest.mjs run`，0／0，21 檔127項通過，收據 baseline/results.json。
最終完整 runner：`node scripts/verify-m1.mjs --m3-a1`，exit1。
[原始結果](../.verification/2026-10-09T06-17-15-951Z/results.json)／
[彙整收據](../.verification/m3-a1-2026-10-09/final-results.json) 保留完整命令與所有嘗試。

| 實際命令                                                                                                                                                                                                                     | 結果                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `node node_modules/typescript/bin/tsc --noEmit`                                                                                                                                                                              | exit0                                                              |
| `node node_modules/vitest/vitest.mjs run`                                                                                                                                                                                    | exit0；31檔183項，原127項保留                                      |
| `node node_modules/vite/bin/vite.js build`                                                                                                                                                                                   | exit0；主 chunk553.51 kB／gzip154.13 kB，既有 >500 kB警告          |
| `node scripts/verify-samples.mjs`                                                                                                                                                                                            | exit0；41音檔／4授權                                               |
| `node scripts/test-isolation.mjs`                                                                                                                                                                                            | exit0；四件實體隔離 Typecheck／Vitest／Build，129／129／138／136項 |
| `node node_modules/@playwright/test/cli.js test`                                                                                                                                                                             | exit1；42通過、1失敗、0跳過，10.2分鐘                              |
| `node node_modules/eslint/bin/eslint.js .`                                                                                                                                                                                   | runner中未執行，另補跑exit0                                        |
| `node node_modules/prettier/bin/prettier.cjs --check src tests scripts docs plan.md README.md CURRENT_STATE.md package.json package-lock.json tsconfig.json vite.config.ts playwright.config.ts eslint.config.js index.html` | runner中未執行，另補跑exit0                                        |

新 Live Groove、timing、violin E2E 全部通過，原普通音訊 E2E 亦通過。
唯一失敗是原 `audio.spec.ts` 真實原生背景案例：最初45秒逾時，trace證實
等待 click 的 rAF stability 約44.5秒；實際 click 後 Bass WAV HTTP200／6.8–17.7ms。
尚未 Start，不是已證明的 sample decode 或音樂 scheduler 故障。
增加初始 visibility 收據後，Edge windowState=normal 但 document.visibilityState=hidden。
曾驗證 force pointer、CDP normal／minimized→normal 及 README 指定的可見視窗啟動；
仍 hidden，全部失敗 log／trace保留，不改寫成功。最終移除 force／restore workaround，
只保留可見視窗啟動與前景斷言／收據，普通 click 和原全部音訊門檻維持。
最終補驗實際命令：
`node node_modules/@playwright/test/cli.js test tests/e2e/audio.spec.ts --grep 'actual background tab' --trace=on --output=.verification/m3-a1-2026-10-09/background-visible-window`
exit1，明確失敗於播放前 visible 前提，驗收 **Pending**。
這個環境的實際 OS 前景／遮蔽原因尚未完全確認，不能以 Live suspend/resume 宣告背景通過。

續查：在可用桌面確認獨立 Edge 真正 visible、視窗 focus／occlusion與頁面visibility；
保留 noDefaults、focus emulation disabled、10秒 hidden→visible、同步／無過期起音／釋放
全部原門檻，再執行該命令。不可透過重新開 focus emulation、停用背景節流、刪測試
或降低門檻取得通過。音樂實作未因這個 fixture 問題重置或降級。

音訊稿：`.verification/m3-a1-2026-10-09/listening/<timestamp>/`。
alpha／Balanced／96 BPM，72秒要求、實際約73.6秒含尾音；三種 arranged Full／五條
stems 及三種 timing-only Full／stems。每次 Full 直接由同次 Float32 stems 加總，
不 Solo 重作、不 Normalize；timing-only 三份 logical events hash 相同。
收據含版本／完整 logical/playback／分工／theme IDs／gain／量測。
Live 證據為 live-transport.json、live-groove.png 及完整 browser JSON：
真實 UI 快切＋Mute／Solo＋AudioContext suspend/resume，start1／stop0，5 voices／tracks，
同一 Context／Transport，Seed 不變，三種 Groove 皆實際呼叫原 voice。
固定／階梯 BPM 共同時序及 48kHz impulse onset/off quantization、原小提琴連奏／Stop 另測。
離線 WAV 不代替 Live 操作；自動量測不等於人工自然度／音樂品質驗收。

受保護：全部 `src/instruments/*/samples/**`，Piano voice、SampleVoice；Violin voice、
performance、regions、motif、docs/violin-sample-calibration.json、-9 dB。
本輪未修改這些發聲來源；baseline/protected.json 為六件 code／calibration hash，
不含樣本清單，最終 protected-final.json明列該範圍。全部41樣本另由未改的 provenance
逐件 hash核對，且與b79cdfc的samples diff為空；不以六件 hash冒充全部素材核對。

短稿與量化 readback 見 [M3_LISTENING](M3_LISTENING.md)。探索性的跨 OfflineContext
PCM bit-perfect 額外檢查失敗亦保留；logical/playback重現性與Full／stems量化核對通過。
開發預覽：`node node_modules/vite/bin/vite.js --host 127.0.0.1`，
開啟 `http://127.0.0.1:5173`，加入角色、Start後直接切換Groove。
UI顯示pending／生效位置，禁止用Stop／Start代替Live切換。

下一交付只在使用者啟動後進入 **M3-A2：播放中曲風轉場**：先 Lo-fi／輕爵士與
Cinematic，再 Pop；同 timeline 延伸 StylePreset／TransitionPlan，保留已提交 nextChord、
主題、角色與 Context／Transport。不可改成停止後選曲風，不延後到 M5。
M3-B 長期主題與資源界限、M3-C Session replay／export、M4 UI／品質、M5 LLM 保留。
先補 A1 背景驗證，再由使用者啟動 A2；本輪在上述可執行子交付點停止。
