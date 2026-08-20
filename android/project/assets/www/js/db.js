(function () {
  "use strict";
  const DB_NAME = "prestamos-pwa";
  const DB_VER = 1;
  let _db = null;

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (_db) return resolve(_db);
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains("clientes")) {
          var s = db.createObjectStore("clientes", { keyPath: "id" });
          s.createIndex("nombre", "nombre");
        }
        if (!db.objectStoreNames.contains("prestamos")) {
          var s = db.createObjectStore("prestamos", { keyPath: "id" });
          s.createIndex("clienteId", "clienteId");
          s.createIndex("estado", "estado");
        }
        if (!db.objectStoreNames.contains("pagos")) {
          var s = db.createObjectStore("pagos", { keyPath: "id" });
          s.createIndex("prestamoId", "prestamoId");
        }
        if (!db.objectStoreNames.contains("config")) {
          db.createObjectStore("config", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("usuarios")) {
          db.createObjectStore("usuarios", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("auditoria")) {
          var s = db.createObjectStore("auditoria", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("sesion")) {
          db.createObjectStore("sesion", { keyPath: "key" });
        }
      };
      req.onsuccess = function (e) { _db = e.target.result; resolve(_db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function tx(store, mode) {
    return openDB().then(function (db) {
      var t = db.transaction(store, mode);
      return { t: t, s: t.objectStore(store) };
    });
  }

  function req2p(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function promisifyTx(t) {
    return new Promise(function (res) { t.oncomplete = res; });
  }

  var DB = {
    getAll: function (store) { return tx(store, "readonly").then(function (r) { return req2p(r.s.getAll()); }); },
    get: function (store, key) { return tx(store, "readonly").then(function (r) { return req2p(r.s.get(key)); }); },
    put: function (store, val) { return tx(store, "readwrite").then(function (r) { var p = req2p(r.s.put(val)); return p.then(function () { return promisifyTx(r.t); }); }); },
    remove: function (store, key) { return tx(store, "readwrite").then(function (r) { var p = req2p(r.s.delete(key)); return p.then(function () { return promisifyTx(r.t); }); }); },
    getConfig: function () {
      return DB.getAll("config").then(function (rows) {
        var cfg = {};
        rows.forEach(function (r) { cfg[r.key] = r.value; });
        return Object.assign({ empresa: "Prestamista", tasaInteres: 10, moneda: "S/", colorPrimario: "#7C3AED", logo: "" }, cfg);
      });
    },
    setConfig: function (k, v) { return DB.put("config", { key: k, value: v }); },
    getSesion: function () { return DB.get("sesion", "actual").then(function (r) { return r ? r.value : null; }); },
    setSesion: function (v) { return DB.put("sesion", { key: "actual", value: v }); },
    clearSesion: function () { return DB.remove("sesion", "actual"); },
    getUsuarios: function () { return DB.getAll("usuarios"); },
    putUsuario: function (u) { return DB.put("usuarios", u); },
    deleteUsuario: function (id) { return DB.remove("usuarios", id); },
    getAuditoria: function (max) {
      return DB.getAll("auditoria").then(function (all) {
        all.sort(function (a, b) { return a.id < b.id ? 1 : -1; });
        return all.slice(0, max || 300);
      });
    },
    putAuditoria: function (e) { return DB.put("auditoria", e); }
  };
  window.DB = DB;
})();
