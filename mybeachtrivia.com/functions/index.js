/* eslint-env node */
/* eslint-disable quotes, max-len, object-curly-spacing, indent, valid-jsdoc, operator-linebreak, comma-dangle */
/* eslint-disable no-console */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper to ensure the caller is an admin.
 * We allow either a custom claim `admin: true` OR a fallback single allowed admin email
 * configured via:
 *   firebase functions:config:set app.admin_email="you@example.com"
 */
async function ensureAdmin(context) {
  const auth = context.auth;
  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const token = auth.token || {};
  const callerEmail = token.email || '';

  // Avoid optional chaining to keep ESLint/parser happy
  let cfg = {};
  try {
    cfg = typeof functions.config === 'function' ? functions.config() : {};
  } catch (e) {
    cfg = {};
  }
  const allowedEmail =
    cfg && cfg.app && cfg.app.admin_email ? cfg.app.admin_email : '';

  const isAdmin =
    token.admin === true ||
    (allowedEmail &&
      callerEmail &&
      callerEmail.toLowerCase() === allowedEmail.toLowerCase());

  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Admin privileges required.');
  }

  return { uid: auth.uid, email: callerEmail };
}

/**
 * createEmployee (callable)
 * data = {
 *   email, firstName, lastName,
 *   nickname?, phone?, employeeID?, active? (default true)
 * }
 *
 * - Creates/gets an Auth user
 * - Sets claims { role: 'host', active }
 * - Writes Firestore doc at employees/{uid}
 * - Returns { uid, resetLink }
 */
exports.createEmployee = functions.https.onCall(async (data, context) => {
  await ensureAdmin(context);

  const {
    email,
    firstName,
    lastName,
    nickname = '',
    phone = '',
    employeeID = '',
    active = true,
  } = data || {};

  if (!email || !firstName || !lastName) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'email, firstName, and lastName are required.'
    );
  }

  // Create (or fetch existing) Auth user
  let userRecord;
  const displayName = nickname
    ? `${nickname} (${firstName} ${lastName})`
    : `${firstName} ${lastName}`;

  try {
    // Use a temporary random password; we’ll send a reset link below.
    const tmpPass = Math.random().toString(36).slice(-10);
    userRecord = await admin.auth().createUser({
      email,
      emailVerified: false,
      password: tmpPass,
      displayName,
      disabled: false,
    });
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      userRecord = await admin.auth().getUserByEmail(email);
    } else {
      console.error('createUser error:', err);
      throw new functions.https.HttpsError('internal', 'Failed to create user.');
    }
  }

  // Set custom claims
  try {
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: 'host',
      active: !!active,
    });
  } catch (err) {
    console.error('setCustomUserClaims error:', err);
    throw new functions.https.HttpsError('internal', 'Failed to set user claims.');
  }

  // Firestore: employees/{uid} — canonical source keyed by UID
  try {
    await db.collection('employees').doc(userRecord.uid).set(
      {
        firstName,
        lastName,
        nickname,
        phone,
        email,
        employeeID,
        active: !!active,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error('Firestore write error:', err);
    throw new functions.https.HttpsError('internal', 'Failed to write employee record.');
  }

  // Generate password reset link (you can email/text this to the new host)
  let resetLink = '';
  try {
    resetLink = await admin.auth().generatePasswordResetLink(email);
  } catch (err) {
    console.warn('generatePasswordResetLink error:', err);
    // Not fatal; account is created; caller can try again or send manually.
  }

  return { uid: userRecord.uid, email, resetLink };
});
