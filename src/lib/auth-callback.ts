/**
 * Links in account emails (confirm sign-up, reset password) come back as
 * slidequiz.co.uk/#access_token=…&type=recovery. That isn't a page, so this runs before the
 * router starts: it keeps the details for the account code and sends the student to Settings.
 */
const hash = window.location.hash.replace(/^#\/?/, "");
export const authCallback: URLSearchParams | null = /(^|&)(access_token|error_description|error)=/.test(hash) ? new URLSearchParams(hash) : null;
if (authCallback) history.replaceState(null, "", window.location.pathname + window.location.search + "#/settings");
