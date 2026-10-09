import { useSyncExternalStore } from "react";
import type { EnsembleHost } from "../core/EnsembleHost";
import type { GrooveId, VariationMode } from "../contracts/music";

const grooveLabels: Record<GrooveId, string> = {
  straight: "Straight",
  "light-swing": "Light Swing",
  "half-time": "Half-time",
};

export function App({
  host,
  lab = false,
}: {
  host: EnsembleHost;
  lab?: boolean;
}) {
  const state = useSyncExternalStore(host.subscribe, host.getSnapshot);
  const busy = state.starting || state.tracks.some((track) => track.loading);
  return (
    <main>
      <header>
        <p className="eyebrow">GENERATIVE ENSEMBLE / M3-A1</p>
        <h1>{lab ? "InstrumentLab" : "即興樂團"}</h1>
        <p>獨立樂器，共同節拍。每個聲部從 Seed 生成演奏事件。</p>
      </header>
      <section className="transport" aria-label="播放控制">
        <div className="context">
          4/4 · {state.music.bpm} BPM · {state.music.key}
          <span data-testid="position">
            第 {state.barIndex + 1} 小節 · {state.chord}
          </span>
        </div>
        <label>
          Seed
          <input
            aria-label="Seed"
            value={state.seed}
            disabled={state.running || busy}
            onChange={(event) => host.setSeed(event.target.value)}
          />
        </label>
        <label>
          律動
          <select
            aria-label="Groove"
            value={state.requestedGroove}
            disabled={state.starting}
            onChange={(event) =>
              host.requestGroove(event.target.value as GrooveId)
            }
          >
            {Object.entries(grooveLabels).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p data-testid="groove-status" role="status">
          目前律動：
          {grooveLabels[state.music.groovePlan?.familyId ?? "straight"]}
          {state.controls
            .filter(
              (command) =>
                command.kind === "groove" &&
                (command.status === "accepted" ||
                  command.status === "scheduled"),
            )
            .map((command) => (
              <span key={command.commandId}>
                {" · "}等待 {grooveLabels[command.target as GrooveId]}：第{" "}
                {command.effectiveBar + 1} 小節 （tick {command.effectiveTick}，
                {command.status === "accepted" ? "待提交" : "已提交"}）
              </span>
            ))}
        </p>
        <label>
          變化程度
          <select
            aria-label="變化程度"
            value={state.variationMode}
            disabled={state.running || busy}
            onChange={(event) =>
              host.setVariationMode(event.target.value as VariationMode)
            }
          >
            <option>Subtle</option>
            <option>Balanced</option>
            <option>Experimental</option>
          </select>
        </label>
        <div className="buttons">
          <button
            onClick={() => void host.start()}
            disabled={state.running || busy}
          >
            {state.starting ? "啟動中…" : "Start"}
          </button>
          <button
            onClick={() => host.stop()}
            disabled={!state.running && !busy}
          >
            Stop
          </button>
        </div>
        <p role="status">
          {state.running ? "播放中" : "已停止"} · {state.music.section} · 能量{" "}
          {Math.round(state.music.energy * 100)}% · {state.chord} →{" "}
          {state.music.nextChord}
        </p>
      </section>
      {state.error && <p role="alert">{state.error}</p>}
      <p className="notice">
        音色種類標示於各樂器卡片；加入時才載入該件素材。播放中操作會在預先準備區段之後的小節生效。
      </p>
      <section className="grid" aria-label="樂器">
        {state.tracks.map((track) => {
          const pending = track.pendingAt !== undefined;
          return (
            <article
              key={track.identity.instanceId}
              data-testid={`instrument-${track.character.default ? track.manifest.id : track.character.id}`}
              data-instance-id={track.identity.instanceId}
              data-plugin-id={track.identity.pluginId}
              data-character-id={track.identity.characterId}
            >
              <h2>{track.character.displayName}</h2>
              <p className="tags">{track.character.capabilities.join(" · ")}</p>
              <p>{track.manifest.sound.label}</p>
              <p role="status">
                {track.loading
                  ? "載入中…"
                  : pending
                    ? `等待第 ${track.pendingAt! + 1} 小節生效`
                    : track.active
                      ? "已加入"
                      : track.loaded
                        ? "已載入 · 已移除"
                        : "尚未載入"}
              </p>
              {track.error && <p role="alert">載入／生成失敗：{track.error}</p>}
              <div className="buttons">
                {track.loading && (
                  <button
                    onClick={() => host.remove(track.identity.instanceId)}
                  >
                    取消載入
                  </button>
                )}
                <button
                  disabled={track.loading || pending || state.starting}
                  onClick={() =>
                    track.active
                      ? host.remove(track.identity.instanceId)
                      : void host.add(track.identity.instanceId)
                  }
                >
                  {track.active ? "移除" : "加入"}
                </button>
                <button
                  disabled={!track.active || pending || state.starting}
                  aria-pressed={track.muted}
                  onClick={() =>
                    host.mute(track.identity.instanceId, !track.muted)
                  }
                >
                  Mute
                </button>
                <button
                  disabled={!track.active || pending || state.starting}
                  aria-pressed={track.solo}
                  onClick={() =>
                    host.solo(track.identity.instanceId, !track.solo)
                  }
                >
                  Solo
                </button>
              </div>
              <label>
                音量
                <input
                  type="range"
                  aria-label={`${track.character.displayName}音量`}
                  min="0"
                  max="1"
                  step="0.05"
                  value={track.volume}
                  disabled={pending || state.starting}
                  onChange={(event) =>
                    host.setVolume(
                      track.identity.instanceId,
                      Number(event.target.value),
                    )
                  }
                />
              </label>
              {!lab && (
                <a
                  href={`?instrument=${encodeURIComponent(track.manifest.id)}`}
                >
                  開啟 InstrumentLab ↗
                </a>
              )}
            </article>
          );
        })}
      </section>
      {state.tracks.length === 0 && <p>未發現 Plugin；共同時鐘仍可啟動。</p>}
      <footer>
        {lab ? <a href="/">返回合奏</a> : "M3-A1 · Plugin-first · 本地音色資產"}
        <span>Stop 後重新 Start 會從相同 Seed 的第一小節開始。</span>
      </footer>
    </main>
  );
}
