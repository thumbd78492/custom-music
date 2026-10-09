# Violin Plugin — M2

獨立 VSCO 2 CE 真實小提琴 Plugin；Lily Lyons 演奏的 arco vibrato 錄音。
Generator 使用私有 2–4 小節 Motif Memory，保存節奏／音階音程，依共同和聲重現、變奏或更新主題。MIDI 69–84，含休止，並依高音域佔用留白。gainDb **-9**，Plugin `0.2.2`；前稿音符進出／同一旋律響度兩項人工回饋未通過，新短稿待複聽。

`samples/index.ts` 擁有 5 個根音、兩層力度、1.2–3.2 秒持續音 loop、
350 ms release。`performance.ts` 使用已測量較穩定的固定 Loud 單層，原 velocity
仍控制演奏增益；不再同時混合兩份不同包絡／相干性的錄音。
`regions.ts` 擁有各根音的有效音頭 offset 0.03–0.16 s 與固定音頭衰減；
Detached／Rebow 保留音頭，80 ms attack／transition，連奏維持 1.2 s 起播、
70 ms equal-power crossfade，相連同音延長既有 Source。
Region gain 依實際 MIDI／速率／offset／音長／奏法比較校準，Loud 全部是衰減。
沒有 Compressor、Master Normalize 或逐窗自動調平；sample bytes 不變。
本輪 Generator／Motif、演奏事件、其他三件與共用播放器均未修改。
loop seam 在素材準備時
使用 150 ms crossfade，voice 使用共同 audio time 播放；沒有自己的節拍 timer。
聲音來自真實錄音。沒有 Pitch Glide，也沒有宣稱錄製的真實 legato 轉音。

`npm run test:isolation -- violin` 與 `/?instrument=violin` 可獨立工作。
本件無其他樂器依賴；素材載入失敗會拒絕 voice，無 synth fallback。
逐音 20／100 ms 包絡、單因素 A/B、完整回歸及人工複聽見
`docs/M2_VIOLIN_DIAGNOSIS.md` 和 `docs/M2_LISTENING.md`。
