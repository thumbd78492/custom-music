# 未來創意指令入口

M0 只提供 `CreativeIntent`、`CreativeDirectorPort` 型別與離線 `LocalRuleBasedAdapter` 範例。`calm`／`bright` 對應高層意圖，未知輸入回傳空意圖；目前不接 UI 或修改固定 Director。

未來流程：輸入 → port → 驗證並限幅 CreativeIntent → 在安全段落排程 → Director → BarPlan → Plugin → MusicEvent。

LLM 不可持有 AudioContext、改寫 Plugin、直接發出低階音符或進入 audio callback。外部 adapter 的 timeout、錯誤 fallback、成本與使用者同意屬 M5；本輪沒有 API 呼叫、模型 SDK、金鑰、後端或假的外部接線。

精細指定角色須透過 manifest capability 的宣告式映射，而不是加入具名 Plugin if/switch。
