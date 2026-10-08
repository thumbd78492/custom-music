# Electric Bass samples

Karoryfer Black And Blue Basses 的 Darkblack regular finger plucks，CC0。
8 個真實錄音，MIDI 36／40／43／47 各 soft／loud。
原始 mono24-bit44.1k WAV 轉 PCM16，使用一致力度層增益；不重採樣、不調音、
不合成。保留完整 5 秒撥弦衰減，共 3,528,352 bytes。

重現：`python scripts/import-samples.py bass`。
原始檔保留於 `.sample-sources/bass`。授權文字 `LICENSE-CC0.txt`；
原名、固定來源 commit、hash、轉換、力度與音高記錄在 `docs/sample-provenance.json`。

原始譜面音名高於實際發聲一個八度：本次使用 `darkblack_c3/e3/g3/b3`
錄音，依測得的基頻映射為實際 MIDI 36／40／43／47，輸出名稱採科學音名。
量測方法與結果見 `docs/sample-pitch-audit.json`，沒有把整個錄音移高八度。
