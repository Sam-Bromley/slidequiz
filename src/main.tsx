import "./lib/polyfills";
import "./lib/auth-callback";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { startAccount } from "./services/account";
import { startInstallSupport } from "./lib/install";

startAccount();
startInstallSupport();
createRoot(document.getElementById("root")!).render(<App />);
