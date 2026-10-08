# ADR-003：可取消的通用錄音取樣播放器

M1 在維持 `InstrumentPlugin`、`MusicEvent` 與生成器不變的前提下，擴充
`SampleBank` 的可選 region、attack、gain、polyphony 與單音換音設定。
每個 Plugin 擁有檔案、音高／力度 mapping、loop 切點與演奏參數；Host
及音訊服務不認識任何樂器名稱。

既有 Tone Sampler/Players 工廠無法可靠取消 HTTP 請求，也不足以描述各音檔的
持續音 loop。改由同一 Tone context 提供原生 AudioBufferSourceNode 和 GainNode，
以 Web Audio 時間排程起音、音長、淡出與停止。Transport 仍是唯一演奏時鐘。
原有 synth 工廠保留供契約相容性使用；M1 Plugin 不使用 fallback。

HTTP／decode 任一失敗即拒絕整個該件 voice；不將部分載入視為成功。每次
track 載入持有 AbortController，取消、timeout 或失敗會中止同批請求。decode
本身不可中止，完成後透過 abort 檢查丟棄，不能安裝到已取消的 track。
已解碼 buffers 只存在於該 voice，不設全域素材快取，dispose 清空引用。

每次起音均有獨立 source 和 gain，避免鼓組重擊改到前一次的力度。有限 polyphony
防止資源無界增長；逐音 `onended` 斷開節點。Stop 的強制淡出由 mixer 統一處理，
正常 note-off 的自然尾音與單音換音長度由 Plugin 的 bank 決定。
