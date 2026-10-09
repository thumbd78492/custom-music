# ADR：M2 角色實例與樂句分工

日期：2026-10-09；實作前決策。範圍只限 M2 收尾增補。

現有 manifest.id 同時作為 Plugin、session 與音軌身分，無法容納兩位鋼琴手。
EnsembleIntent 的主奏／音域總量包含自身，雙主奏會自我避讓，也沒有公平領句紀錄。

採用最小加法契約：manifest 宣告 characters；每個角色宣告能力、樂句偏好及預設音域。
InstrumentInstance 含 pluginId／characterId／instanceId，Host 從 metadata 建立穩定的
`characterId:1` 舞台位置，每位置獨有 session、載入 ownership、voice 與音軌。
Plugin 的 state／propose／generate 可接收可選實例上下文；session 將 rootSeed 以
JSON tuple 納入三種身分與 Plugin 版本，全部生成用途沿用既有 PRNG，不依完成順序。
相同配置與生效小節操作維持事件可重現；不同實例有不同私有主題與歷史。

相容性：舊 Plugin 未宣告角色時提供單一 metadata 衍生角色；舊 Host Plugin ID 呼叫
只作預設角色的快捷解析。正式 UI、排程與操作收據均使用 instanceId，永不以 Plugin ID
建立音軌。createPluginSession 的舊單參數用法保留作既有單件／歷史診斷。
Piano 兩角色由自身入口選策略，發聲入口與 sampleBank 共用，沒有第二份 Plugin 或音檔。

第二交付：BarPlanner 持有通用 PhraseCoordinator，只在未提交小節依可聽 roster／共同
樂句重新分工；使用 metadata 任務能力、偏好、近期領奏紀錄與 Seed 選領句及回應者。
EnsembleIntent 加入可選 assignment（任務、時段、密度、音域）與 audibleLeadCount。
傳給各 session 的佔用聚合排除自身；其他主奏只在被分配發聲時段時貢獻活動。
Muted／Solo 隱藏／移除者不占名額，私有 state 仍按既有規則推進。
Coordinator 只分任務，不輸出音符，不識別具名樂器；Plugin 自己生成與保持主題。
音樂版本需升級，舊基準保留，不宣稱向後事件相容或人工驗收。

獨立音量為通用實例 gain，與 Mute／Solo 一樣在安全小節提交，不調高預設 Piano gain。
AudioEngine 繼續以捕捉的 Track ownership 清理，舊清理不能碰新實例。
CreativeDirectorPort 保留；未來可從角色 metadata／偏好宣告影響分工，本輪無 LLM API。
