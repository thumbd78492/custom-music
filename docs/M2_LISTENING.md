# M2 人工聆聽驗收 — Pending

2026-10-09。工程驗證、RMS／Peak 量測與離線 WAV 渲染不代表人耳音樂品質通過。
已收到的 M1 回饋是 Bass 過大、Violin 過小；修正後尚待重新聽。

## 連續聆聽

1. 啟動本地 App，Stop 後輸入 Seed，選 Balanced，加入四件再 Start。
2. 四個 Seed 各連續聽完整合奏至少 10 分鐘。此輪不要用四件 Solo 切割合奏時間；
   另外安排獨奏／操作測試。畫面顯示實際 BPM、調性、和弦、段落與能量。
3. 每次聽到新段落，記錄時間與小節：速度變化是否有理由、和弦是否自然接續、
   旋律是否有可辨認主題及變奏、鼓與 Bass 是否呼應、鋼琴是否留出主奏空間。
4. 特別注意長時間是否仍像同一個四小節 Loop、過度單調／突兀、短 arco 音頭是否
   不自然、長音 loop／換音是否可聞，以及 Bass／Violin 音量是否合適。
5. 另測每件 Lab；合奏進行中 Mute／Solo／移除／加入，觀察 pending 小節。
   Stop 後應淡出歸零；再次 Start 應重現。切到背景後恢復應接回拍點，不補奏舊 attacks。
6. Balanced 合格後可複聽 Subtle／Experimental，比較穩定性與變化幅度。

## 紀錄

| Seed  | 模式     | 最低連續合奏時間 | 開始／結束、裝置與聆聽者 | 結果    |
| ----- | -------- | ---------------- | ------------------------ | ------- |
| alpha | Balanced | 10 分鐘          | 未填                     | Pending |
| beta  | Balanced | 10 分鐘          | 未填                     | Pending |
| 音樂  | Balanced | 10 分鐘          | 未填                     | Pending |
| 0     | Balanced | 10 分鐘          | 未填                     | Pending |

| 檢查                                                        | 結果／時間點／小節 |
| ----------------------------------------------------------- | ------------------ |
| Bass 不掩蓋合奏；Violin 清楚而不尖銳                        | Pending            |
| 速度改變自然、共享拍點穩定                                  | Pending            |
| 調性與和弦變化合理，轉調落地可辨認                          | Pending            |
| 主題可記住、有重複與變奏、留白自然                          | Pending            |
| Groove／Fill 與 Bass 重音呼應                               | Pending            |
| Introduction／Main／Variation／Breakdown／Return 有可聽區別 | Pending            |
| 10 分鐘保持風格一致且沒有無意義重複／疲勞                   | Pending            |
| Samples 自然、Click／Pop、Release、Stop、背景恢復           | Pending            |

問題請附 Seed、模式、時間／小節、樂器、操作序列，以及可否重現。

## 離線試聽稿

瀏覽器測試 `tests/e2e/listening.spec.ts` 會生成 `alpha` Balanced 的 10 分鐘 WAV
與 `plan-and-metrics.json`，位置為 `.verification/listening-<UTC timestamp>/`。
檔案含段落開始秒數／小節、BPM、調性、完整事件與混音量測。
使用真實 Samples／voice 包絡、22050 Hz stereo PCM、Master 0.65，未 Normalize、
未經 limiter；不是 live Transport 錄音。這份稿可用於連續音樂複聽；
安全操作、背景恢復與即時播放仍需 App 驗證，不能只聽 WAV 即全部核可。
