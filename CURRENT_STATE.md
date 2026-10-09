# 開發狀態

## M3-A1（2026-10-09；最新階段）

引擎 m3.a1。本輪範圍為共用律動／起止時間映射與 **播放中 Live Groove**；
保留 M2 五角色、雙鋼琴獨立實例、雙主奏與小提琴 0.2.2／-9 dB。
Straight／Light Swing／Half-time 在同 BPM 下由各 Plugin 自有 Pattern 適配，
含有限四小節變奏／Ghost／Fill／Break，主奏 theme 保留與問答布局變化。
沒有重新調音色平衡；**人工品質 Pending**。

純 timing、控制 timeline／快切／immutable committed plans、故障 Solo 回歸、
三 Groove×31角色組合／相同 Seed／操作重現、theme 保留、bounded lag 單元回歸與
AudioContext suspend/resume、小提琴 warped duration／連奏／Stop 通過。
現有全部 M2 測試保留；基線127項通過，最終31檔183項通過。
原生 Edge 真實背景案例尚未通過，與前述可控停頓／音訊 suspend/resume 分開。

真實 Live UI 最終完整 E2E 驗證：38.4秒，start1／stop0，Context／Transport 同一物件，
Seed alpha、5 voices／tracks 不重建，實際演奏三種 Groove，含 Mute／Solo 與 suspend/resume。
固定與階梯 BPM 時序、48kHz impulse、原小提琴映射後連奏／Stop targeted 另通過。
收據：`.verification/m3-a1-2026-10-09/live-transport.json`／live-groove.png，
完整 [工程收據](.verification/m3-a1-2026-10-09/final-results.json)、
[短稿與 timing-only](docs/M3_LISTENING.md)、[M3_HANDOFF](docs/M3_HANDOFF.md)、
[ADR](docs/adr-m3-groove-timeline.md)。

| 檢查              | 本輪實際結果                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| Typecheck／Vitest | 通過；31檔183項，原127項保留                                                  |
| Production Build  | 通過；主 chunk553.51 kB，既有 >500 kB警告保留                                 |
| Samples／授權     | 41音檔與4授權 hash 通過；保護來源未修改                                       |
| 四件實體隔離      | 全部 Typecheck／Vitest／Build 通過；Bass129／Drums129／Piano138／Violin136    |
| Edge E2E          | **42通過、1失敗、0跳過**，10.2分鐘；所有新 Groove／Live／timing 案例通過      |
| 原生背景補驗      | **失敗／驗收 Pending**；隔離 Edge 在播放前 hidden，樣本與時序尚未進入被測路徑 |
| ESLint／Prettier  | 分別補跑通過；完整 runner 在 E2E 失敗後未執行這兩項                           |
| 人工音樂品質      | **Pending**；沒有以自動量測代替耳聽                                           |

A1 完成度：律動引擎、Live 切換與73.6秒比較／診斷稿完成，停在可執行子交付點；
**整體工程驗收未全通過**。背景失敗的所有 trace／log 與嘗試保留，未刪測試或降低門檻。
實作 SHA：`63b83d20ffb6404100ce5458771537c794186b79`；最終本機／remote SHA
核對收據為 `.verification/m3-a1-2026-10-09/delivery.json`。
先在能取得真正 visible 的桌面環境續查並補驗原生背景案例，詳見 handoff。
下一必做為 M3-A2 播放中 Style 轉場；A1 不等於多曲風完成。
M3-B／C、M4／M5 保留，本輪停止於 A1。

以下為 M2 歷史紀錄，原人工品質與收據保留。

日期：2026-10-09。最新範圍為 **M2 收尾增補：雙主奏編曲＋雙鋼琴角色**，音樂版本 m2.2。
使用者最新回饋：小提琴發聲已明顯改善，保存為基準；希望鋼琴與小提琴對等主奏，
另一位鋼琴手獨立伴奏。本輪未開始 M3，整體音樂品質／人工試聽仍 **Pending**。

## M2 收尾增補

- 四種 Plugin 的 metadata 宣告五張文字卡：旋律鋼琴、伴奏鋼琴、旋律小提琴、貝斯、鼓。
  每位可獨立加入／移除、Mute／Solo、音量，安全小節生效；Piano Lab 可選角色或同時測兩位。
- pluginId／characterId／instanceId 分開，穩定舞台位置各有私有 session、PRNG、主題／和弦配置、
  演奏歷史、voice／performance、track、載入與清理 ownership。共享程式與唯讀素材。
- 先用原 Piano 生成器完成多實例驗證，保存 phase1 source，再加入自己的 melody／accompaniment。
- 通用 PhraseCoordinator 依角色能力／偏好與近期領句紀錄，輪替領句、回應、支撐與休止。
  自己任務與 OTHER 可聽聲部的佔用分開；Mute／Solo／移除／volume 0 不占名額。
- Piano melody 有兩小節主題、重複／局部變奏／引用、句尾休止與單音旋律；MIDI 62–76，
  既有取樣最近根音移調最多 4 semitones。伴奏在貝斯存在時 rootless、雙主奏時少裝飾與拍點。
  Piano gain 仍 -8 dB，不用提高整軌音量代替編曲。
- Violin 0.2.2 取樣、校準、起播、包絡、連奏與 -9 dB 均保存；只改生成器任務／留白。
  CreativeDirectorPort 保留，沒有伴奏小提琴、其他樂器、拖曳、美術動畫或外部 AI。

### 基準、收據與短稿

[基準與 SHA-256](.verification/m2-dual-role-2026-10-09/baseline/freeze.json)：
本輪開始 Git 乾淨，commit `3da393987d37ff9456c718f28d2a2a7c8c65024b`。
原始碼 tar、原短稿 Full／Violin Before／After 與受保護檔案 hash 保存，舊收據均保留。
[第一交付收據](.verification/m2-dual-role-2026-10-09/phase1-results.json)／
[原策略多實例 log](.verification/m2-dual-role-2026-10-09/phase1.log)，四項通過；
phase1/src 為改旋律前的完整快照。

最終待人工複聽的 alpha／Balanced 短稿（真實 Samples，Master 0.65，無 Normalize／limiter／compressor）：

| 稿件                                                                                                               |    長度 | Full Peak dBFS | 人工結果 |
| ------------------------------------------------------------------------------------------------------------------ | ------: | -------------: | -------- |
| [旋律鋼琴](.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/melody-piano-full.wav)         | 46.83 s |         -15.01 | Pending  |
| [鋼琴／小提琴雙主奏](.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/equal-duet-full.wav) | 78.30 s |         -15.09 | Pending  |
| [五角色 Full](.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-full.wav)         | 78.30 s |         -10.33 | Pending  |

[同次渲染的五角色 stems／完整事件／量測](.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/summary.json)。
Full 由該次 multichannel render 的 Float32 stems 加總再量化，不重新生成各角色。
PCM16 WAV stem 加總與 Full 可因獨立量化有微小差異，不做音量補償。
工程領句／回應與音域證據不等於聽感上的對等或好聽。

### 最終工程驗證（人工品質 Pending）

[完整回歸收據](.verification/2026-10-09T05-21-45-066Z/results.json)／
[E2E log](.verification/2026-10-09T05-21-45-066Z/e2e.log)，沒有未執行或跳過的必跑工程項目。

| 檢查               | 實際結果                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| Typecheck          | 通過                                                                             |
| Vitest             | 21 檔、127 項通過                                                                |
| Production Build   | 通過；主 chunk 544.57 kB，既有 >500 kB 警告保留                                  |
| Samples／授權 hash | 41 音檔與 4 份授權一致                                                           |
| 四件實體隔離       | 全部 Typecheck／Vitest／Build 通過；Bass 85、Drums 85、Piano 93、Violin 90 tests |
| Edge E2E           | 38 通過、0 失敗、0 跳過，8.5 分鐘                                                |
| ESLint／Prettier   | 全部通過                                                                         |

[隔離收據](.isolation/2026-10-09T05-21-51-821Z/results.json)；Piano-only 保留兩個角色及多實例測試。
測試覆蓋獨立 state／voice／PRNG、所有 31 種非空角色子集合、載入失敗／取消／過期清理、
Stop／重啟、安全邊界與已提交事件不變、三模式／四 Seed／反向載入重現、雙主奏分工，
以及動態 BPM、真實 Samples、實際背景分頁恢復與小提琴既有發聲回歸。

[受保護來源核對](.verification/m2-dual-role-2026-10-09/protected-scope-final.json)：
所有基準 hash 一致；所有 Samples、Piano voice 與共用 SampleVoice 未修改。
[最終來源 SHA-256 清單](.verification/m2-dual-role-2026-10-09/source-final.json)／
[分工與同次 WAV 分軌核對](.verification/m2-dual-role-2026-10-09/arrangement-audit-final.json)。
Full 與五條 PCM16 stems 加總最大相差 2 整數單位（量化上限 3），沒有重新生成診斷分軌。
五角色短稿的兩位主奏各有四個完整領句起點與回應；這些結構證據不代替人耳存在感判斷。

已修正隔離 fixture 的舊單角色測試假設；Vite 忽略 fixture／收據監視，避免新增 tsconfig
造成 HMR 重載。首輪完整回歸只在 Violin generator 的 Format 失敗，其收據保留於
[第一輪 results](.verification/2026-10-09T05-09-53-507Z/results.json)。修正格式後，分軌核對
發現疏鬆 Bass 意圖被平均稀釋而未觸發避讓，已修正並加入 Piano 回歸測試，再完整重跑。
首批與第二批短稿、初次隔離失敗／HMR 截圖及全部中間嘗試均保留，不把任何失敗改成成功。
最新短稿／stems 與 Pending 複聽表見 [M2_DUAL_LEAD_REVIEW](docs/M2_DUAL_LEAD_REVIEW.md)。
測試後只補交付文件，另跑 Format／diff 檢查；Git commit／遠端核對記於
[Git 交付收據](.verification/m2-dual-role-2026-10-09/delivery.json)。

### 修改責任與契約

- `src/contracts/instrument.ts`：宣告角色、任務偏好與三種身分，Plugin 可選 instance 上下文。
  `src/contracts/music.ts`：加入自己的 PhraseAssignment 與 audibleLeadCount；原 MusicEvent 不變。
- `src/core/CharacterInstances.ts`／`PluginSession.ts`／`EnsembleHost.ts`：metadata 展開、私有 state、
  穩定 PRNG、實例控制／載入／清理。`PhraseCoordinator.ts`／`BarPlanner.ts`：通用樂句與 OTHER 佔用。
- `src/instruments/piano/{manifest,generator,melody,accompaniment}.ts`：兩種私有生成策略；其餘三件 manifest
  宣告角色。Violin 只改 manifest／generator，不改 motif、voice、performance、regions 或音檔。
- `src/app/App.tsx`／`src/audio/{AudioEngine,MasterMixer}.ts`：通用文字卡與實例音量／音軌。
  核心、Piano、重現與瀏覽器測試補上新契約；短稿 harness 一次渲染各分軌。
- `plan.md`、README、ARCHITECTURE、LLM_FUTURE、聆聽文件與 [ADR](docs/adr-m2-role-instances.md)
  記錄範圍及相容性。MusicDirector 只更新引擎版本為 m2.2。

### 後續里程碑

M3：主題記憶、初步變奏與長時間事件測試已提前部分完成；完整主題發展、長時間即興品質、
Seed 重播與事件匯出尚待完成。M4：文字加入／移除、Mute／Solo 已部分完成，角色拖放、
美術動畫、操作介面與產品品質尚待完成。M5：只有 port／metadata，LLM 高層創意指令未實作。
本輪收尾後停止，不自行進入 M3。相容性與檔案責任見 [ADR](docs/adr-m2-role-instances.md)。

## 以下為前輪小提琴診斷的歷史紀錄

下方人工回饋描述的是當時版本；最新「已明顯改善」回饋見上方，其他未驗收項目仍 Pending。

日期：2026-10-09。最新範圍為 **M2 小提琴根因定位與取樣播放修正**。
**修正稿人工回饋未通過：小提琴音符進出太突兀、同一旋律內音量忽大忽小。其他尚未驗收項目維持 Pending；本次沒有開始 M3。**

## 本輪 M2 根因診斷（工程完成，短稿待複聽）

使用者已聽上一版修正稿，兩項聽感問題仍未通過。111 項 Vitest／34 項 E2E
只代表當時的工程回歸，不構成音質通過。本輪凍結 Violin gainDb -9、最新
Generator／Motif、四件 MusicEvent、BPM／和聲／Seed／Master 0.65。
先做只載入 Violin 的 20–30 秒單因素診斷與相同合奏事件的短版 Before／After，
保留逐音和 20／100 ms 包絡；短稿須經人工確認後才進行長時間音樂品質驗收。
不用 Master Normalize 或強力壓縮器，不開始 M3。

Violin `0.2.2`：固定使用較穩定的 Loud 單層，原 velocity 與旋律事件保留。
Plugin 自有 `regions.ts` 為五根音保留 0.03–0.16 s 有效音頭，Detached／Rebow
80 ms attack／transition；Legato 仍從 1.2 s 起播、70 ms crossfade、同音續 Source。
依實際 MIDI／播放速率／offset／音長／奏法／續音位置校準 region，音頭僅作固定衰減。
Source bytes、loop／tuning／350 ms release 保留；共用播放器、Host／Director／AudioEngine、
CreativeDirectorPort、Generator／Motif 及其他三件來源均未修改。

單因素實驗確認兩個因素都存在：固定力度上／下行，雙層相鄰差 **5.184 dB**，
固定 Loud **1.702 dB**；統一起播不能消除雙層起伏。固定 Loud 三奏法全組跨度，
現行起播 **4.629 dB**、統一穩定區 **2.940 dB**，音頭校準也影響一致性。
最後固定音列的相鄰最大差 **2.068 dB**、全組最大跨度 **2.524 dB**，
通過本輪暫定 <=3 dB 工程目標。相同合奏前綴 30 個 Violin 事件，相鄰最大差
**7.672 → 1.644 dB**。詳見 [根因實驗與逐音資料](docs/M2_VIOLIN_DIAGNOSIS.md)。

短窗仍有低谷：同音 C5 Rebow 的 20 ms 最低相對值 **-11.383 dB**；
實際旋律 81→79 的相同案例 **-3.614 → -7.444 dB**，100 ms 約 **-1.015 → -1.219 dB**。
沒有把這些結果寫成全時刻平順或自然度通過，最差 Before／After 曲線均保留。
整體合奏平衡、固定 Loud 音色與長時間音樂品質也仍 Pending。

- [27.72 秒 Violin Before](.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/before-violin-only.wav)／[After](.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/after-violin-only.wav)
- [同一事件 Full Before](.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/before-full.wav)／[After](.verification/violin-diagnosis-2026-10-09/ensemble/2026-10-08T19-26-38-327Z/after-full.wav)
- [逐音穩定區圖](.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/stable-note-rms.png)／[20 與 100 ms 最差曲線](.verification/violin-diagnosis-2026-10-09/report-final-2026-10-09/worst-transition-curves.png)

完整工程回歸：[results.json](.verification/2026-10-08T19-19-27-671Z/results.json)：
Typecheck、111 Vitest、Build、41 Samples／4 授權 hash、四件實體隔離、35 Edge E2E
（0 失敗／0 跳過，7.3 分鐘）、ESLint、Prettier 全通過。
主 chunk 540.37 kB 的既有大小警告保留。
回歸後只補強診斷的實際 Source ID 延續斷言與量測位置標籤，完整候選矩陣另跑通過：
[追加診斷收據](.verification/violin-diagnosis-2026-10-09/attempts/2026-10-08T19-35-33-705Z/summary.json)。
音訊 Runtime 沒有再修改。短稿尚未經人工確認，不開始長時間音樂品質驗收。

## 前輪 M2 小提琴修正（歷史）

使用者已實聽原 `alpha-balanced.wav`，指出 Violin 過大與每音重新拉弓。
本次開始基線 `79d38a5f0b685365793d397b596d70ef8d8aa58b`，工作目錄乾淨；
原版 source、事件、PCM stems 與舊收據均保留。

- Violin Plugin `0.2.1`，gainDb **-9**；輸出原演奏 -5／-8／-9／-10 的
  Full／Violin Only，並保留完全相同的 Ensemble Without Violin。
- `performance.ts` 私有弓奏策略：<=4 semitones、實際間隔 <=75 ms 的相連音
  可連奏；跳過初始弓奏區、70 ms equal-power crossfade、同音延續既有 Source。
  Rebow／Detached 保留音頭；不使用 pitch glide。
- Soft／Loud 改為連續平滑混合、同弓內緩慢變化；來源持續區 RMS 校準，
  sample 檔與 Master 0.65 不變，沒有 Normalize。
- Motif Memory 保留；延長音長、同弓分組及句尾呼吸，和弦音是偏好而非強迫跳音。
  Piano／Bass／Drums 生成器、設定與 CreativeDirectorPort 未修改。
- 共用音訊只擴充通用 SamplePerformance primitives；Host／AudioEngine 無具名分支。
- 受控 alpha A/B 是前 64 小節；原事件等於已聽十分鐘稿的相同前綴。
  只改演奏策略稿使用完全相同事件；旋律稿僅替換 Violin 事件，固定原版伴奏 PCM。
  App 的匿名協作正常保留，其他聲部可能因新的意圖間接產生不同事件。

[A/B WAV、聲部量測、主觀複聽表及實作說明](docs/M2_VIOLIN_REVIEW.md)，
[完整量測曲線](.verification/violin-m2-2026-10-09/metrics.json)，
[真實 Samples 品質與資源收據](.verification/violin-m2-2026-10-09/audio-quality.json)。

最新完整回歸：[results.json](.verification/2026-10-08T18-06-29-299Z/results.json)。

| 檢查               | 本次結果                                                              |
| ------------------ | --------------------------------------------------------------------- |
| Typecheck          | 通過                                                                  |
| Vitest             | 17 檔、111 項通過                                                     |
| Build              | 通過；主 chunk 540.37 kB，既有大小警告                                |
| Samples／授權 hash | 41 音檔、4 份授權一致；音檔 bytes 未修改                              |
| 四件實體隔離       | 全部 Typecheck／Build 通過；Bass／Drums 81、Piano 80、Violin 85 tests |
| Edge E2E           | 34 通過、0 失敗、0 跳過，7.2 分鐘                                     |
| ESLint／Prettier   | 全部通過                                                              |

[隔離收據](.isolation/2026-10-08T18-06-35-066Z/results.json)，
[完整 E2E log](.verification/2026-10-08T18-06-29-299Z/e2e.log)。
新增真實 Samples 測試確認原 0.6 門檻差縮至 <0.01 dB；同音延續不新增 Source；
Attack／Crossfade／Release 中的 Stop 保留前綴，尾端歸零；72 次快速換音、
144 Sources 最後全部 disconnect。換音 20 ms windows 最大 +2.554 dB、最低 -5.686 dB，
沒有把門檻內的工程結果寫成零波動或真實連奏聽感通過。

受控 A/B 長度 **155.35 秒／64 小節**；-9 gain-only 使 Violin RMS 恰好低 4 dB。
完整修正 -9 Violin RMS -41.79 dBFS（含音色校準／新演奏影響），
對原 -5 低約 7.46 dB；是否變得過小也必須複聽，-8／-10 的完整修正稿一併保留。
旋律平均音長 0.548 → 0.651 s，>4 semitones 跳進 22 → 0，重複同音 25.1% → 20.1%。
撤下的過度同音候選、兩次浮點嚴格 hash 失敗與中斷的回歸紀錄都有保留，
細節見 A/B 說明，不將中斷批次當成完整成功。

另已產生最新 App 正常匿名協作的
[完整 alpha／Balanced WAV](.verification/listening-2026-10-08T18-12-56-076Z/alpha-balanced.wav)
與 [段落／完整事件／量測](.verification/listening-2026-10-08T18-12-56-076Z/plan-and-metrics.json)：
602.47 秒、250 小節、23 段，sample Peak -11.03 dBFS、RMS -29.91 dBFS。
此完整稿允許新 Violin 意圖影響伴奏；受控 A/B 則固定原版伴奏 PCM。
人工連奏自然度、Vibrato／雙層混合與合奏音量仍 Pending。

## 修正前的 M1／M2 歷史紀錄

以下數值與設定是修正前的歷史基準，最新 Violin 設定見上方。

本次基線 `bf1be8488d275ac53263c1a3499bb8f60c2b4c8e`，開始時工作目錄乾淨。
使用者明確授權修正音量後進入 M2，並將 Motif Memory 納入本輪。
[2026-10-08 M1 歷史紀錄](docs/history/M1_STATE.md) 與所有舊收據保留。
本次未部署、未加入 LLM API、未修改音檔或 sample tuning。

## 階段 1：M1 混音修正

- Bass gainDb：-9 → **-12**。Violin：-12 → -7 初測後再調 **-5**。
- 使用原 M1 事件、真實 stereo Samples、原 voice 包絡、Master 0.65，
  四個 Seed 各 32 小節；測量整段 RMS、400 ms 最大 RMS、未經 limiter 的 sample Peak。
- 初測 Violin RMS 仍比 Piano 低約 3–5 dB，故增加 2 dB。最終 Bass RMS 約
  -29.2 至 -29.0 dBFS、Violin -32.8 至 -30.8 dBFS，合奏 Peak -10.3 至 -9.0 dBFS。
- [初測](.verification/mix-2026-10-08T16-27-22-423Z/metrics-and-events.json)、
  [最終候選](.verification/mix-2026-10-08T16-29-02-916Z/metrics-and-events.json)；
  原 M0 音樂 golden 61/61 通過，確認此階段沒有改作曲事件。
- Before 是相同聲部波形按原 gain 線性還原；沒有 Peak Normalize。
  RMS 不等於 LUFS／感知音量，sample Peak 也不是 oversampled true peak。
  最終設定仍待人工複聽；所有變更僅在 Plugin 的 sample bank。

## 階段 2：M2 音樂演化

- 引擎音樂版本 **m2.1**。初始 BPM 80–105，依 Seed 可重現；8–16 小節段落邊界
  才依能量方向小幅變速。Subtle／Balanced／Experimental，預設 Balanced。
- 條件式 Introduction／Main／Variation／Breakdown／Return 轉移、多組大／小調
  功能和聲；近系／關係調經共同和弦 pivot → 新調 V → I，非每小節亂數換調。
- ToneClock 以 immediate audio time 的 Transport ticks 定位小節，提前安裝
  BPM automation；所有樂器共用時鐘，音長不跨變速小節，release 使用 Plugin 包絡。
- Violin 私有 2–4 小節 Motif 保存節奏與相對音程，重現、變奏、更新及 Return 回想；
  MIDI 69–84，最短約 257 ms，具休止，不假裝錄製的真實 legato。
- Piano 轉位／聲部連接／琶音與主奏留白裝飾；Bass 依匿名 Kick 重音演奏，
  加入五度、八度、切分與經過音；Drums 依樂句改 groove、段落尾加 fill。
- EnsembleIntent 實際控制各件音域／密度／重音；Mute／Solo 不可聽聲部不佔意圖，
  仍推進其私有 state。Host 無具名樂器演奏分支、Plugin 不互相 import。
- CreativeDirectorPort 與 LocalRuleBasedAdapter 保留，沒有 LLM API。
- 分段檢查：2a Typecheck + 25 tests 通過；2b Typecheck + 103 tests 通過。
  新增靜音意圖隔離後完整批次為 104 tests。

## 階段 3：工程驗證

執行 `npm run verify:m2`（共用既有工程驗證 runner）。
[本次完整批次收據](.verification/2026-10-08T16-53-08-653Z/results.json)。

| 檢查               | 最新結果                                                |
| ------------------ | ------------------------------------------------------- |
| Typecheck          | 通過                                                    |
| Vitest             | 16 檔、104 項通過                                       |
| Production Build   | 通過；主 chunk 537.87 kB / gzip 149.00 kB，既有大小警告 |
| Samples／授權 hash | 41 音檔、4 份授權一致；17,148,524 bytes                 |
| 四件實體隔離       | 全部 Typecheck、Piano 77、其餘各 78 tests、build 通過   |
| Edge E2E           | 32 通過、0 失敗、0 跳過（7.2 分鐘）                     |
| ESLint／Prettier   | 全部通過                                                |

[實體隔離收據](.isolation/2026-10-08T16-53-14-953Z/results.json)：每個 fixture
只存在該件 Plugin；原目錄未移除或改名。M2 重現性涵蓋三模式 × 四 Seed ×
280 小節（每次超過 10 分鐘）、全部非空樂器子集合、反向載入順序、完整事件及
Tempo／Harmony Plan；不是只比較音量亂數。

真實 AudioContext 的 18 小節變速測試單獨執行已通過（45.5 秒），三條測試音軌
起音相對解析式誤差小於 0.2 ms，並驗證 mute 邊界。先前 OfflineContext 測試配置
只跑前三小節而失敗，已改為真實時鐘；不把該次失敗當成同步證據。
M0 golden 與原測試保留為歷史；M2 作曲輸出刻意改變，不宣稱 m0.1 事件相容。

## 試聽稿與人工驗收

已生成 [alpha / Balanced 試聽 WAV](.verification/listening-2026-10-08T16-59-37-055Z/alpha-balanced.wav)
與 [段落／完整事件／量測](.verification/listening-2026-10-08T16-59-37-055Z/plan-and-metrics.json)。
602.47 秒、250 小節、23 段，9 個 BPM 值（95–104）、8 個調性；未經 limiter 的
sample Peak -9.71 dBFS、RMS -28.41 dBFS。這些是結構與波形證據，不是好聽的證據。
真實 Samples、原 voice、Master 0.65，22050 Hz stereo PCM；未 Normalize，
不是 live Transport 錄音。先前試聽稿與所有量測收據仍保留，未覆蓋。

**[M2 人工聆聽表](docs/M2_LISTENING.md)：alpha、beta、音樂、0 各 10 分鐘仍 Pending。**
M1 使用者回饋已記錄，但沒有擅填聆聽時間或核可。重點確認持續 10 分鐘風格一致、
速度／和弦／主題／節奏／編曲有自然可辨變化，以及 Bass／Violin 平衡、Click／Pop、
loop、Release 與疲勞感。

極長背景凍結可有安靜追趕區；略過未提交的過期 attacks／tempo 轉換，在下一個
未來安全小節恢復 BPM，不回寫歷史 automation。未驗證 OS 長時間睡眠、行動裝置
或所有瀏覽器。沒有擴充 M4 UI、M3 replay 匯出或 LLM 網路服務。
架構與取捨見 [ARCHITECTURE](docs/ARCHITECTURE.md)、[M2 ADR](docs/adr-m2-generative.md)。

## 最終瀏覽器證據

完整 32 項 E2E 同批通過，包含原 M1 的 29 項 Samples、Stop／Release、取消、
重試、活躍 sources 歸零、主執行緒停頓、AudioContext suspend／resume 及真實背景測試。
新增完整 10 分鐘渲染、四 Seed RMS／Peak 稽核、原生 Transport 變速測試。
[瀏覽器 log](.verification/2026-10-08T16-53-08-653Z/e2e.log)。

背景實際 visible → hidden → visible，隱藏 10,168.7 ms、小節 1 → 4；
回到前景前 500 ms 只有 2 次新起音、遲到起音 0。
[背景收據](.verification/2026-10-08T16-53-08-653Z/browser/audio-real-background-brow-783e2-ynchronized-sample-playback/background-visibility.json)。

最終 M2 四 Seed 32 小節混音 Peak -10.9 至 -9.7 dBFS，Violin RMS -31.2 至
-28.5、Bass -31.3 至 -30.6 dBFS；保留不同音色／角色的差異，沒有自動對齊 Peak。
[最終混音收據](.verification/mix-2026-10-08T16-59-42-009Z/metrics-and-events.json)。
已檢視 [M2 UI 截圖](.verification/2026-10-08T16-53-08-653Z/browser/ensemble-m1.png)，
變化模式、實際 BPM／和聲／段落、四件控制正常呈現；截圖沿用既有測試檔名。
