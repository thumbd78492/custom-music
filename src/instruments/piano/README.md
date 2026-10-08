# Piano Plugin — M1

獨立 Kawai 鋼琴 Plugin。`generator.ts` 保留 M0 的 Seed 琶音事件；
`samples/index.ts` 擁有 14 個錄音、MIDI 60–72 的 7 個根音與兩層力度，
`voice.ts` 只使用 Host 注入的通用 sample factory。和弦複音互不切斷。

音長由 MusicEvent 決定，note-off 後 0.7 秒淡出；按住時使用錄音本身的衰減。
精簡素材最長保留 8 秒聲音，不假造無限鋼琴延音。音量與音色皆隨力度改變。
沒有踏板 UI 或 MIDI CC 接口。本階段不新增作曲規則。

`npm run test:isolation -- piano` 可在其他三件 Plugin 不存在的實體 fixture 測試。
`/?instrument=piano` 是單件工作台。修改本件只需了解共用 Contracts、
AudioServices 與本目錄；不得 import 其他樂器。

來源、授權與完整檔名對應見 [授權紀錄](../../../docs/SAMPLE_LICENSES.md#piano)
與 [逐檔來源](../../../docs/sample-provenance.json)。
