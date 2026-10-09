# ADR：M3-A1 共用律動、播放時間與控制 timeline

日期：2026-10-09。基準 b79cdfc；保留 [角色實例 ADR](adr-m2-role-instances.md)。

BarPlan 增加可選 frozen GroovePlan，使舊固定事件與診斷 fixture 保持可讀。
新 BarPlanner 每小節建立共同純值：family、revision、四小節 cycle／variant、pulse／
accent、density／syncopation、fill／break。所有專用 Pattern／音符仍由各 Plugin 決定。
主奏只有限節奏／任務適配，保留私有主題；不改任何 sample、gain 或小提琴演奏策略。

MusicEvent 是 logical 作曲事件，PreparedPlaybackEvent 保留 eventIndex／原事件、
absolute onTick／offTick／grooveRevision。固定 PPQ 192（每小節 768 ticks），
Straight／Half-time 為 identity；Light Swing 使用單調拍內 r=0.6 的八分長短映射。
共同起止邊界相同，正音長與原本 detached 間隙維持；nominal off 不跨小節。
精確 warped duration 由通用 audio adapter 換算後注入既有 voice 的 secondsPerStep，
不更改 logical durationSteps、不把 source recording duration 當音樂時長。
Transport 全域 swing 固定 0；Mixer／小節／tempo 邊界維持 straight 時間。

ControlTimeline 以 immutable receipts 保存命令 ID／sequence／source／kind／target／
revision／requestedAtTick／effectiveBar／effectiveTick／planVersion／status。
Groove 請求取同一次 requestedAtTick 快照，在 Host 選擇
max(planner.nextBarIndex,floor(requestedAtTick/768)+1)；不撤回任何已提交
音訊或重算已推進的 state。未提交 accepted 命令同 kind latest-wins、舊者 superseded；
提交成 scheduled，實際邊界 completed。A1 是離散邊界切換，transitionLengthBars=0，
不是聲稱已具 Style 漸變。未來 A2 與 LLM 從同一控制 port 延伸，stale revision 被拒絕。
Stop 取消在途狀態並保留收據；玩家重新 Start 才依既有規則重播，Groove 本身不 Stop。

R4 故障與刻意 Mute Solo 分開：失敗角色排除可聽 roster；必要的健康生成重規劃需
session checkpoint，限定一輪恢復，state 只提交一次，不無限重試故障角色。
細節與實際測試結果記於 M3_HANDOFF／CURRENT_STATE。人工品質保持 Pending。
