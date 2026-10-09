# custom-music — M3 實作增補計畫

版本：提案 v1.0 / 2026-10-09  
基準：M2 收尾 `b79cdfce3dba150ac36150a6bb89065e2e72db0f`  
用途：供 Coding Agent 分段執行。**本文件不是已完成報告，也不覆蓋原 plan.md。**

## 0. 使用方式與優先級

1. 將本文件、`START_M3_A1.md`、`M2_REVIEW_b79cdfc.md` 放到 repository 根目錄。
2. 以 repository 現有 plan.md 為主線，加入本增補與子階段狀態，不用對話裡的舊附件覆蓋 repository 的新版計畫。
3. 最新使用者需求優先於舊版「只可停止後切換」或「不開始 M3」的階段限制。現在已授權開始 M3，但**第一輪只做 A1**，其餘保留，不一次做完。
4. 五角色、多實例隔離、已改善的小提琴、精確排程與可重現性仍是硬性約束。
5. 任何數值範圍都是初始設計或工程驗收目標，不冒充音樂學上的定律或人工聽感結果。

## 1. 新增需求：必須能在播放中改变音樂方向

- 播放不中斷時，玩家可隨時提出 Groove 或 Style 切換。
- 請求立即被接受/驗證並顯示狀態；實際聲音從最近未提交且安全的小節改變，不保證按下瞬間更換所有聲音。
- 不要求 Stop，不重播第一小節，不重設 session seed/角色 ID/主題記憶，不重建整個音訊引擎。
- 曲風切換需改變律動、和聲節奏、旋律節奏與編曲，而非只改 BPM、音量或 UI 名稱。
- 本地操作先完成；未來 LLM 與自動指揮策略使用同一 validated command port，不直接操作音訊 callback。
- 允許音樂上刻意的留白；不允許切換造成意外整團掉音。OS 凍結/音訊暫停不在「保證無間斷」的範圍，恢復策略須另外測。

## 2. 里程碑不刪除，只細分

| 階段 | 交付 | 是否本輪實作 |
|---|---|---|
| M2 收尾 | 五角色、雙鋼琴、雙主奏的工程基線；品質 Pending 保留 | 已有；只補必要回歸 |
| M3-A1 | Groove Engine、演奏時間映射、播放中切換律動、局部節奏變奏 | **本輪** |
| M3-A2 | Style Profiles、Live Style Transition，先兩種後三種曲風 | 下一輪 |
| M3-B | 更長主題發展、對話、回想、長時間生成的狀態與資源界限 | 保留 |
| M3-C | Session/操作重播、版本化事件匯出、保存恢復 | 保留；A1 先記操作 |
| M4 | 拖放/角色動畫/產品品質/行動裝置；伴奏小提琴候選 | 保留 |
| M5 | LLM 解析高層意圖、逾時/失敗/成本/權限 | 保留 |

A1 完成不等於多曲風完成；A2 不能交付「只可停止後選曲風」的替代品。

## 3. 最小責任邊界

不要為此新增一套框架或 monorepo。下面是責任，不強制每個名稱都建立 class：

| 責任 | 所屬位置 | 不應負責 |
|---|---|---|
| 指令驗證、排隊、生效邊界、revision | core 的單一控制 timeline / 既有 CreativeIntentController | 作曲音符、網路 LLM |
| 曲風的共同政策 | data presets + Director | Piano/Violin 專用 MIDI 演算法 |
| 律動計畫與邏輯時間映射 | 小型純 TS utility + frozen BarPlan | AudioContext、UI timer |
| 角色領句/回應/留白 | 既有 PhraseCoordinator | 取樣選擇、直接出音 |
| 樂器節奏、音域、實際音符 | 各 Instrument Plugin | import 其他樂器 |
| 播放事件轉 audio time | AudioEngine/ToneClock | 重新抽亂數、創作樂句 |
| Sample/包絡/校準 | Plugin voice/performance + 通用音訊服務 | 理解具名風格或其他角色 |

可加法擴充 BarPlan、PreparedBar 與通用 PlaybackEvent；保留三種 ID 與每個實例的私有 state。不要把角色或取樣資產複製成「Jazz Piano Plugin」「Pop Piano Plugin」。

## 4. 共用 Runtime 控制契約（A1 開始，A2 延伸）

### 4.1 建議的語意

`requestGroove(...)` 與未來 `requestStyle(...)` 走同一接收/驗證/排程規則。欄位名稱可調整，至少記錄：

- commandId、單調遞增 sequence、source（ui / local-policy / future-llm）。
- requestedAtTick、target、request revision。
- effectiveBar / effectiveTick、transition length、計畫版本。
- accepted / scheduled / transitioning / completed / superseded / rejected 狀態與原因。

不要只改某個全域 mutable style 物件；已提交 callback 必須捕捉不可變計畫，而非播放時再讀目前下拉選單。

### 4.2 安全邊界與三類狀態

分清：正在播放的小節、已提交且不可變的區段、尚未提交的預覽區段。以第一個未提交小節與目前小節之後的安全邊界決定 `effectiveBar`。保留目前合理的 lookahead，不為追求立即回應而砍到幾乎沒有緩衝。

A1 可以直接從既有 `planner.nextBarIndex` 邊界加入新 Groove，不需撤回舊小節；不可因 Director 已快取下一段落而要求等完 8–16 小節。

若未提交的生成已推進 plugin state，重規劃必須從合法 snapshot/檢查點重新開始，或選擇不撤回這一段；不得重複消耗亂數或推進 state。AudioEngine 已接收的事件與 tempo automation 不改寫。

### 4.3 連續請求與取消

未提交請求採明確的 latest-wins 合併，舊命令保留 superseded 收據，不堆出數十個無用轉場。已提交轉場不回溯破壞：新請求在下一個一致的安全邊界接續。測試 A→B→C→A 的快切、相同 target 重複、過期 async 回應、Stop 後重啟。

手動操作優先於過期自動/LLM 指令；未來 async 解析需帶 revision。Stop 是玩家要求才執行的真正停止；風格切換絕不可偽裝成 Stop/Start。

## 5. M3-A1 — 律動與節奏變化

### 5.1 本輪可見內容

保留 4/4 與現有五角色，先提供三個可在播放中切換的 Groove：

| Groove | 目標 | 不能用的捷徑 |
|---|---|---|
| Straight | 直八分、清楚脈動，可帶弱拍和弦/切分 | 不只是舊模式換名 |
| Light Swing | 音符的長短分割產生真正搖擺 | 不只是音量強弱；不能雙重 swing |
| Half-time | 同 BPM 下放寬 backbeat/句子呼吸 | 不直接把 BPM 除以二 |

切分、Ghost Notes、句尾 Fill、短 Break 與少量開放式節奏變奏是上述 Groove 的材料，不必每個都做一個模式。Double-time 可留 A2/B 擴充；不為湊數把音符密度一律翻倍。

先在固定 BPM 的 A/B 證明差異，再測既有動態 BPM，不把變速當成律動多樣性的替代品。

### 5.2 Groove 不是只有鼓

- Drums：Plugin 內保存小型 pattern family。穩定重拍加上 2–4 小節變奏/弱擊/過門；不是每小節完全重抽，也不是只換 kick。
- Bass：參考匿名 pulse/共同重音，也保留少量提早/反拍回應；沒有鼓時使用共同脈動。不按鼓聲部 ID 取專用事件。
- Piano accompaniment：改變和弦進入點、延留/切分與疏密。保持與 Bass 的低音避讓。
- Piano melody：保留主題，對節奏做有限的延長/簡化/回答句變化，不每小節重抽音高。
- Violin：保留已校準發聲；節奏與任務可適配，但其短音/連奏/休止範圍要受樂器能力限制。
- PhraseCoordinator：提供少量問答布局（例如兩小節主題/回答、四小節長句、帶短 overlap 的收句）。布局按樂句固定，不每小節亂換；自己與 OTHER 意圖仍分開。

Groove 的共同 timing/pulse 需全團一致，Plugin 的裝飾亂數仍按 instance 派生。填花、長句及休止都需有 cooldown/密度上限，避免「變化」最後變成每拍塞滿。

### 5.3 建議凍結的 GroovePlan 資料

至少可以表達 familyId、patternVariantId、cycleBars、cyclePosition、swingRatio、pulse/accent anchors、density、syncopation、fill/break 提示及每個角色的 assignment。資料是純值，不存 Tone node 或 generator 函式。

風格與變化程度是不同軸：Style 決定語彙，Groove 決定律動，Subtle/Balanced/Experimental 決定改變幅度，Energy 決定強弱/密度。不要把這四件事混成同一 enum。

### 5.4 時間映射：這是 A1 的核心工程工作

保留整數 16-step 作曲網格是可行的，但實際演奏要能落在不同 tick。建议產生獨立的 PreparedPlaybackEvent，含 logical event identity、onTick、offTick（hit 無 offTick）、groove revision。

对八分 Swing，一個可測的映射為：對每個四分音符拍內位置 u∈[0,1]，

- u≤0.5：W(u)=2ru。
- u>0.5：W(u)=r+2(1-r)(u-0.5)。
- r=0.5 是 Straight；Light Swing 可先測 r≈0.58–0.62；範圍是調校提案。

由固定 PPQ 把拍內位置轉成 tick；初始化後不更改 PPQ。實作可使用其他等價且可驗證的單調映射。

**以下條件必須同時成立：**

1. 映射 note-on 與 note-off，不只是移動起音。相連音的共同邊界仍對齊，detached 的間隙與 articulation 保持合理。
2. 跨小節節奏動機用多小節資料表達；本輪音符 nominal note-off 仍不跨變速小節，release 尾音照原有秒數自然釋放。
3. 小節起點、角色旗標、Mixer 操作及 tempo automation 不被 swing；它們是音樂邊界。
4. 共享 mapping 適用於所有相關音樂事件，但仍允許聲部合理留白；不是各 Plugin 各跑一個 timer。
5. 不同 Groove 過渡時，每一小節只使用一份凍結映射。A1 可用 1–2 小節有限漸變；離散的拍型不能任意數值相加。
6. Tone Transport 全域 swing 與自訂映射二選一。此案建議自訂映射以便精準重播與 note-off 對齊，Transport.swing 維持 0。
7. 不以 Math.max(...,0) 把非法負拍點默默夾到第一拍。排序、同拍和弦、音長為正與越界需驗證；有意相同 tick 不代表重複錯誤。
8. 音符播放時長與 source buffer offset/duration 的單位不可混淆。AudioBufferSource 的來源內容 duration 會受 playbackRate 影響；本案 musical note-off 應由音訊時間的包絡/stop 控制，不靠猜錄音長度。

現有 voice 使用 durationSteps × secondsPerStep，不能直接保留不變卻宣稱支持所有 timing warps。優先在通用播放適配層提供精確起止時間/有效時長，必要時最小擴充契約；音色政策仍留在 Plugin。保留 logical MusicEvent 與實際 PlaybackEvent 的區別。

### 5.5 本輪不做

完整多曲風轉場、拍號改為 3/4/6/8、tempo ramp、任意跨小節連音、獨立軌道時鐘、LLM、更多角色/音源、美術或完整 Session 匯出 UI。

4/4 下已可做明顯律動差異；不要把三連音/6/8 與 Swing 當成同一項。未来再擴展網格與拍號。

## 6. M3-A2 — 持續播放中的曲風轉換

### 6.1 曲風選擇與順序

先 Lo-fi/輕爵士與 Cinematic/鋼琴弦樂配樂，通過後加 Pop/抒情流行。以上是針對現有編制的風格近似，不能宣稱覆蓋整個 genre。每種至少在節奏、和聲節奏、樂句/伴奏三面有可聽差異。

不用新樂器，也不新建三份 Director。StylePreset 只表達共用政策；各 Plugin 自己解讀密度/音域/表現提示。未支持的某項能力應有聲部自己的合理 fallback，不讓整團停下。

### 6.2 TransitionPlan

包含 fromStyle、toStyle、startBar、endBar、revision、每小節 Groove/tempo/harmony/arrangement 決策與保留的主題線索。2–8 小節是初始轉場範圍，不要求每次全部用滿，也不要求按下瞬間硬切。

先保留至少一條可聽音樂線索（節拍或主題），再依次改變律動、伴奏與和聲。不要把兩首完整樂曲同時加起來當「無縫轉場」。密度/能量等連續參數可以插值；調性、和弦名稱與離散鼓型不可直接插值。

若切換前一小節已提交 nextChord 或長音資訊，轉場第一段需尊重該承諾或選安全和聲橋接；所有角色共享同一 transition/harmony plan，不能各自用不同調性。

### 6.3 不變條件

- Transport/AudioContext/session/instances 不重建。
- 沒有 Stop/Start、playhead 歸零、seed 改變或全局主题清空。
- 不清除整個 Director 的歷史；只處理未提交的 suffix。保留已消耗的亂數/主題/任務 state，必要時 checkpoint 重算。
- 新資產尚未 ready 或轉場規劃失败時繼續舊音樂，顯示原因；不先停團等待下載。
- 第一版每小節 BPM 固定，跨小節小幅階梯轉換；需要真正 ramp 時另外擴充積分與 note-off 語意，不能假裝已支持。
- UI 顯示目前曲風、目標、開始/結束小節與轉場進度；播放中選單可操作。

### 6.4 自動切換與未來 LLM

先做手動請求。同一 port 可讓本地 policy 在段落之間提議 Style，後續 LLM 只產生相同的宣告式指令。自動切換需明確開關、最小駐留/冷卻時間，不每幾小節不停換風格；手動請求後暫不被自動策略立刻推翻。

不在 A2 引入 API key、外部模型依賴或把不可用風格硬生出來。

## 7. M3-B — 主題發展與長時間即興

擴充現有各 Plugin 私有主題，不把旋律放入 Host。保存輪廓與節奏身份，加入延展、縮短、移位、對答、回想與有限更新；Groove/Style 改變時不一律丟掉主題。

檢查 4/8 小節樂句與 16/32 小節發展是否可辨；避免每四小節機械輪替、完全新歌般的切段，或十幾分鐘不更新兩小節節奏。

長時間生成須有資料生命週期：近期段落/主題/領奏歷史與 callback 有界；Director cache 若要保留歷史重播，另以事件資料或 checkpoint 保存，不讓線性搜尋/引用無限增加。操作紀錄可持久化或分段，不把重播需求等同所有音訊節點永遠留在記憶體。

## 8. M3-C — Session 重播與匯出

保存 session schemaVersion、音樂引擎版本、Plugin/Style/Groove版本、Seed、稳定實例配置、初始角色設定、具生效 tick 的操作及必要 checkpoint。可匯出 logical events 與 playback timing。

重播的是「已解析且已排程的意圖結果」，不重新呼叫 LLM。不同裝置 PCM 不保證 bit-perfect；同版本及相同決策日志的音樂事件/tick應一致。背景凍結的跳過音符可另記 runtime log，與正常邏輯 session 的節奏/和聲重播分開。

M3-C 不要求做社群分享、雲端帳號或完整音樂編輯器。

## 9. 驗收矩陣

### A1 必跑

- 原 Typecheck、Vitest、Build、四件實體隔離、E2E、Lint/Format 不退化；Piano-only fixture 同時測兩角色。
- 先確認 review R4：唯一 Solo 角色 propose/generate 失败時，健康聲部是否可以繼續；與使用者刻意 Muted Solo 的語意分開。
- 純 timing：Straight identity、Swing offbeat 真的移動、四分音符拍/小節不動、on/off皆映射、duration>0、不可越界、同拍和弦保留。
- 時鐘：固定 BPM 與既有跨小節動態 BPM 都測；不出現雙 swing；停止/重啟後舊 callback 不復活。
- 操作：播放中 Straight→Swing→Half-time→Straight；快速重複 target、取消、正在 pending 時換 target；不 Stop、不重設 playhead/instances。
- 凍結邊界：新請求不能改已提交 BarPlan/PlaybackEvent/tempo automation；僅未提交後綴改變。
- 再現性：固定 Seed、角色配置與操作日志的 logical/playback events、effectiveTick、Groove revision 相同；loader順序無關。
- 音樂作用：鼓、Bass、伴奏鋼琴的節奏確實不同，不只是 metadata或力度；主奏保留可辨主題與雙主奏分工。
- 無鼓/無Bass、單主奏、雙鋼琴、完整五角色都正常；五角色31種非空組合仍覆蓋基本生成。
- 小提琴：舊固定事件發聲回歸照常，新增 warped-note 時長/連奏/Stop測試。保護音色來源但不把新的時序當成已驗證。
- 保留先前失敗收據，不改門檻湊綠燈。

### A2 追加

- 每對風格雙向切換，及 Lo-fi→Pop→Cinematic→Lo-fi 連續序列；包括 active transition再來新請求。
- 實際 Live Transport 檢查 start/stop計數、单調 playhead、角色instance與 voice ownership；不是只有離線WAV。
- 新資產失敗、背景恢復、stale reply/command revision、安全和聲/tempo邊界均測。
- 10–30分鐘session多次切換無洩漏或意外全團無聲；合法休止與背景凍結另註原因。

### 音訊與試聽證據

A1 先交付 60–90 秒同 Seed/固定 BPM 的三種 Groove 比較，以及一份播放中切換的 live 操作證據。另保留 timing-only A/B：使用同一份固定事件，只換時間映射，與完整重新編曲的版本分開。

用合成 click/impulse 診斷共用時鐘與實際render onset，不將真實樂器音頭延遲誤認成scheduler jitter。門檻需按測試採樣率/渲染量化先訂定，回報最大/分位誤差；不事後放寬。真實 Samples 另檢查聲部輸出、連奏與換拍自然度。

Full/stems 必須由同一事件集合產生，不能Solo後重新作曲。不得 Master Normalize。每份稿附 seed、版本、模式、操作 effectiveBar/tick、主題ID、分工與timing資料。後續四 Seed 各10分鐘人工聆聽仍Pending，不能由峰值或測試數量替代。

## 10. 分段執行與續作文件

A1 內部順序：

1. 基線與必要回歸，更新 plan/ADR。
2. 純 timing mapping 與凍結command timeline。
3. Drums/Bass/伴奏Piano的Groove，再最小主奏/問答適配。
4. Live Groove UI與快切/replay測試。
5. 短稿、完整回歸、CURRENT_STATE與交付。

工作過長時，在一致可執行的子交付點停止。更新 `docs/M3_HANDOFF.md`：基準/目前SHA、已完成與未完成、契約決策、測試確切命令及收據、Pending、下一步、不可修改的保護檔。不宣稱背景繼續執行；不要因剩餘工作多就跳過測試或降級成停止後切換。

交付依 repository 已確認的提交/推送規則：只提交本輪相關變更，不 force push，不覆蓋使用者工作；有既有授權才推送，回報本地/遠端SHA與工作目錄狀態，失敗如實列出。

## 11. 參考與來源

專案基準與具體審查來源見 `M2_REVIEW_b79cdfc.md`。技術實作以安裝版本的型別與原始碼為準，不為此盲目升級依賴。

- Tone.js 官方 Transport 說明：https://github.com/Tonejs/Tone.js/wiki/Transport
- Tone.js 官方時間表示：https://github.com/Tonejs/Tone.js/wiki/Time
- W3C Web Audio Recommendation：https://www.w3.org/TR/webaudio-1.0/

官方 Transport 描述音樂時間、ticks與swing；本計畫的「共用映射、note-off同步、提交邊界」是針對此專案的設計決策，不是聲稱官方API自動完成。
