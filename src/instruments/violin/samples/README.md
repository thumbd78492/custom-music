# Violin samples

VSCO 2 Community Edition Solo Violin Arco Vibrato，CC0。
MIDI 72／76／79／81／84 各 soft／loud，共 10 個 Mono PCM16／44.1 kHz 檔案，
各 3.3 秒，合計 2,911,040 bytes。

持續區間是原錄音 1.2–3.2 秒，尾端 150 ms crossfade 接回前端。
loop 後的檔尾 50 ms fade 不在循環內。原始運弓結束尾音沒有包含在精簡檔案；
note-off 使用本件的 release 包絡。機械檢查已確認 loop 非靜音與邊界連續性，
不等於人耳確認自然度。

重現：`python scripts/import-samples.py violin`。
原始完整錄音在 `.sample-sources/violin`；每檔 hash、來源、loop metrics 與轉換命令
在 `docs/sample-provenance.json`。授權文字 `LICENSE-CC0.txt`，完整紀錄
`docs/SAMPLE_LICENSES.md#violin`。
