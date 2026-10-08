# ADR M1：通用排程與音訊生命週期

日期：2026-10-08。此決策先於 M1 共用 Host／Engine 修改記錄。

M0 的 Transport 時鐘與不可變小節維持不變。真實 samples 使載入取消、
長音停止和背景分頁恢復需要明確處理；以下均不依賴樂器名稱。

- Host 使用 request／voiceRequest／session epoch 辨識非同步擁有權。
  Remove 或 Stop 可立即取消 loading 狀態；過期的 import 或 sample Promise
  不得覆蓋新操作、移除新軌道或安裝 voice。不能中止瀏覽器的 dynamic import，
  因此忽略其過期結果。取樣下載取消由 track-scoped audio service 處理。
- 音符仍由 Transport callback 提供 audio time。已落後於 AudioContext 的音符
  直接略過，禁止補奏造成密集突發；音色與事件生成無耦合。
- Host 每次補充最多生成 32 個小節。背景恢復後仍按順序推進所有 generator
  state，但不提交過期小節；追上後從下一個未過期小節恢復。極長停頓可能有
  一段安靜的追趕時間，不重置 Seed 或跳過 generator state。控制命令的生效
  小節至少為目前 audio bar 的下一小節，且不早於已提交區域。
- Boundary lifecycle/UI 通知以 audio deadline 檢查的 timer 執行，停止時取消；
  不再依賴 requestAnimationFrame／Tone.Draw。此 timer 不觸發音符。
- Mixer 的 mute／stop／remove 使用 30 ms 線性淡出。移除立即從活躍 map
  脫離，實際 dispose 在淡出後執行，清理 closure 捕捉原 Track 身分。
  同 ID 立即重新加入不會被舊 cleanup 誤刪。Sample loading 立即取消；
  已發聲 voice 與 mixer node 在淡出後釋放。清理不依賴 Draw。
  Dispose timer 使用牆鐘等待 50 ms；若 AudioContext 已暫停，輸出本來就無聲，
  仍可清理。背景 timer 節流只會延後釋放記憶體，不會重新開啟輸出。

AudioEnginePort 與 InstrumentPlugin 的既有外部契約保持相容。新增的
TrackAudioServices.cancelPending() 是音訊層內部服務方法，只取消尚未完成的
sample loading，保留已存在 voices 以完成淡出；dispose() 仍負責完整釋放。

沒有更動音樂生成演算法、Seed 派生、LLM 接口或後續 milestone。
