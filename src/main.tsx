import "./lib/polyfills";
import "./lib/auth-callback";
import "./services/invites";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { startAccount } from "./services/account";
import { startInstallSupport } from "./lib/install";

startAccount();
startInstallSupport();
createRoot(document.getElementById("root")!).render(<App />);

// The app is ready: no need for the opening screen (it only shows if loading took a while).
document.getElementById("sq-splash")?.remove();
