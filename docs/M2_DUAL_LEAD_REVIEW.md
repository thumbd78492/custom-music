# M2 收尾短稿：雙主奏與雙鋼琴（人工驗收 Pending）

日期：2026-10-09；音樂版本 m2.2；Piano 0.2.0、Violin 發聲 0.2.2。
使用者最新回饋是小提琴發聲明顯改善；本輪保存為基準，沒有重開取樣音色問題。
新旋律鋼琴、雙主奏的存在感與五角色平衡未經使用者確認，均為 Pending。

## 短版稿件與同次分軌

alpha／Balanced、22050 Hz stereo PCM16；真實 Samples、原 voice、Master 0.65。
沒有 Master Normalize、limiter、compressor，Piano gain -8、Violin -9、Bass -12、Drums -6 dB。
這是按 audio time 逐小節 refill 的 OfflineAudioContext 渲染，不是即時 Transport 錄音。

| 稿件                                                                                                                  |    長度 |   Full Peak |    Full RMS | 人工結果 |
| --------------------------------------------------------------------------------------------------------------------- | ------: | ----------: | ----------: | -------- |
| [旋律鋼琴獨奏](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/melody-piano-full.wav)     | 46.83 s | -15.01 dBFS | -31.64 dBFS | Pending  |
| [鋼琴與小提琴雙主奏](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/equal-duet-full.wav) | 78.30 s | -15.09 dBFS | -34.36 dBFS | Pending  |
| [五角色 Full](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-full.wav)         | 78.30 s | -10.33 dBFS | -29.77 dBFS | Pending  |

五角色分軌來自同一次 multichannel render，沒有各自重新生成，也沒有 Solo 後重新作曲。
Full 由相同 Float32 stems 加總再 PCM16 量化。各 WAV 分別量化後相加可能有微小誤差，
並非換了演奏。診斷時維持播放器與裝置音量固定。

| 五角色 stem                                                                                                               | RMS dBFS | Peak dBFS |
| ------------------------------------------------------------------------------------------------------------------------- | -------: | --------: |
| [旋律鋼琴](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-piano-melody.wav)        |   -35.03 |    -15.09 |
| [伴奏鋼琴](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-piano-accompaniment.wav) |   -41.58 |    -21.13 |
| [旋律小提琴](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-violin-melody.wav)     |   -42.87 |    -27.30 |
| [貝斯](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-bass.wav)                    |   -34.91 |    -21.13 |
| [鼓](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/five-role-drums.wav)                     |   -35.27 |    -14.00 |

雙主奏另附 [Piano](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/equal-duet-piano-melody.wav)
與 [Violin](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/equal-duet-violin-melody.wav) stems。
[事件、分工、BPM／和聲、原始量測、WAV／PCM SHA-256](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-29-10-315Z/summary.json)。
RMS 不相等不是對等主奏的驗收標準；也不能用領句次數替人耳判斷掩蔽與存在感。

[事件與 WAV 分軌核對](../.verification/m2-dual-role-2026-10-09/arrangement-audit-final.json)：
32 小節中，Violin 領句起點為 0／8／16／24，Piano 為 4／12／20／28，皆有完整領句及回應。
實際旋律 Piano 為 62–67、Violin 73–81；伴奏 Piano 為 61–69、每次最多兩音，Bass 37–47。
五條 PCM16 stems 加總與 Full 最多相差 2 個整數單位，小於六次量化的 3 單位上限。
這只證明分工／音域與同次分軌來源，不等於對等存在感的人工驗收。

最終稿修正了疏鬆貝斯意圖被合奏平均稀釋後，伴奏仍補低音根音的判斷。
[首批短稿收據](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T04-56-43-299Z/summary.json)
與 [首次完整回歸重製收據](../.verification/m2-dual-role-2026-10-09/listening/2026-10-09T05-17-21-693Z/summary.json)
均保留；新快照不是驗收。最終事件只有伴奏 Piano 相對首批改變，其他四位事件一致；
不保證各次瀏覽器渲染 PCM bit-perfect，各稿 Full 只與自己的同次 stems 比較。

## 人工複聽表

先聽短稿，再依使用者確認安排後續長時間品質驗收；目前沒有自動勾選或擅填時長。

| 檢查                                                       | 結果／時間點 |
| ---------------------------------------------------------- | ------------ |
| 旋律鋼琴有能記住的短主題，重複／變奏與休止自然             | Pending      |
| 能清楚分辨旋律鋼琴與貝斯的演奏任務                         | Pending      |
| 多個樂句中，Piano 與 Violin 各有完整領句及回應的存在感     | Pending      |
| 一方短句／另一方支撐長音與共同句尾自然，不互相搶或一起退讓 | Pending      |
| 伴奏鋼琴支撐和聲，沒有堆低音、裝飾或搶主奏音域／拍點       | Pending      |
| 小提琴保持最新改善的發聲，沒有新的音符進出／響度問題       | Pending      |
| 一位主奏、只有伴奏鋼琴、無鼓／無貝斯仍音樂合理             | Pending      |
| Mute／Solo／移除後重新分工自然，Stop／重啟與背景恢復正常   | Pending      |

## 可證明與待確認的範圍

自動事件測試涵蓋每位領句與回應、自己的意圖排除、所有非空角色子集合、
三模式／四 Seed／固定操作及反向載入重現。Piano-only 實體 fixture 包含雙角色測試。
Piano 自有兩小節主題與單音策略，音域 62–76，現有根音 60–72，最近移調最多四個半音；
領句 0.64–0.74 內採穩定 Loud 層，沒有提高 -8 dB 預設 gain。
低頻聲部存在時伴奏 rootless／兩音配置，雙主奏時降低上緣、裝飾與密度。
這些都是工程或結構證據，沒有宣告音樂品質通過。

[舊程式與音訊基準](../.verification/m2-dual-role-2026-10-09/baseline/freeze.json)、
[先驗證多實例的階段一收據](../.verification/m2-dual-role-2026-10-09/phase1-results.json)。
初次隔離測試／HMR 干擾的瀏覽器失敗與全部嘗試仍保留在本輪收據目錄，
完整工程結果以 [CURRENT_STATE](../CURRENT_STATE.md) 最終收據為準。
M3–M5 保留，本輪不開始 M3，沒有伴奏小提琴、動畫或 LLM API。
