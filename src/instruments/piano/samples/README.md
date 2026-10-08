# Piano samples

VCSL Kawai grand piano，CC0。7 個根音 × soft／loud 共 14 個真實錄音，
各 8 秒 Mono PCM16／44.1 kHz；總大小 9,879,016 bytes。兩層分別使用一致增益，
沒有逐檔正規化、重新合成或重採樣。截尾處 150 ms cosine fade。

`index.ts` 是唯一音高／力度 mapping；原檔 C3 是 MIDI 60，不是 MIDI 48。
保留官方 SFZ 的每層微調音分。取得未來素材時不得根據檔名猜八度。

重現：`python scripts/import-samples.py piano`。
原始完整錄音保留於 `.sample-sources/piano`，不進入 build。
逐檔 URL、hash、轉換與限制見 `docs/sample-provenance.json`。
授權文字在本目錄 `LICENSE-CC0.txt`；詳見 `docs/SAMPLE_LICENSES.md#piano`。
