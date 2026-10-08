# M2：共用計畫、匿名協作與小節速度

2026-10-09：本次使用者明確授權在修正 M1 音量後開始 M2，並將 Motif Memory
提前納入本次範圍。舊版計畫的人工聆聽關卡仍保留為品質驗收，不阻擋已授權實作。

## 邊界

Director 只產生和聲、段落、速度、密度與主題發展提示；不輸出任何樂器音符。
BarPlan 增加音階、下一和弦音級、段落位置／長度、phrase 與發展提示。
Generator 自己保有主題、音域、轉位與節奏策略；不得匯入其他 Plugin。
EnsembleIntent 增加匿名低頻節奏重音，讓任何提供此能力的聲部參與協作。
主奏活躍度以 max 聚合，避免四件合奏時被平均成四分之一；音域負荷排除打擊音色。

## 速度

4/4 每小節 BPM 固定，僅在段落邊界小幅階梯變速，M2 不使用小節內 ramp。
Tone Transport 是唯一時鐘。currentBar 讀取 immediate audio time 的 Transport ticks，
避免 Tone.now lookahead 讓操作提早跨越邊界。已提交事件皆用 ticks 排程。
在提交小節時提前安裝 BPM automation，使用 TickParam.getDurationOfTicks 將未來
tick 邊界換算成 audio time；不能在音符 callback 才改 BPM。
音長不得跨越小節，release 仍為聲部自有秒數尾音。
背景停頓若跨過尚未提交的速度變化，不回寫過去 automation；保持原 clock 追趕 state，
在第一個未來安全小節恢復計畫 BPM。可重現的是音樂／tempo plan，不是凍結時的牆鐘。

## 和聲與主題

條件式段落轉移，8–16 小節段落、4 小節樂句。以調內功能進行及近系／關係調轉調；
轉調前保留共同和弦作 pivot，接新調 dominant，再落 tonic。
主題以 plugin 私有的節奏與相對音階音程保存，2–4 小節；重現、變奏、Return 引用
原主題或產生新主題。Director 不持有 ViolinState。

## 相容性與驗收

引擎音樂版本更新為 m2.1；M0 golden 不再用於檢查 M2 的作曲輸出，保留原 fixture
作 M1 歷史收據，新增 M2 長程 deterministic／多 Seed／協作／真實時鐘測試。
真實 Samples、voice 生命週期、Stop、取消載入與安全操作測試繼續保留。
CreativeDirectorPort 維持高層介面，沒有 LLM API。
工程測試、RMS／Peak 量測、10 分鐘人工聆聽三者分開記錄。
