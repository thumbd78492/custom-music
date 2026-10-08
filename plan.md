# Generative Ensemble — 開發計畫（plan.md）

> 版本：v0.1 | 日期：2026-10-08 | 專案定位：類 Incredibox 的可互動、持續變化的即興樂團 Web App
>
> 第一版樂器：**鋼琴 Piano、小提琴 Violin、鼓組 Drums、電貝斯 Electric Bass**。

## 2026-10-09 範圍補充

本次依使用者明確要求，先修正 M1 Bass／Violin 平衡，再進入 M2；將原 M3 的
Motif Memory 提前納入本輪，加入動態 BPM／調性／段落與三種變化模式。
不擴展到 M4 UI、事件匯出或 LLM API。人工 10 分鐘品質驗收保持獨立。

## 0. 目標與完成定義

玩家透過拖放或點選加入／移除樂器，樂團以同一節拍、調性與和弦即時生成音樂。音樂會記住主題、依段落變奏，而且樂器彼此在節奏、音域與密度上協調。**不是**循環播放幾首預錄歌曲，也不是把音符完全隨機排列。

### v1 必須做到

1. 四種樂器都能**單獨載入、單獨演奏、單獨開發與單獨測試**；亦能任意組合合奏。
2. 各樂器以真實樂器 **samples** 發聲；若開發中以合成音暫代，必須標示為 placeholder，不能視為 v1 音色完成。
3. 即使只啟用一種樂器，仍能使用共用的 BPM、調性、和弦計畫獨奏，不依賴鼓手或其他樂器存在。
4. 樂團共享音樂結構，以受限隨機生成與主題變奏，無限持續演奏而不斷複製固定的四小節錄音。
5. 加入、移除、靜音與 Solo 在安全的小節邊界生效，不破壞音訊同步。
6. 同一 Seed、設定、引擎版本與操作事件序列，可重現相同**音樂事件**；聲音輸出在不同瀏覽器／裝置不保證 bit-perfect。
7. 主程式沒有任何 `if (instrumentId === 'piano')`、`switch (instrumentId)`、硬寫四種樂器的 import 或樂器特有演奏演算法。
8. 預留未來 LLM 的高層創意指令入口，但 **MVP 離線可用、無後端、無 API key、無 LLM 依賴**。

### 明確不做（v1）

- 完整人聲／歌詞、語音模型、歌曲輸出成正式錄音檔、雲端帳號、多樂器複雜 MIDI 編輯器。
- 完全逼真的小提琴運弓模擬；v1 以挑選適當持續音取樣、音量包絡及連奏間距改善自然度。
- 每個曲風都完整支援；先完成 **Lo-fi／輕爵士風格** 與 **4/4**，再擴充。
- 在音訊排程回呼內執行 LLM 推論或大量生成運算。

## 1. 絕對架構約束（最高優先級）

### 1.1 Plugin-first／Host-agnostic

- **主程式（Host）**只管理 plugin 發現／載入、狀態、共用音樂時鐘、演奏事件排程、Master Mixer、簡單 UI。
- 每種樂器是**獨立目錄、獨立邏輯、獨立音色素材**的 plugin。其對外入口只有 `index.ts` 及 `InstrumentPlugin` 合約。
- 某一樂器可以使用 `contracts` 與 Host 提供的服務，但**不得 import 其他樂器**，亦不得依賴其他樂器輸出的專用資料型別。
- 單獨修改 Violin 時，只需閱讀／執行 **Host + 共用契約 + Violin 模組（及其自身素材）**。不需載入 Piano／Drums／Bass 的程式碼。
- 加入第五種樂器：**新增一個符合契約的 plugin 目錄與素材即可**，不用改 Host、Music Director、Mixer、Scheduler 或寫新的 UI 分支。
- 所有樂器的專屬參數（例如 `bowIntensity`、`kickPattern`）都留在自身 plugin；Host 只依 `manifest.controls` 動態顯示通用控制元件。
- 不能為了方便把 `generatePiano()`、`generateViolin()` 等函式塞到單一 `MusicDirector.ts`。

### 1.2 分開三類責任

1. **Composition（作曲）**：產生不含音訊依賴的事件，適合純邏輯測試。
2. **Performance／Sound（演奏與音色）**：plugin 自己處理 Sample Mapping、articulation、音訊節點與釋放。
3. **Host／Scheduling（管理與排程）**：統一時鐘，將事件安排到音訊時間點。

### 1.3 樂器協作不等於互相依賴

不能寫 `bassGenerator.import(drumsGenerator)`。應改用共同規格的**意圖交換協定（InstrumentIntent）**：

- Director 先提供 `BarPlan`（小節的 BPM、和弦、能量、段落、16-step 共同節奏網格）。
- 所有已啟用 plugin 各自提供 `proposeBar()`：想在哪些步點加重音、音域與密度預估、是否擔任主奏。
- Host／Coordinator 將所有提案聚合成與樂器身份無關的 `EnsembleIntent`（例如節奏重音、音域佔用、主奏密度）。
- 每個 plugin 再自行 `generateBar()`；例如貝斯依聚合後的重音與共同 Groove 演奏，小提琴根據高音域密度決定休止／長音。
- **同一小節兩階段生成**；提案只能表達意圖，不可直接修改全域狀態。即使只有一個 plugin 仍能正常執行。
- 執行順序不能影響音樂結果；每個 plugin 有自己的衍生 Seed，且 `EnsembleIntent` 由穩定排序的集合計算。

### 1.4 不可違反的依賴方向

```text
apps/web + instrument-lab
        |
        v
Host / Director / EnsembleCoordinator / Scheduler / Mixer
        |                           ^
        v                           |
     contracts <---------------- Instrument plugins
                                      |
                          own generator, voice, samples, UI metadata

禁止：instrument -> instrument
禁止：Host / Director -> 具名 instrument
禁止：音樂生成器 -> DOM / React / Tone.js
允許：instrument 的 audio adapter -> Tone.js 與注入的 AudioServices
```

> `contracts` 算 Host 的共用基礎設施；「只需 Host + 單一樂器」不表示任何程式可以不依賴基礎型別與音訊服務。

## 2. 技術選擇

| 區塊 | MVP 選擇 | 原因 |
|---|---|---|
| 語言／建置 | TypeScript（strict）、Vite | 模組化開發與 lazy import |
| UI | React，簡單舞台與角色卡 | 先做功能，不先追求大型動畫框架 |
| 音訊引擎 | Tone.js（採安裝時穩定版並鎖 lockfile） | Web Audio clock、Transport、Sampler、Players、效果器 |
| 音樂理論 | Tonal（僅 core/director 使用） | 和弦、音程、調性計算 |
| 自動測試 | Vitest；Playwright（E2E／音訊冒煙測試） | 純邏輯與瀏覽器互動分離 |
| 格式與檢查 | ESLint、Prettier、`tsc --noEmit` | 避免跨模組耦合與型別漏洞 |
| 儲存 | localStorage（MVP 設定與 Seed） | 無須後端；完整重播可先匯出 JSON |

啟動瀏覽器音訊需由玩家手勢觸發。Tone.js 與其他相依套件版本不要臆測；安裝當下確認並鎖定 lockfile。

## 3. 建議目錄（單一專案，避免過早 monorepo）

```text
/
├── plan.md
├── README.md
├── package.json
├── src/
│   ├── app/
│   │   ├── App.tsx                     # 極薄 UI 組裝
│   │   ├── bootstrap.ts                # 建立 Host；不 import 指定樂器
│   │   ├── discoverPlugins.ts          # Vite lazy glob -> plugin loaders
│   │   ├── components/                # 通用角色卡、儀表板、控制列
│   │   └── InstrumentLab.tsx           # ?instrument=violin 單件工作台
│   ├── contracts/
│   │   ├── music.ts                    # BarPlan / MusicEvent / EnsembleIntent
│   │   ├── instrument.ts               # InstrumentPlugin / Voice / Manifest
│   │   └── creativity.ts               # CreativeIntent／未來 LLM port
│   ├── core/
│   │   ├── EnsembleHost.ts             # plugin lifecycle、玩家互動入口
│   │   ├── MusicDirector.ts            # 風格、段落、和弦、能量；不懂樂器名
│   │   ├── EnsembleCoordinator.ts      # 聚合 proposal；不懂樂器名
│   │   ├── BarPlanner.ts               # 生成小節、凍結已提交區段
│   │   ├── SeededRandom.ts             # PRNG／穩定 hash
│   │   └── CreativeIntentController.ts # 本地預設策略，未來接 LLM
│   ├── audio/
│   │   ├── ToneClock.ts                # Transport / audio-time schedule
│   │   ├── MasterMixer.ts              # 軌道音量、Mute、Solo、release
│   │   └── AudioServices.ts            # 對 plugin 的音訊服務入口
│   ├── instruments/
│   │   ├── piano/
│   │   │   ├── index.ts                # InstrumentPlugin export
│   │   │   ├── generator.ts            # 和弦／琶音／轉位
│   │   │   ├── voice.ts                # 真實鋼琴取樣播放
│   │   │   ├── manifest.ts             # 能力、顯示名、控制項
│   │   │   ├── samples/                # 只放精簡可合法再散布素材
│   │   │   └── __tests__/
│   │   ├── violin/                     # 與 piano 相同獨立結構
│   │   ├── drums/
│   │   └── bass/
│   ├── presets/
│   │   └── lofiJazz.ts                 # 全域風格設定，不引用 plugin
│   └── main.tsx
├── tests/
│   ├── core/
│   ├── isolation/                      # Host + 一個 plugin 四組測試
│   ├── reproducibility/
│   └── e2e/
└── docs/
    ├── ARCHITECTURE.md                 # ADR、依賴規則與擴充範例
    ├── SAMPLE_LICENSES.md              # 素材來源 URL、授權、轉檔資訊
    └── LLM_FUTURE.md                   # 只規劃接口；不呼叫外部 API
```

### 插件發現

在 `discoverPlugins.ts` 以 Vite `import.meta.glob('../instruments/*/index.ts')`（**預設 lazy，不用 eager**）建立 loader map；UI 由 manifest 自動呈現。避免在 `App.tsx` 寫四條靜態 import。所有 plugin 必須是可選的：移除任一目錄，Host 仍可啟動；只有一個 plugin 也能演奏。可在 InstrumentLab 以 query string 只實例化指定 plugin。

> 注意：Vite glob 在建置時仍會掃描現有模組；「單獨載入」主要保證**執行時 lazy load、程式依賴獨立、開發／測試單獨編譯可行**，不是聲稱所有 plugin 都不會被建置工具掃描。

## 4. 契約草案（先建立並在 M0 固定）

以下是設計意圖，實際實作可補齊 readonly、泛型狀態封裝、錯誤處理，但**不能增加樂器互相引用**。

```ts
export type MusicEvent =
  | {
      kind: 'note';
      step: number;             // 4/4 中 0..15 的十六分音符位置
      durationSteps: number;
      midi: number;
      velocity: number;         // 0..1
      articulation?: string;   // 本 plugin 自行解讀
      microOffsetMs?: number;
    }
  | {
      kind: 'hit';
      step: number;
      sampleKey: string;        // 本 plugin 的局部取樣鍵
      velocity: number;
      microOffsetMs?: number;
    };

export interface BarPlan {
  readonly barIndex: number;
  readonly rootSeed: string;
  readonly bpm: number;
  readonly meter: '4/4';         // MVP 限定
  readonly key: string;
  readonly chord: string;
  readonly nextChord: string;
  readonly section: string;
  readonly phrasePosition: number;
  readonly energy: number;      // 0..1
  readonly groove: readonly number[]; // 16 格重音強度
}

export interface InstrumentIntent {
  readonly accents: readonly number[];  // 16 格，0..1
  readonly density: number;              // 0..1
  readonly register?: 'low' | 'mid' | 'high' | 'wide';
  readonly leadActivity?: number;         // 0..1
}

export interface EnsembleIntent {
  readonly accents: readonly number[];
  readonly density: number;
  readonly lowRegisterLoad: number;
  readonly midRegisterLoad: number;
  readonly highRegisterLoad: number;
  readonly leadActivity: number;
}

export interface InstrumentManifest {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
  readonly capabilities: readonly string[];
  readonly controls: readonly InstrumentControlDefinition[];
}

export interface InstrumentPlugin<State = unknown> {
  readonly manifest: InstrumentManifest;
  createInitialState(): State;
  proposeBar(plan: BarPlan, state: Readonly<State>): InstrumentIntent;
  generateBar(
    plan: BarPlan,
    ownIntent: InstrumentIntent,
    ensemble: EnsembleIntent,
    state: Readonly<State>,
  ): { events: readonly MusicEvent[]; nextState: State };
  createVoice(audio: AudioServices): Promise<InstrumentVoice>;
}

export interface InstrumentVoice {
  play(event: MusicEvent, audioTimeSec: number, secondsPerStep: number): void;
  releaseAll(audioTimeSec: number): void;
  dispose(): void;
}
```

- `InstrumentControlDefinition` 與 `AudioServices` 於 contracts 補上最小可用型別；`AudioServices` 不暴露 DOM／React 或其他 plugin。
- `State` 可包含 Motif Memory，**只由該 plugin 維護**，不由 Host 修改。Host 只持有不透明狀態快照、驗證序列化與負責調用。
- `generateBar` 使用 `deriveSeed(rootSeed, barIndex, instrumentId, purpose)` 生成可重現亂數，不許直接依賴 `Math.random()`。
- `proposeBar` 與 `generateBar` 應是可用固定輸入重放的純函式；狀態只藉 `nextState` 提交。
- `ensemble` 不提供其他樂器的 plugin ID、具體事件或私有狀態；可避免暗中形成特定配對依賴。未來可以在契約層**版本化**擴充匿名意圖欄位。
- Host 執行兩階段協調：所有提案收集完，固定順序／數值規則彙整，再執行所有生成器。plugin 數量 0、1、4 均合理。
- 各 plugin 可使用通用 `SampleVoice` 工具，但**不能依賴其他 plugin 的 voice.ts**。Drums 可自行實作多樣本 Players。

## 5. 樂器模組規格

| 樂器 | 樂團角色 | 生成責任 | 初版自然演奏重點 | 單獨演奏時 |
|---|---|---|---|---|
| Piano | 和聲／可獨奏 | 和弦轉位、琶音、切分伴奏、簡單短旋律 | Sample、力度、和聲節奏、避免低音混濁 | 產生完整和弦伴奏與可辨認的變奏 |
| Violin | 主旋律 | Motif Memory、音階／和弦約束、長短句、留白 | Sustained sample、音頭音尾、連奏感與呼吸 | 依和弦規劃演奏完整單旋律，不要求其他樂器 |
| Drums | 節奏 | Kick、Snare、Hi-hat、鼓花、Groove 與能量 | 多力度、輕微 humanization、鼓組 Fill | 生成節奏與 4–8 小節變奏／過門 |
| Bass | 低音與律動 | 根音、五度、經過音、切分、共同重音對齊 | 真實撥弦 Sample、音域限制、音符長短 | 依內部共同 Groove 與和弦演奏低音線 |

### 5.1 初版音樂演算法

1. **Macro（每 8–32 小節）**：MusicDirector 控制風格、能量、段落、和弦路徑（先人工審核的合法和弦進行及替代和弦）。
2. **Meso（每 2–8 小節）**：各 plugin 儲存自己的節奏／旋律動機，依「延續→變奏→新動機」切換。初始建議權重：60%／30%／10%，必須能依段落調整。
3. **Micro（每步與音符）**：力度、時值、少量切分／裝飾音、人性化偏移。偏移量需有上限（例如 ±12 ms），不能改變音符排序或越過安全的排程時間。
4. 旋律候選按 **和弦符合度、節奏適合度、動機延續、旋律流暢度、密度適切性** 加權，從前幾名依機率抽選，而非永遠取最高分。
5. 鋼琴和小提琴遇到彼此的高音域／主奏高密度意圖，降低伴奏密度；貝斯依共同 Groove 與鼓組提出的匿名重音互相呼應。
6. 容許符合曲風的經過音、非和弦音與緊張音；**音樂規則是有條件的，不是把非和弦音全部禁止**。

### 5.2 聲音與素材（真實 samples）

候選來源及官方授權說明（下載前再次核對各個實際檔案的授權）：

- Piano：**VCSL Keys** — https://versilian-studios.com/vcsl-keys/ （CC0）
- Violin：**VSCO 2 Community Edition** — https://versilian-studios.com/vsco-community/ （CC0）
- Drums：**Virtuosity Drums** — https://versilian-studios.com/virtuosity-drums/ （CC0）
- Bass：**Karoryfer Black And Blue Basses** — https://shop.karoryfer.com/pages/free-black-and-blue-basses （CC0）

導入流程：

1. 僅挑選 MVP 真正使用的力度與音域 sample；絕不把數 GB 原始完整音源包直接放進 Web bundle。
2. 將所需 WAV 經驗證後轉成適合瀏覽器的壓縮格式，保留 pitch/sampleKey mapping 與原始音高資料。
3. `docs/SAMPLE_LICENSES.md` 必須記錄來源 URL、下載版本、license URL、轉換步驟、原始檔名與新檔名對應；保留必要的授權文字。
4. 每個 plugin 的音色資產獨立 lazy load；播放器必須有載入中／載入失敗 UI，不可以靜默假裝成功。
5. 如果授權不明或下載不可行，可以暫時使用**明確標記的 synth placeholder**，但不可宣稱 sample-backed 音色達標。
6. 對 Violin 特別測試長音是否過早截斷，以及能否在換音時自然 release；必要時迭代音檔切點與淡入淡出。

## 6. 時鐘、規劃與玩家互動

### 時序

- 由 Tone.js Transport 作共用時間基準；**所有樂器必須使用同一個 transport**。
- 作曲結果先放到 `BarPlanner`，至少提前準備未來 **2 小節**，可預先規劃 2–4 小節。
- 排程回呼只取出已準備的 `MusicEvent[]` 並依 audio time 排程，**不在回呼內執行作曲、網路請求或大型 JSON 解析**。
- 4/4、16-step 的 step-to-time 映射由核心排程器統一計算，plugin 不自己使用 `setInterval` 計時。
- 演奏事件一旦進入不可變的排程區，不允許追溯修改。UI 的樂器增減／Mute／Solo 向 Host 發出 command，Host 選擇**尚未提交**的最近安全小節生效，並顯示 pending 狀態。
- 音符尾音與殘響釋放由 plugin voice 和 mixer 管理；停止新事件不等於立刻斷掉所有尾音。
- 避免加一個樂器就重設整個樂團的 Seed／已生成小節；同一 Seed 與相同操作事件序列應輸出相同 MusicEvent 序列。

### 狀態與復原

- 全域 `Session`: `seed`, `engineVersion`, `style`, `bpm`, `key`, `energy`, `activeInstrumentIds`, `transportState`。
- `OperationLog` 記錄 `requestedAtBar`、`effectiveAtBar`、plugin ID 與操作參數，用於重播。
- 每個樂器保存不透明且可序列化的 `State`（例如旋律記憶）。
- 排程和 UI 分離；切換畫面不會重建整個 MusicDirector。

## 7. 未來 LLM 創意指令的擴充點（MVP 只建接口）

**LLM 永遠不直接控制音訊 callback，也不修改樂器原始碼或依賴個別 plugin 名稱。**

```text
玩家文字指令
  -> CreativeDirectorPort（目前 LocalRuleBasedAdapter）
  -> CreativeIntent（受 schema 驗證的宣告式物件）
  -> CreativeIntentController（檢查允許範圍／套用時間）
  -> MusicDirector（在下個安全段落採納）
  -> BarPlan -> Plugins -> Events -> Audio

未來：CreativeDirectorPort 替換為 LLMAdapter
```

預留的 `CreativeIntent` 欄位可以包含：

```ts
type CreativeIntent = {
  mood?: 'calm' | 'bright' | 'melancholic' | 'tense';
  energyTarget?: number;         // 0..1
  complexityTarget?: number;     // 0..1
  groove?: 'straight' | 'swing';
  densityTarget?: number;        // 0..1
  harmonyColor?: 'simple' | 'jazzy';
  sectionRequest?: 'continue' | 'build' | 'breakdown' | 'return';
};
```

- MVP：`LocalRuleBasedAdapter` 不呼叫模型，將 UI 控制轉成同一份 CreativeIntent；`LLMAdapter` 只留下介面與文件，不做假的 API 接線。
- 後續：LLM 將自然語言轉成 `CreativeIntent`，交由 schema validator 驗證、限幅與排程；不直接產生低階 Web Audio 操作。
- 未來需考慮逾時／失敗 fallback、使用者同意／成本／隱私；不得因為 LLM 無回應而中斷播放。

## 8. 里程碑與驗收（嚴禁一次做完全部）

### M0 — 可擴充骨架 + 四種獨立樂器垂直切片（**第一個 Prompt 只做這階段**）

交付：

1. Vite + React + TS 專案可啟動。
2. `contracts`、`EnsembleHost`、`discoverPlugins`、`ToneClock`、`MasterMixer`、`InstrumentLab` 最小版本完成。
3. `piano/`、`violin/`、`drums/`、`bass/` 各自獨立實作 `InstrumentPlugin`，包含 manifest、最小 generator、sample adapter（或清楚標記 placeholder）。
4. 四種 plugin 可從 UI lazy load，能各自單獨播放，也能同時啟用；單獨 instrument lab 不實例化其餘 plugin。
5. MusicDirector 提供簡單固定 4/4、88 BPM、C Major、4 小節循環和弦測試上下文；**生成器產出不同音符事件，不是播放完整歌曲 Loop**。
6. 建立穩定 Seed PRNG、基本兩階段意圖契約與單樂器隔離測試（可先用簡單提案聚合）。
7. 建立 `ARCHITECTURE.md`、`SAMPLE_LICENSES.md`、`LLM_FUTURE.md`；前述 LLM port 可定義型別與本地 adapter，不需網路。
8. `npm run typecheck`、`npm run test`、`npm run build` 均成功；如任何項目不能通過，列出確切原因，不可宣稱已通過。

M0 不追求逼真的即興變奏，也不要求立即下載 GB 級音色包；但音訊素材 placeholder 必須在 UI 與 README 標明，且每種樂器都是可實際操作的 plugin。

### M1 — 真實音色與可靠的共用音樂時間

- 把所有 placeholder 換成授權確認的真實 samples；各樂器有獨立 loading、release、dispose。
- 支援精確 16-step 排程、合奏下音訊不中斷、加入／移除延後到安全小節。
- 主要 sample 載入錯誤可見，任何單一樂器失敗不應讓整個 Host 崩潰。

### M2 — 可長時間聽的生成式合奏

- MusicDirector：和弦進行、段落、能量軌跡、合法轉換。
- 兩階段 `proposeBar` → `EnsembleIntent` → `generateBar` 完整落實。
- Bass 跟隨共同 Groove；Piano 避免低音衝突；Violin 可依高音域佔用與密度留白；Drums 能在樂句末產生 Fill。

### M3 — 主題記憶與長時間即興

- 各 plugin 以自身 state 保存動機並自行變奏，不互相引用。
- 4–8 小節樂句可辨識，32 小節的演化避免機械式重複；提供 Seed 重播與事件匯出。
- 使用大量不同 Seeds 跑自動事件測試，加上至少 10 分鐘人工聆聽記錄。

### M4 — 遊戲化 UI 與品質完善

- 拖放角色、進退場動畫（跟隨音訊時鐘）、Mute／Solo／能量／重新生成。
- 通用 manifest-based 參數控制面板；不在 Host 寫任何樂器特殊分支。
- 行動裝置可用性、效能、音源延遲／載入測試、文檔與 Demo。

### M5（未來）— LLM 創意指令

- 獨立 `LLMAdapter` 將自然語言轉為受 schema 驗證的 `CreativeIntent`。
- 支援指令如：「小提琴少一點，改成憂鬱、慢慢堆疊能量」；精細的指定樂器指令需透過 plugin manifest 的能力／角色映射轉成**宣告式控制**，不可對具名實作硬編碼。
- 失敗／超時時維持原本規則式生成；對 LLM 呼叫做速率限制與成本控制。

## 9. 必跑的隔離測試與品質門檻

每個里程碑結束前：

- **四種單插件模式**：`Host + Piano only`、`Host + Violin only`、`Host + Drums only`、`Host + Bass only` 均可啟動、生成事件並播放。
- **缺席容錯**：移除／禁用另外三個 plugin，不會 import failure 或在 runtime 嘗試引用它們。
- **靜態依賴檢查**：禁止任何 `src/instruments/A/**` import `src/instruments/B/**`；禁止 `src/core/**`、`src/audio/**` import 具名 instrument。
- **重現性**：相同輸入（包含 plugin state）生成相同 `MusicEvent[]`，不同 plugin 的載入順序不影響各自結果。
- **時序合法性**：事件 step 合法、duration 正值、velocity 0–1、未來排程安全、不重複提交相同事件。
- **零／單／四樂器**：沒有樂器時 Host 也不應丟錯；任意單獨樂器可播放；四件合奏可維持統一 BPM。
- **生命週期**：載入、Mute、Solo、移除、重啟、dispose 釋放音訊資源；錯誤可見、不讓整團卡死。
- **音樂品質人工關卡**：四個不同 Seed，至少各聽 10 分鐘；記錄突兀和聲、無意義重複、節奏錯誤與小提琴持續音問題。

## 10. 決策記錄與 Coding Agent 作業規範

1. **每次只做一個 milestone**，避免一次產出大量無法驗證的程式碼。
2. 先確認 repository 現況並閱讀 `plan.md`；未建立專案就從 M0 開始。
3. 建立新樂器不能修改 core，除非真的發現契約不足，且先寫 ADR 記錄修改原因與相容性影響。
4. 不要把所有算法塞進 `App.tsx`、`MusicDirector.ts`，也不要實作 `instrumentId` switch-case。
5. Plugin 的事件生成必須可在 Node/Vitest 無瀏覽器 AudioContext 的環境測試。
6. 對外素材／套件採用前先檢查實際 license；授權不清楚則先 placeholder，不得任意散布素材。
7. 每個 milestone 完成時更新 `README.md`、`docs/ARCHITECTURE.md`、實作狀態與下一步，列出有執行的測試與結果。
8. **發現設計衝突，以「單樂器獨立、Host 簡單、可重現、準確排程」優先**，再考慮功能數量與視覺精緻度。

## 11. 參考資料

- Vite — Glob Import（預設延遲載入）：https://vite.dev/guide/features.html#glob-import
- Tone.js — Transport： https://tonejs.github.io/docs/15.1.22/classes/Transport.html
- Tone.js — Sampler： https://tonejs.github.io/docs/15.1.22/classes/Sampler.html
- VCSL Keys： https://versilian-studios.com/vcsl-keys/
- VSCO 2 CE： https://versilian-studios.com/vsco-community/
- Virtuosity Drums： https://versilian-studios.com/virtuosity-drums/
- Karoryfer Black And Blue Basses： https://shop.karoryfer.com/pages/free-black-and-blue-basses

以上均為架構計畫；進入實作時應以專案安裝版 SDK 型別與各音源實際授權檔案為準。
