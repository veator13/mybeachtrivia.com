/* Lightweight shims so modular-style helpers work on compat SDK */
(function (){
  if (!window.firebase || !firebase.firestore) { console.warn('[shim] compat firestore not loaded yet'); return; }
  try { window.db = window.db || firebase.firestore(); } catch (e) { console.error('[shim] no compat firestore', e); }

  const compatDb = () => (window.db || firebase.firestore());
  const toDoc = (ref) => {
    const db = compatDb();
    if (typeof ref === 'string') return db.doc(ref);
    if (ref && typeof ref.path === 'string') return db.doc(ref.path);
    return ref;
  };

  window.setDoc   ||= function(ref, data, opt){ const d = toDoc(ref); return (opt && opt.merge) ? d.set(data,{merge:true}) : d.set(data); };
  window.updateDoc||= function(ref, data){ return toDoc(ref).update(data); };
  window.getDoc   ||= function(ref){ return toDoc(ref).get(); };
  window.collection ||= function(dbOrPath, maybePath){ const p = typeof dbOrPath==='string'?dbOrPath:maybePath; if(!p) throw new Error("collection() needs path"); return compatDb().collection(p); };
  window.doc        ||= function(base, id){ const db = compatDb(); if(typeof base==='string'&&!id) return db.doc(base); if(typeof base==='string'&&id) return db.doc(`${base}/${id}`); if(base&&base.path&&id) return db.doc(`${base.path}/${id}`); throw new Error("doc() needs path or (collectionRef,id)"); };

  console.log('[shim] firebase-modular-shims installed');
})();
