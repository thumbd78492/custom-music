import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { InstrumentLab } from "./app/InstrumentLab";
import { bootstrap } from "./app/bootstrap";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);
const onlyId =
  new URLSearchParams(location.search).get("instrument") ?? undefined;
root.render(<p>正在探索 Plugin…</p>);
bootstrap(onlyId)
  .then((host) => {
    root.render(
      onlyId === undefined ? (
        <App host={host} />
      ) : (
        <InstrumentLab host={host} />
      ),
    );
    window.addEventListener("pagehide", () => host.dispose(), { once: true });
    if (import.meta.hot) import.meta.hot.dispose(() => host.dispose());
  })
  .catch((error: unknown) =>
    root.render(
      <main>
        <h1>無法啟動</h1>
        <p role="alert">{String(error)}</p>
        <a href="/">返回合奏</a>
      </main>,
    ),
  );
