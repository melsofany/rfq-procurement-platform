import { createRoot } from "react-dom/client";
import App from "./App";
import { installApiFetchBridge } from "./lib/realm";
import "./index.css";

// Must run before any API call (orval client + direct fetch sites).
installApiFetchBridge();

createRoot(document.getElementById("root")!).render(<App />);
