// functions/index.js (Gen 2 + SendGrid)
// Node 18+/20, Admin SDK + firebase-functions v2

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail'); // ← SendGrid

admin.initializeApp();
const db = admin.firestore();

/* ======================================================================
   Helpers
   ====================================================================== */

/** Resolve caller from onCall request or explicit idToken in data */
async function resolveAuthV2(req) {
  // Normal callable path (preferred)
  if (req.auth && req.auth.uid) {
    return {
      uid: req.auth.uid,
      email: req.auth.token?.email || null,
      tokenClaims: req.auth.token || {},
    };
  }

  // Fallback: explicit idToken in request data
  const idTok = typeof req.data?.idToken === 'string' ? req.data.idToken.trim() : '';
  if (!idTok) {
    throw new HttpsError('unauthenticated', 'Sign in required');
  }
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idTok, false);
  } catch {
    throw new HttpsError('unauthenticated', 'Invalid ID token');
  }
  return { uid: decoded.uid, email: decoded.email || null, tokenClaims: decoded };
}

/** Ensure caller has admin privileges (from claims or employee profile) */
async function assertAdminFromCaller(caller) {
  if (caller.tokenClaims?.admin === true) return;

  const snap = await db.collection('employees').doc(caller.uid).get();
  if (!snap.exists) {
    throw new HttpsError('permission-denied', 'No employee record');
  }
  const d = snap.data() || {};
  const roles = Array.isArray(d.roles) ? d.roles : (d.role ? [d.role] : []);
  if (!(d.active === true && roles.includes('admin'))) {
    throw new HttpsError('permission-denied', 'Admin only');
  }
}

/** Derive custom claims from an employee doc */
function desiredClaimsFromEmployeeDoc(d) {
  const roles = Array.isArray(d?.roles) ? d.roles : (d?.role ? [d.role] : []);
  const active = d?.active === true;
  return {
    admin: active && roles.includes('admin') ? true : undefined, // omit when false
  };
}

/** Merge desired claims into current, removing keys with undefined values */
function mergeClaims(current, desired) {
  const next = { ...(current || {}) };
  for (const k of Object.keys(desired)) {
    const v = desired[k];
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  return next;
}

/** Sync custom claims for given uid from its employees/{uid} doc */
async function syncClaimsFromDoc(uid) {
  const snap = await db.collection('employees').doc(uid).get();
  const d = snap.exists ? (snap.data() || {}) : {};
  const desired = desiredClaimsFromEmployeeDoc(d);

  const user = await admin.auth().getUser(uid).catch(() => null);
  if (!user) return { changed: false, reason: 'user-not-found' };

  const current = user.customClaims || {};
  const next = mergeClaims(current, desired);

  const changed = JSON.stringify(current) !== JSON.stringify(next);
  if (changed) {
    await admin.auth().setCustomUserClaims(uid, next);
    logger.info('Custom claims updated', { uid, next });
  }
  return { changed, claims: next };
}

/* ======================================================================
   Admin: create employee + send password setup link (emails via SendGrid)
   ====================================================================== */

exports.adminCreateEmployee = onCall(
  {
    region: 'us-central1',
    cpu: 1,
    memory: '256MiB',
    secrets: ['SENDGRID_API_KEY'], // ← read from Firebase Secret Manager
  },
  async (req) => {
    const caller = await resolveAuthV2(req);
    await assertAdminFromCaller(caller);

    const email = String(req.data?.email || '').trim().toLowerCase();
    const roleIn = String(req.data?.role || 'host').trim().toLowerCase();
    const role = roleIn === 'admin' ? 'admin' : 'host';

    if (!email) {
      throw new HttpsError('invalid-argument', 'email required');
    }

    // Upsert Auth user by email
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        user = await admin.auth().createUser({
          email,
          emailVerified: false,
          disabled: false,
        });
      } else {
        throw new HttpsError('internal', 'get/create user failed', e);
      }
    }
    const uid = user.uid;

    // Upsert Firestore profile (doc id == uid)
    await db.collection('employees').doc(uid).set(
      {
        uid,
        email,
        role,            // legacy single-role (back-compat)
        roles: [role],   // normalized array
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Sync custom claims derived from the doc
    await syncClaimsFromDoc(uid);

    // Generate password setup (reset) link
    const actionCodeSettings = {
      url: 'https://mybeachtrivia.com/login.html',
      handleCodeInApp: false,
    };
    const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

    // Send the link via SendGrid (also still return it to the UI)
    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      // For now, this must match your verified Single Sender in SendGrid.
      const fromEmail = 'mybeachtrivia@gmail.com';

      const msg = {
        to: email,
        from: { email: fromEmail, name: 'Beach Trivia' },
        subject: 'Set up your Beach Trivia account',
        text:
`Welcome!

Your Beach Trivia account has been created with the role: ${role}.
Click the link below to set your password:

${resetLink}

If you didn’t expect this email, you can ignore it.`,
        html:
`<p>Welcome!</p>
<p>Your Beach Trivia account has been created with the role: <b>${role}</b>.</p>
<p><a href="${resetLink}">Click here to set your password</a></p>
<p>If you didn’t expect this email, you can ignore it.</p>`,
      };

      await sgMail.send(msg);
      logger.info('Invite email sent via SendGrid', { to: email });
    } catch (e) {
      // Don’t fail the whole flow if email sending hiccups; UI will still show the link.
      logger.error('SendGrid send failed', { message: e?.message || e });
    }

    return { uid, email, role, resetLink };
  }
);

/* ======================================================================
   whoami (simple diagnostic)
   ====================================================================== */

exports.whoami = onCall(
  { region: 'us-central1', cpu: 0.5, memory: '128MiB' },
  async (req) => {
    const hasAuth = !!(req.auth && req.auth.uid);
    return {
      hasAuth,
      uid: hasAuth ? req.auth.uid : null,
      aud: hasAuth ? req.auth.token?.aud : null,
      iss: hasAuth ? req.auth.token?.iss : null,
      email: hasAuth ? req.auth.token?.email : null,
      claims: hasAuth ? req.auth.token : null,
    };
  }
);

/* ======================================================================
   Automatic claims sync whenever employees/{uid} changes
   ====================================================================== */

exports.onEmployeeWrite = onDocumentWritten(
  { document: 'employees/{uid}', region: 'us-central1', cpu: 0.5, memory: '128MiB' },
  async (event) => {
    const { uid } = event.params;
    return syncClaimsFromDoc(uid);
  }
);

/* ======================================================================
   Self-repair: caller reasserts their claims from their employee doc
   ====================================================================== */

exports.reassertMyClaims = onCall(
  { region: 'us-central1', cpu: 0.5, memory: '128MiB' },
  async (req) => {
    if (!(req.auth && req.auth.uid)) {
      throw new HttpsError('unauthenticated', 'Sign in required');
    }
    const uid = req.auth.uid;
    const res = await syncClaimsFromDoc(uid);
    return { ok: true, changed: res.changed, claims: res.claims };
  }
);
