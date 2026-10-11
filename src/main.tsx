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

// The opening screen stays up for at least a moment (so it doesn't flicker), then goes.
const splash = document.getElementById("sq-splash");
if (splash) requestAnimationFrame(() => setTimeout(() => splash.remove(), Math.max(0, 450 - performance.now())));
