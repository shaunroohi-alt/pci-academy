import { createRoot } from "react-dom/client";
import BrainStormApp from "./App";
createRoot(document.getElementById("root")!).render(<BrainStormApp />);
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error) =>
        console.warn("Offline cache registration failed.", error),
      );
  });
}
