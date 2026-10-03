/**
 * Logins that come back to the site as slidequiz.co.uk/#access_token=… (links in account emails,
 * and "Continue with Google"). That isn't a page, so this runs before the router starts and keeps
 * the details for the account code.
 *
 * Google sign-in normally happens in a separate window: there, the login is saved to browser
 * storage (which the main tab picks up) and the window closes, so nothing on the main page is lost.
 */
export const GOOGLE_PENDING = "slidequiz:oauth-pending";
const RETURN_KEY = "slidequiz:oauth-return";

const hash = window.location.hash.replace(/^#\/?/, "");
const params: URLSearchParams | null = /(^|&)(access_token|error_description|error)=/.test(hash) ? new URLSearchParams(hash) : null;

const read = (s: Storage, k: string) => {
  try {
    return s.getItem(k);
  } catch {
    return null;
  }
};
const drop = (s: Storage, k: string) => {
  try {
    s.removeItem(k);
  } catch {
    /* storage blocked */
  }
};

// Whole page went to Google (the separate window was blocked): come back to where they were.
const returnTo = params ? read(sessionStorage, RETURN_KEY) : null;
if (params) drop(sessionStorage, RETURN_KEY);
// A separate Google window was opened in the last 10 minutes.
const pending = Number(read(localStorage, GOOGLE_PENDING) ?? 0);
const inGoogleWindow = !!params && !returnTo && Date.now() - pending < 10 * 60 * 1000;
if (params && inGoogleWindow) drop(localStorage, GOOGLE_PENDING);

/** True when this login came from "Continue with Google". */
export const viaGoogle = !!params && (inGoogleWindow || !!returnTo);

if (params && inGoogleWindow) {
  try {
    const token = params.get("access_token");
    if (token) {
      const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      localStorage.setItem("slidequiz:oauth", "1");
      localStorage.setItem("slidequiz:auth", JSON.stringify({ access_token: token, refresh_token: params.get("refresh_token") ?? "", expires_at: Math.floor(Date.now() / 1000) + Number(params.get("expires_in") ?? 3600), user: { id: p.sub, email: p.email } }));
    } else if (params.get("error") !== "access_denied") {
      localStorage.setItem("slidequiz:oauth-error", (params.get("error_description") ?? params.get("error") ?? "").replace(/\+/g, " ") + "|" + Date.now());
    }
  } catch {
    /* storage blocked */
  }
  // Done here. If the browser won't close it, this window just opens SlideQuiz, logged in.
  window.close();
}

/** The login details for the account code (not needed in the Google window: it saved them already). */
export const authCallback: URLSearchParams | null = params && !inGoogleWindow ? params : null;
if (params) history.replaceState(null, "", window.location.pathname + window.location.search + (viaGoogle ? returnTo || "#/" : "#/settings"));
