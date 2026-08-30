/* mybeachtrivia.com/beachTriviaPages/js/bt-push-config.js
 *
 * FCM Web Push public key ("Web Push certificate" / VAPID key).
 *
 * Get it once from the Firebase console:
 *   Project settings → Cloud Messaging → Web configuration →
 *   "Web Push certificates" → Generate key pair → copy the key string.
 *
 * Paste it below. It is a PUBLIC key — safe to commit and ship to the browser.
 * Until it is set, bt-push.js keeps the "Turn on notifications" button hidden.
 */
window.BT_VAPID_KEY = "";
