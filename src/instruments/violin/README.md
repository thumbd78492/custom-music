# Violin Plugin — M2

獨立 VSCO 2 CE 真實小提琴 Plugin；Lily Lyons 演奏的 arco vibrato 錄音。
Generator 使用私有 2–4 小節 Motif Memory，保存節奏／音階音程，依共同和聲重現、變奏或更新主題。MIDI 69–84，含休止，並依高音域佔用留白。gainDb -5；音量候選仍待人工複聽。

`samples/index.ts` 擁有 5 個根音、兩層力度、1.2–3.2 秒持續音 loop、
45 ms attack、350 ms release、90 ms 單音換音淡出。loop seam 在素材準備時
使用 150 ms crossfade，voice 使用共同 audio time 播放；沒有自己的節拍 timer。
聲音來自真實錄音。換音以包絡交疊改善，沒有宣稱錄製的真實 legato 轉音。

`npm run test:isolation -- violin` 與 `/?instrument=violin` 可獨立工作。
本件無其他樂器依賴；素材載入失敗會拒絕 voice，無 synth fallback。
長音與轉音自然度的人工聆聽仍 Pending，見 `docs/M2_LISTENING.md`。
