import "./lib/polyfills";
import "./lib/auth-callback";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { startAccount } from "./services/account";

startAccount();
createRoot(document.getElementById("root")!).render(<App />);
