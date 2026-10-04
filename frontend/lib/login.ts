/** Where signed-out visitors are sent to sign in again. */
export const LOGIN_URL = "/login?reason=unauthorized";

/** Sends the browser to the login page with a full page load. */
export function sendBrowserToLogin(): void {
  window.location.assign(LOGIN_URL);
}
