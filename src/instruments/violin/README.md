# Violin Plugin — M2

獨立 VSCO 2 CE 真實小提琴 Plugin；Lily Lyons 演奏的 arco vibrato 錄音。
Generator 使用私有 2–4 小節 Motif Memory，保存節奏／音階音程，依共同和聲重現、變奏或更新主題。MIDI 69–84，含休止，並依高音域佔用留白。gainDb **-9**，Plugin `0.2.1`；人工音質驗收 Pending。

`samples/index.ts` 擁有 5 個根音、兩層力度、1.2–3.2 秒持續音 loop、
45 ms detached attack、350 ms release。`performance.ts` 決定弓段、連奏、平滑力度層：
近距離相連音從穩定區起播、70 ms equal-power crossfade，同音延長既有 sources。
兩層連續混合並按持續區 RMS 校準，不硬切 velocity 0.6；sample bytes 不變。
Motif 增長音長、分組換弓與句尾呼吸，和弦音是偏好，維持近距離旋律連接。
loop seam 在素材準備時
使用 150 ms crossfade，voice 使用共同 audio time 播放；沒有自己的節拍 timer。
聲音來自真實錄音。沒有 Pitch Glide，也沒有宣稱錄製的真實 legato 轉音。

`npm run test:isolation -- violin` 與 `/?instrument=violin` 可獨立工作。
本件無其他樂器依賴；素材載入失敗會拒絕 voice，無 synth fallback。
音訊測試、同 Seed A/B 與人工複聽表見 `docs/M2_VIOLIN_REVIEW.md` 和 `docs/M2_LISTENING.md`。
