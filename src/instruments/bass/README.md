# Electric Bass Plugin — M2

Karoryfer Darkblack 真實空心電貝斯手指撥弦錄音；本件未使用來源庫的合成／加工假奏法。
`generator.ts` 依共同和弦與匿名 Kick 重音選擇低音，加入五度、八度、切分與經過音；每小節 2–4 音，低音域繁忙時減少密度。gainDb -12。
`samples/index.ts` 擁有 MIDI 36／40／43／47 各兩層力度的錄音。

音符依 MusicEvent 音長停止延續，note-off 使用 180 ms 阻尼淡出；新撥弦會以
35 ms 淡出上一音，避免低音互相堆疊。每件素材完整 5 秒，無持續 loop。
沒有依賴鼓手或其他 Plugin；Host 不辨識低音專屬邏輯。

`npm run test:isolation -- bass`；工作台 `/?instrument=bass`。
授權、hash 與完整素材對應見 `docs/SAMPLE_LICENSES.md#bass`、`docs/sample-provenance.json`。
