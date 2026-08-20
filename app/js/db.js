(function () {
  "use strict";

  var hasBridge = (typeof window.AndroidStorage !== "undefined");

  function lsGet(store) {
    try {
      if (hasBridge) {
        var raw = window.AndroidStorage.getItem("db_" + store);
        return (raw && raw !== "null") ? JSON.parse(raw) : [];
      }
      var raw = localStorage.getItem("db_" + store);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function lsSet(store, arr) {
    try {
      var json = JSON.stringify(arr);
      if (hasBridge) {
        window.AndroidStorage.setItem("db_" + store, json);
        return;
      }
      localStorage.setItem("db_" + store, json);
    } catch (e) {}
  }

  var DB = {
    getAll: function (store) {
      return Promise.resolve(lsGet(store));
    },
    get: function (store, key) {
      var arr = lsGet(store);
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === key) return Promise.resolve(arr[i]);
      }
      return Promise.resolve(undefined);
    },
    put: function (store, val) {
      var arr = lsGet(store);
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === val.id) { arr[i] = val; lsSet(store, arr); return Promise.resolve(); }
      }
      arr.push(val);
      lsSet(store, arr);
      return Promise.resolve();
    },
    remove: function (store, key) {
      var arr = lsGet(store);
      var out = [];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id !== key) out.push(arr[i]);
      }
      lsSet(store, out);
      return Promise.resolve();
    },
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
