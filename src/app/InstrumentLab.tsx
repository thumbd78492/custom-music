import type { EnsembleHost } from "../core/EnsembleHost";
import { App } from "./App";

export function InstrumentLab({ host }: { host: EnsembleHost }) {
  return <App host={host} lab />;
}
