/**
 * What's open in each part of the site (which lecture, deck or essay, which kind of question) is only kept
 * while the site is being used. Closing the window and opening SlideQuiz again starts each tab fresh.
 * sessionStorage lasts through refreshes but is cleared when the window or app is closed.
 */
export function sessionGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function sessionSet(key: string, v: unknown) {
  try {
    if (v == null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage blocked */
  }
}

/**
 * A fresh start (the window was closed, not just refreshed): a lecture, deck or essay left open last time
 * goes back to its list, so each tab opens on "choose one" again.
 */
export function freshStart() {
  let fresh = true;
  try {
    fresh = !sessionStorage.getItem("slidequiz:open");
    sessionStorage.setItem("slidequiz:open", "1");
  } catch {
    return;
  }
  if (!fresh) return;
  const m = location.hash.match(/^#\/(materials|flashcards|essays|summary)\/[^/?#]+/);
  if (m) history.replaceState(null, "", `#/${m[1]}`);
}
