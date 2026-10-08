# Drums Plugin — M1

Virtuosity Drums 真實錄音。`generator.ts` 保留 M0 的 Kick／Snare／Hi-hat
節奏與 Seed 事件；`voice.ts` 擁有力度層選擇及交替 Hi-hat 錄音邏輯，
不依賴其他樂器。每次起音使用獨立 source／gain，重擊不改變前次尾音的力度。

Kick 兩層、Snare 三層、閉合 Hi-hat 兩層各兩次錄音。鼓擊播放自然尾音；
Stop／Remove 以包絡與 mixer 淡出，立即取消未來起音。Hi-hat 的交替計數僅
存在此 voice，Start 重建時重置，不改動 MusicEvent 或 Seed 生成器。

`npm run test:isolation -- drums`；工作台 `/?instrument=drums`。
新增鼓件、mapping 或演奏規則只修改本目錄，不需要 Host 的樂器特殊分支。
授權與逐檔對應見 `docs/SAMPLE_LICENSES.md#drums`、`docs/sample-provenance.json`。
