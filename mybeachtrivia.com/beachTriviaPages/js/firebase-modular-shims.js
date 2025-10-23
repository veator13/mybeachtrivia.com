/* firebase-modular-shims.js
 * Purpose:
 *  - Safe to include on ANY page.
 *  - Does NOTHING unless the compat SDK is on the page.
 *  - When compat is present, patches DocumentReference/Batch/Transaction
 *    set()/update() so modular FieldValue/Timestamp objects are converted.
 *  - NEVER calls firebase.initializeApp() or firebase.firestore() itself,
 *    avoiding the "app-compat/no-app" error.
 */

(function () {
  const LOG_PREFIX = '[shim] firebase-modular-shims';
  const log = (...a) => console.log(LOG_PREFIX, ...a);
  const warn = (...a) => console.warn(LOG_PREFIX, ...a);

  // --- Guards ---------------------------------------------------------------
  if (typeof window === 'undefined') return;

  // We operate ONLY if compat namespace is present.
  const hasCompat = () =>
    !!(window.firebase && window.firebase.firestore && window.firebase.firestore.DocumentReference);

  // Wait until compat is fully loaded (but don't require a default app).
  function onCompatReady(cb) {
    if (hasCompat()) return cb();
    let tries = 0;
    const id = setInterval(() => {
      if (hasCompat()) {
        clearInterval(id);
        cb();
      } else if (++tries > 200) {
        clearInterval(id);
        log('installed (modular-only mode; compat not detected)');
      }
    }, 25);
  }

  // --- Converters -----------------------------------------------------------
  function isPlainObject(x) {
    return x && typeof x === 'object' && x.constructor === Object;
  }

  function isModularTimestamp(x) {
    // Modular Timestamp has seconds/nanoseconds and toMillis(); ensure it's not the compat class.
    return (
      x &&
      typeof x === 'object' &&
      typeof x.seconds === 'number' &&
      typeof x.nanoseconds === 'number' &&
      typeof x.toMillis === 'function' &&
      (!x.constructor || x.constructor.name !== 'Timestamp')
    );
  }

  function isTimestampLikeObject(x) {
    // Some code may pass { seconds, nanoseconds } literals
    return (
      x &&
      typeof x === 'object' &&
      typeof x.seconds === 'number' &&
      typeof x.nanoseconds === 'number' &&
      typeof x.toMillis !== 'function'
    );
  }

  function isModularFieldValue(x) {
    // Modular FieldValue sentinels have a private _methodName; string inspect as last resort.
    if (!x || typeof x !== 'object') return false;
    const m = x._methodName || x.methodName || '';
    if (typeof m === 'string' && m) return true;
    const s = String(x);
    return s.includes('FieldValue') || s.includes('serverTimestamp') || s.includes('arrayUnion');
  }

  function convertValue(v, FB) {
    const { Timestamp, FieldValue } = FB.firestore;

    // Modular/TS literal -> compat Timestamp
    if (isModularTimestamp(v)) return Timestamp.fromMillis(v.toMillis());
    if (isTimestampLikeObject(v)) return new Timestamp(v.seconds, v.nanoseconds);

    // Modular FieldValue -> compat FieldValue (best-effort)
    if (isModularFieldValue(v)) {
      const m = v._methodName || v.methodName || String(v);
      try {
        if (m.includes('serverTimestamp')) return FieldValue.serverTimestamp();
        if (m.includes('deleteField') || m.includes('FieldValue.delete')) return FieldValue.delete();
        if (m.includes('increment') && typeof v._operand === 'number') return FieldValue.increment(v._operand);
        if (m.includes('arrayUnion') && Array.isArray(v._elements)) {
          return FieldValue.arrayUnion(...v._elements.map((e) => convertValue(e, FB)));
        }
        if (m.includes('arrayRemove') && Array.isArray(v._elements)) {
          return FieldValue.arrayRemove(...v._elements.map((e) => convertValue(e, FB)));
        }
      } catch (e) {
        warn('FieldValue convert error:', e && e.message ? e.message : e);
      }
    }

    // Recurse into containers
    if (Array.isArray(v)) return v.map((x) => convertValue(x, FB));
    if (isPlainObject(v)) {
      const out = {};
      for (const k in v) out[k] = convertValue(v[k], FB);
      return out;
    }
    return v;
  }

  // Convert the argument forms for compat update()
  function convertUpdateArgs(args, FB) {
    if (args.length === 1 && isPlainObject(args[0])) {
      return [convertValue(args[0], FB)];
    }
    // key/value pairs
    const out = [];
    for (let i = 0; i < args.length; i += 2) {
      const k = args[i];
      const v = convertValue(args[i + 1], FB);
      out.push(k, v);
    }
    return out;
  }

  // --- Patches --------------------------------------------------------------
  function patchCompatWrites() {
    const FB = window.firebase;
    if (!FB || !FB.firestore || !FB.firestore.DocumentReference) return;

    // Ensure the static classes exist even if no app is initialized yet.
    const hasCoreClasses =
      FB.firestore.Timestamp && FB.firestore.FieldValue && FB.firestore.DocumentReference;
    if (!hasCoreClasses) return;

    const refProto = FB.firestore.DocumentReference.prototype;
    const batchProto = FB.firestore.WriteBatch && FB.firestore.WriteBatch.prototype;
    const txProto = FB.firestore.Transaction && FB.firestore.Transaction.prototype;

    // DocumentReference.set
    if (refProto && typeof refProto.set === 'function' && !refProto.__mb_set_patched) {
      const orig = refProto.set;
      refProto.set = function (data, options) {
        return orig.call(this, convertValue(data, FB), options);
      };
      Object.defineProperty(refProto, '__mb_set_patched', { value: true });
    }

    // DocumentReference.update
    if (refProto && typeof refProto.update === 'function' && !refProto.__mb_update_patched) {
      const orig = refProto.update;
      refProto.update = function (...args) {
        return orig.apply(this, convertUpdateArgs(args, FB));
      };
      Object.defineProperty(refProto, '__mb_update_patched', { value: true });
    }

    // WriteBatch.set / update
    if (batchProto && typeof batchProto.set === 'function' && !batchProto.__mb_set_patched) {
      const orig = batchProto.set;
      batchProto.set = function (ref, data, options) {
        return orig.call(this, ref, convertValue(data, FB), options);
      };
      Object.defineProperty(batchProto, '__mb_set_patched', { value: true });
    }
    if (batchProto && typeof batchProto.update === 'function' && !batchProto.__mb_update_patched) {
      const orig = batchProto.update;
      batchProto.update = function (ref, ...args) {
        return orig.call(this, ref, ...convertUpdateArgs(args, FB));
      };
      Object.defineProperty(batchProto, '__mb_update_patched', { value: true });
    }

    // Transaction.set / update
    if (txProto && typeof txProto.set === 'function' && !txProto.__mb_set_patched) {
      const orig = txProto.set;
      txProto.set = function (ref, data, options) {
        return orig.call(this, ref, convertValue(data, FB), options);
      };
      Object.defineProperty(txProto, '__mb_set_patched', { value: true });
    }
    if (txProto && typeof txProto.update === 'function' && !txProto.__mb_update_patched) {
      const orig = txProto.update;
      txProto.update = function (ref, ...args) {
        return orig.call(this, ref, ...convertUpdateArgs(args, FB));
      };
      Object.defineProperty(txProto, '__mb_update_patched', { value: true });
    }

    log('installed (lazy + TS normalize + FieldValue convert + compat.patch)');
  }

  // Kick off
  onCompatReady(patchCompatWrites);

  // Small public debug hook (optional)
  window.__mb_shim = {
    _version: '2025-10-23',
    _installed: true,
  };
})();
