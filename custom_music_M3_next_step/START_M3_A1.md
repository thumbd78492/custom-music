請繼續 custom-music，進入 **M3-A1：律動引擎與播放中切換律動**。本輪不要一次做完全部 M3。

先閱讀 repository 的 plan.md、CURRENT_STATE.md、ARCHITECTURE、角色實例 ADR，以及本次提供的 M2_REVIEW_b79cdfc.md、M3_IMPLEMENTATION_PLAN.md。審查基準為 b79cdfc；若 HEAD 已前進，先核對差異，不回退或覆蓋使用者修改。

### 1. 基線與計畫

保留 M2 的五角色、雙鋼琴獨立實例、雙主奏分工、小提琴目前發聲設定及 -9 dB。不要重新做音色平衡，也不要把人工品質 Pending 改為通過。

將新需求正式增補到 repository 的 plan.md：A1 律動、A2 播放中曲風轉場、B 長期主題發展、C Session 重播與匯出；保留 M4 UI/品質與 M5 LLM。不要用上傳的舊 plan 覆蓋新版。

先執行相關基線測試。針對 review R4，驗證唯一 Solo 角色 propose/generate 失敗時健康角色能否接手；與使用者刻意 Mute Solo 分開。重現後局部修正並加測試，不無限制重試或重複推進 state。

### 2. 本輪音樂目標

先完成 Straight、Light Swing、Half-time 三種 Groove。在相同 BPM 下就能聽出差異；Half-time 不是把 BPM 除以二。

鼓、貝斯、伴奏鋼琴都須真正適配共同律動。加入適量切分、Ghost Notes、跨 2–4 小節的節奏變奏、Fill/Break；不要每小節亂抽，或只改音量。主奏保留既有主題，做有限的節奏適配與問答布局變化，不全面重寫旋律。

每個樂器仍自己決定音符與專用 Pattern，禁止互相 import；核心只提供共同律動、任務及時間語意，不寫具名樂器分支。

### 3. 播放中操作是必要條件

新增播放中可操作的 Groove 控制，立即接受請求，在最近未提交、安全的小節生效並顯示 pending/生效位置。禁止 Stop/Start、重建 Director/AudioContext、重設 Seed、角色實例或主題。

請求需經通用控制 timeline，保存 command ID、順序、target、revision、requested tick、effective bar/tick 與處理狀態。快切時合併未提交的舊請求，保留 superseded 紀錄；已提交內容不可回寫。未來 Style 與 LLM 沿用此機制。

M3-A2 的「演奏中曲風轉換」仍是下一個必做交付；不能改成停止後選曲風，也不能拖到 M5 才實作。本輪先完成同一基礎上的 Live Groove，不宣稱已完成多曲風。

### 4. 音訊時間必須做對

依 M3_IMPLEMENTATION_PLAN.md 第 5.4 節，分開 logical MusicEvent 與實際 PlaybackEvent。統一映射 note-on、note-off；保持正音長、原本合理的連奏/休止與小節邊界，不能只移動起音而保留錯誤音長。

所有角色使用同一 Transport。不要同時啟用全域 Swing 與自訂偏移，不用各 Plugin 的 timer，不以降低 Sample playbackRate 改節奏。混音控制/小節起點/tempo automation 不跟著 Swing 移動。

先維持 4/4、每小節固定 BPM及既有跨小節變速；不加入 tempo ramp、換拍號或任意跨小節 note-off。小提琴素材、校準、起播與演奏包絡維持原基準；新時序需補連奏回歸。

### 5. 交付與停止點

新增純 timing、相同 Seed/操作重現、已提交計畫不變、播放中連續快切、角色增減/Mute/Solo、背景恢復與小提琴連奏測試。保留雙鋼琴及四件實體隔離，新增內容不能靠移除舊測試通過。

先輸出 60–90 秒同 Seed/固定 BPM 的三種 Groove 比較、同事件只改 timing 的診斷稿，以及 Live Transport 切換證據。Full/stems 由同次事件產生，不重新 Solo 作曲，不 Normalize。離線 WAV 不能代替播放中操作測試。

執行 Typecheck、Vitest、Build、四件隔離、瀏覽器 E2E、Lint/Format；回報實際命令、結果與收據，未執行者標 Pending。人工音樂品質保持獨立。

若工作過長，在可執行的子交付點更新 docs/M3_HANDOFF.md，記錄 SHA、已完成項目、契約決策、測試及下一步，不假裝背景繼續工作，也不降級成只能停止後切換。

依 repository 既有授權與規則提交/推送本輪相關變更，禁止 force push，核對遠端 SHA。最後更新計畫與 CURRENT_STATE，列出 A1 完成度和 A2 接續工作，然後停止，不自行開始 A2/M3-B/C/M4/M5。

請簡述最小模組變更後直接實作；不要只再交一份計畫。
