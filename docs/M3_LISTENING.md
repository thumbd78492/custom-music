# M3-A1 短稿與人工複聽

2026-10-09；引擎 m3.a1，Seed alpha，Balanced，**固定 96 BPM／4/4**。
保留五角色、雙鋼琴、雙主奏與所有原 sample gain（Violin -9 dB）。
每份 73.6 秒（29小節＋尾音），Master0.65，無 Normalize／limiter／compressor。
人工自然度、Groove 差異、主奏存在感與長時間品質全部 **Pending**。

## 完整編曲比較

鼓、Bass、伴奏鋼琴以自身 Pattern Family 解讀共同 Groove；主奏只有限呼吸／問答適配。
Half-time 改 backbeat／起音分布／延留，BPM 始終96。

| 稿件                                                                                                              | Full Peak dBFS | 人工結果 |
| ----------------------------------------------------------------------------------------------------------------- | -------------: | -------- |
| [Straight](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/arranged-straight-full.wav)       |         -9.626 | Pending  |
| [Light Swing](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/arranged-light-swing-full.wav) |        -10.629 | Pending  |
| [Half-time](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/arranged-half-time-full.wav)     |         -9.658 | Pending  |

## 同一事件的 timing-only 診斷

這三份先生成同一 Straight 編曲，再只替換共同時間映射；logical events hash 相同，
theme IDs／任務／gain 相同。Light Swing 同時移動 note-on／off，Straight 與 Half-time
在這項診斷的 timing 為 identity；Half-time 的拍型差異應聽上方完整編曲稿。

| 稿件                                                                                                                             | Full Peak dBFS | 人工結果 |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------: | -------- |
| [Straight timing-only](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/timing-only-straight-full.wav)       |         -9.626 | Pending  |
| [Light Swing timing-only](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/timing-only-light-swing-full.wav) |        -10.154 | Pending  |
| [Half-time timing-only](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/timing-only-half-time-full.wav)     |         -9.626 | Pending  |

每份完整 JSON 與五條 stems 位於同一 [音訊目錄](../.verification/m3-a1-2026-10-09/listening/2026-10-09T06-24-26-400Z/summary.json)。
stems suffix：bass、drums、piano-melody、piano-accompaniment、violin-melody。
每次 Full 由同一 multichannel render 的 Float32 stems 加總，獨立 PCM16 量化，
沒有為各 stem 重新 Solo 作曲。[獨立 readback](../.verification/m3-a1-2026-10-09/listening-audit-final.json)
確認六份加總最大差2整數單位（預先門檻3），0滿刻度樣本。

額外 exploratory「獨立渲染 PCM hash 必須完全相同」檢查失敗，
[原失敗 log](../.verification/m3-a1-2026-10-09/listening-audit-first-failure.log) 保留。
Straight／Half-time timing-only 的 logical／playback events 完全相同，Full3245760個
PCM16樣本中17個相差1單位，其他聲部 readback 見 audit。事件／tick 的重現性承諾
不等於不同 native OfflineAudioContext 的 PCM bit-perfect；沒有修改必跑測試門檻。

## Live 證據與品質邊界

[Live Transport 收據](../.verification/m3-a1-2026-10-09/live-transport.json)／
[播放畫面](../.verification/m3-a1-2026-10-09/live-groove.png)：實際 UI 連續快切，
pending／committed／completed 與 superseded 收據，Mute／Solo，音訊 suspend／resume。
Start1／Stop0、5 voices／tracks，Seed不變，同一 Context／Transport，三種 Groove
皆呼叫原 sample voice；不是離線 WAV 代替播放中操作。

純 Transport callback timestamps、三軌同步、48kHz合成 impulse on／off render
量化、原小提琴連奏／同音 source 延續／Stop 前綴另有 E2E 收據。
callback timestamp 精度不等於牆鐘 callback arrival jitter；真實取樣音頭延遲不拿來
當 scheduler jitter。每份稿的 theme IDs／分工／logical/playback／版本／gain 都在 receipt。
原生 Edge 真實背景分頁測試仍失敗：初始頁面 hidden，尚未進入播放；
Live suspend/resume 通過不代替這項驗收，詳見 M3_HANDOFF。
四Seed各10分鐘人工聆聽與長時間自然度 Pending。
多曲風轉場尚未實作，屬下一個必做 M3-A2。
