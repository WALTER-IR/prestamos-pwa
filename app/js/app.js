(function () {
  "use strict";

  var CFG = window.APP_CONFIG;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.from(document.querySelectorAll(s)); };

  var clientes = [], prestamos = [], pagos = [], usuarios = [], auditoria = [];
  var sesion = null;
  var appCfg = { empresa: "Prestamista", tasaInteres: 10, moneda: "S/", colorPrimario: "#7C3AED", logo: "" };
  var currentView = "dashboard";
  var currentDetailId = null;

  var ROL = { LECTURA: 0, EDICION: 1, ADMIN: 2 };
  var rolNombre = function (r) { return r === 2 ? "Administrador" : r === 1 ? "Edicion" : "Lectura"; };
  var puedeEditar = function () { return sesion && sesion.rol >= ROL.EDICION; };
  var esAdmin = function () { return sesion && sesion.rol === ROL.ADMIN; };

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function todayISO() { return toISO(new Date()); }
  function nowStamp() {
    var d = new Date(), p = function (n) { return ("0" + n).slice(-2); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function toISO(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    var off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  }
  function normFecha(v) {
    if (v == null) return "";
    if (v instanceof Date) return isNaN(v.getTime()) ? "" : toISO(v);
    var s = String(v).trim();
    if (!s) return "";
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
      var p = s.split("-");
      return p[0] + "-" + ("0" + p[1]).slice(-2) + "-" + ("0" + p[2]).slice(-2);
    }
    var d = new Date(s);
    if (!isNaN(d.getTime())) return toISO(d);
    return s;
  }
  function fmtDate(iso) {
    if (!iso) return "---";
    var s = normFecha(iso);
    if (!s) return s;
    var d = new Date(s + "T00:00:00");
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  function fmtMoney(n) {
    return (appCfg.moneda || "S/") + " " + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function uid() { return "id-" + Date.now() + "-" + Math.floor(Math.random() * 10000); }

  function calcCuota(monto, tasa, cuotas) {
    if (tasa === 0) return monto / cuotas;
    var r = tasa / 100;
    return monto * (r * Math.pow(1 + r, cuotas)) / (Math.pow(1 + r, cuotas) - 1);
  }

  function getEstado(pr) {
    if (pr.estado === "cancelado") return "cancelado";
    var total = 0;
    pagos.forEach(function (p) { if (p.prestamoId === pr.id) total += Number(p.monto || 0); });
    if (total >= pr.montoTotal) return "pagado";
    if (pr.fechaFin && pr.fechaFin < todayISO()) return "vencido";
    return "activo";
  }
  function estadoLabel(e) {
    return { activo: "Activo", pagado: "Pagado", vencido: "Vencido", cancelado: "Cancelado" }[e] || e;
  }

  function clienteById(id) {
    for (var i = 0; i < clientes.length; i++) { if (clientes[i].id === id) return clientes[i]; }
    return null;
  }

  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    setTimeout(function () { t.classList.add("hidden"); }, 2500);
  }

  function audit(msg) {
    DB.putAuditoria({ id: uid(), fecha: nowStamp(), usuario: sesion ? sesion.nombre : "sistema", accion: msg });
  }

  // === RELOAD DATA ===
  function reload() {
    return Promise.all([
      DB.getAll("clientes").then(function (r) { clientes = r; }),
      DB.getAll("prestamos").then(function (r) { prestamos = r; }),
      DB.getAll("pagos").then(function (r) { pagos = r; }),
      DB.getUsuarios().then(function (r) { usuarios = r; }),
      DB.getAuditoria(300).then(function (r) { auditoria = r; }),
      DB.getConfig().then(function (r) { appCfg = r; applyTheme(r.colorPrimario); applyLogo(r.logo); })
    ]);
  }

  // === THEME ===
  function applyTheme(color) {
    if (!color) return;
    document.documentElement.style.setProperty("--pri", color);
    document.documentElement.style.setProperty("--pri-dark", darken(color, 15));
    document.documentElement.style.setProperty("--pri-light", lighten(color, 20));
  }
  function darken(hex, pct) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.round(r * (1 - pct / 100)));
    g = Math.max(0, Math.round(g * (1 - pct / 100)));
    b = Math.max(0, Math.round(b * (1 - pct / 100)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function lighten(hex, pct) {
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * pct / 100));
    g = Math.min(255, Math.round(g + (255 - g) * pct / 100));
    b = Math.min(255, Math.round(b + (255 - b) * pct / 100));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function applyLogo(dataUrl) {
    var els = $$(".brand-icon");
    if (dataUrl) {
      els.forEach(function (el) {
        el.innerHTML = '<img src="' + dataUrl + '" style="height:24px;width:24px;border-radius:4px;object-fit:contain"/>';
      });
    } else {
      els.forEach(function (el) { el.innerHTML = "$"; });
    }
  }

  // === SIDEBAR ===
  function toggleSidebar(open) {
    $("#sidebar").classList.toggle("open", open);
    $("#backdrop").classList.toggle("hidden", !open);
  }

  // === VIEWS ===
  function setView(name) {
    currentView = name;
    $$(".view").forEach(function (v) { v.classList.add("hidden"); });
    var el = $("#view-" + name);
    if (el) el.classList.remove("hidden");
    $$(".nav-item").forEach(function (n) { n.classList.toggle("active", n.dataset.view === name); });
    toggleSidebar(false);
    renderView(name);
  }

  function renderView(name) {
    if (name === "dashboard") renderDashboard();
    else if (name === "clientes") renderClientes();
    else if (name === "prestamos") renderPrestamos();
    else if (name === "pagos") renderPagos();
    else if (name === "historial") renderHistorial();
    else if (name === "reportes") initReporte();
    else if (name === "config") renderConfig();
  }

  // === DASHBOARD ===
  function renderDashboard() {
    var totalM = 0, totalCobrado = 0, activos = 0, vencidos = 0;
    prestamos.forEach(function (pr) {
      var e = getEstado(pr);
      totalM += Number(pr.montoTotal || 0);
      if (e === "activo") activos++;
      if (e === "vencido") vencidos++;
      pagos.forEach(function (p) { if (p.prestamoId === pr.id) totalCobrado += Number(p.monto || 0); });
    });
    var pendiente = totalM - totalCobrado;
    var kpiHtml = '<div class="kpi"><div class="kpi-label">Total prestamos</div><div class="kpi-value">' + prestamos.length + '</div></div>';
    kpiHtml += '<div class="kpi"><div class="kpi-label">Monto total prestado</div><div class="kpi-value">' + fmtMoney(totalM) + '</div></div>';
    kpiHtml += '<div class="kpi"><div class="kpi-label">Activos</div><div class="kpi-value">' + activos + '</div></div>';
    kpiHtml += '<div class="kpi"><div class="kpi-label">Vencidos</div><div class="kpi-value">' + vencidos + '</div></div>';
    kpiHtml += '<div class="kpi"><div class="kpi-label">Cobrado</div><div class="kpi-value">' + fmtMoney(totalCobrado) + '</div></div>';
    kpiHtml += '<div class="kpi"><div class="kpi-label">Pendiente</div><div class="kpi-value">' + fmtMoney(pendiente) + '</div></div>';
    $("#kpiGrid").innerHTML = kpiHtml;

    var recent = prestamos.slice().sort(function (a, b) { return a.fechaInicio < b.fechaInicio ? 1 : -1; }).slice(0, 5);
    var html = "";
    recent.forEach(function (pr) {
      var cl = clienteById(pr.clienteId);
      var e = getEstado(pr);
      html += '<div class="list-item" data-prestamo="' + pr.id + '"><div class="li-row"><div><div class="li-title">' + esc(cl ? cl.nombre : "?") + '</div><div class="li-sub">' + fmtMoney(pr.montoTotal) + ' | ' + fmtDate(pr.fechaInicio) + '</div></div><span class="badge ' + e + '">' + estadoLabel(e) + '</span></div></div>';
    });
    if (!recent.length) html = '<div class="empty"><p>Sin prestamos aun.</p></div>';
    $("#dashRecent").innerHTML = html;
  }

  // === CLIENTES ===
  function renderClientes() {
    var q = ($("#searchCliente") || {}).value || "";
    q = q.toLowerCase();
    var list = clientes.filter(function (c) {
      if (!q) return true;
      return (c.nombre || "").toLowerCase().indexOf(q) >= 0 || (c.documento || "").indexOf(q) >= 0 || (c.telefono || "").indexOf(q) >= 0;
    });
    var html = "";
    list.forEach(function (c) {
      var prCount = prestamos.filter(function (p) { return p.clienteId === c.id; }).length;
      html += '<div class="list-item" data-cliente="' + c.id + '"><div class="li-row"><div><div class="li-title">' + esc(c.nombre) + '</div><div class="li-sub">' + esc(c.documento || "") + (c.telefono ? ' | ' + esc(c.telefono) : '') + '</div></div><div class="li-right"><div class="li-sub">' + prCount + ' prestamo(s)</div></div></div></div>';
    });
    if (!list.length) html = "";
    $("#clienteList").innerHTML = html;
    $("#clienteEmpty").classList.toggle("hidden", list.length > 0);
  }

  // === PRESTAMOS ===
  function renderPrestamos() {
    var q = ($("#searchPrestamo") || {}).value || "";
    var ef = ($("#filterEstado") || {}).value || "";
    q = q.toLowerCase();
    var list = prestamos.filter(function (pr) {
      var cl = clienteById(pr.clienteId);
      var nombre = cl ? cl.nombre.toLowerCase() : "";
      if (q && nombre.indexOf(q) < 0 && String(pr.montoTotal).indexOf(q) < 0) return false;
      if (ef && getEstado(pr) !== ef) return false;
      return true;
    });
    var html = "";
    list.forEach(function (pr) {
      var cl = clienteById(pr.clienteId);
      var e = getEstado(pr);
      var pagado = 0;
      pagos.forEach(function (p) { if (p.prestamoId === pr.id) pagado += Number(p.monto || 0); });
      html += '<div class="list-item" data-prestamo="' + pr.id + '"><div class="li-row"><div><div class="li-title">' + esc(cl ? cl.nombre : "?") + '</div><div class="li-sub">' + fmtMoney(pr.montoTotal) + ' | Cuota: ' + fmtMoney(pr.cuotaMonto) + ' | Pagado: ' + fmtMoney(pagado) + '</div></div><span class="badge ' + e + '">' + estadoLabel(e) + '</span></div></div>';
    });
    if (!list.length) html = "";
    $("#prestamoList").innerHTML = html;
    $("#prestamoEmpty").classList.toggle("hidden", list.length > 0);
  }

  // === PAGOS ===
  function renderPagos() {
    var fp = ($("#filterPagoPrestamo") || {}).value || "";
    var list = pagos.filter(function (p) { return !fp || p.prestamoId === fp; });
    list.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    var html = "";
    list.forEach(function (p) {
      var pr = null;
      prestamos.forEach(function (x) { if (x.id === p.prestamoId) pr = x; });
      var cl = pr ? clienteById(pr.clienteId) : null;
      html += '<div class="list-item"><div class="li-row"><div><div class="li-title">' + fmtMoney(p.monto) + '</div><div class="li-sub">' + esc(cl ? cl.nombre : "?") + ' | ' + fmtDate(p.fecha) + ' | ' + esc(p.metodo || "efectivo") + '</div></div></div></div>';
    });
    if (!list.length) html = "";
    $("#pagoList").innerHTML = html;
    $("#pagoEmpty").classList.toggle("hidden", list.length > 0);
  }

  // === HISTORIAL ===
  function renderHistorial() {
    var fc = ($("#histCliente") || {}).value || "";
    var ft = ($("#histTipo") || {}).value || "";
    var fd = ($("#histDesde") || {}).value || "";
    var fh = ($("#histHasta") || {}).value || "";
    var items = [];

    prestamos.forEach(function (pr) {
      var cl = clienteById(pr.clienteId);
      var cn = cl ? cl.nombre : "";
      if (fc && pr.clienteId !== fc) return;
      if (ft && ft !== "prestamo") return;
      if (fd && pr.fechaInicio < fd) return;
      if (fh && pr.fechaInicio > fh) return;
      items.push({ fecha: pr.fechaInicio, tipo: "Prestamo", cliente: cn, desc: "Monto: " + fmtMoney(pr.montoTotal), monto: pr.montoTotal });
    });

    pagos.forEach(function (p) {
      var pr = null;
      prestamos.forEach(function (x) { if (x.id === p.prestamoId) pr = x; });
      var cl = pr ? clienteById(pr.clienteId) : null;
      var cn = cl ? cl.nombre : "";
      if (fc && pr && pr.clienteId !== fc) return;
      if (ft && ft !== "pago") return;
      if (fd && p.fecha < fd) return;
      if (fh && p.fecha > fh) return;
      items.push({ fecha: p.fecha, tipo: "Pago", cliente: cn, desc: esc(p.metodo || "efectivo"), monto: p.monto });
    });

    prestamos.forEach(function (pr) {
      if (pr.fechaFin && getEstado(pr) === "vencido") {
        var cl = clienteById(pr.clienteId);
        var cn = cl ? cl.nombre : "";
        if (fc && pr.clienteId !== fc) return;
        if (ft && ft !== "vencimiento") return;
        if (fd && pr.fechaFin < fd) return;
        if (fh && pr.fechaFin > fh) return;
        items.push({ fecha: pr.fechaFin, tipo: "Vencimiento", cliente: cn, desc: "Prestamo vencido", monto: 0 });
      }
    });

    items.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    var html = "";
    items.forEach(function (it) {
      var color = it.tipo === "Pago" ? "color:var(--ok)" : it.tipo === "Vencimiento" ? "color:var(--danger)" : "";
      html += '<div class="list-item"><div class="li-row"><div><div class="li-title" style="' + color + '">' + esc(it.tipo) + '</div><div class="li-sub">' + esc(it.cliente) + ' | ' + fmtDate(it.fecha) + ' | ' + esc(it.desc) + '</div></div><div class="li-right"><div class="li-title">' + fmtMoney(it.monto) + '</div></div></div></div>';
    });
    if (!items.length) html = "";
    $("#histList").innerHTML = html;
    $("#histEmpty").classList.toggle("hidden", items.length > 0);
  }

  // === REPORTES ===
  function initReporte() {
    var now = new Date();
    var m = (now.getMonth() + 1 < 10 ? "0" : "") + (now.getMonth() + 1);
    if ($("#reporteMes")) $("#reporteMes").value = now.getFullYear() + "-" + m;
  }

  function generateReport() {
    var mes = ($("#reporteMes") || {}).value || "";
    if (!mes) { toast("Selecciona un mes"); return; }
    var items = [];
    var nuevos = 0, totalPagado = 0;

    prestamos.forEach(function (pr) {
      if (pr.fechaInicio && pr.fechaInicio.indexOf(mes) === 0) {
        var cl = clienteById(pr.clienteId);
        items.push({ fecha: pr.fechaInicio, tipo: "Prestamo nuevo", cliente: cl ? cl.nombre : "?", desc: fmtMoney(pr.montoTotal), monto: pr.montoTotal });
        nuevos++;
      }
    });

    pagos.forEach(function (p) {
      if (p.fecha && p.fecha.indexOf(mes) === 0) {
        var pr = null;
        prestamos.forEach(function (x) { if (x.id === p.prestamoId) pr = x; });
        var cl = pr ? clienteById(pr.clienteId) : null;
        items.push({ fecha: p.fecha, tipo: "Pago", cliente: cl ? cl.nombre : "?", desc: esc(p.metodo || ""), monto: p.monto });
        totalPagado += Number(p.monto || 0);
      }
    });

    items.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });

    var statsHtml = '<div class="kpi"><div class="kpi-label">Nuevos prestamos</div><div class="kpi-value">' + nuevos + '</div></div>';
    statsHtml += '<div class="kpi"><div class="kpi-label">Pagos recibidos</div><div class="kpi-value">' + fmtMoney(totalPagado) + '</div></div>';
    statsHtml += '<div class="kpi"><div class="kpi-label">Movimientos</div><div class="kpi-value">' + items.length + '</div></div>';
    $("#reporteStats").innerHTML = statsHtml;

    var rows = "";
    items.forEach(function (it) {
      rows += "<tr><td>" + fmtDate(it.fecha) + "</td><td>" + esc(it.tipo) + "</td><td>" + esc(it.cliente) + "</td><td>" + esc(it.desc) + "</td><td>" + fmtMoney(it.monto) + "</td></tr>";
    });
    if (!rows) rows = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin movimientos este mes</td></tr>';
    $("#reporteTbody").innerHTML = rows;
    $("#reporteTitle").textContent = "Reporte: " + mes;
  }

  function exportCSV() {
    var mes = ($("#reporteMes") || {}).value || "";
    var items = [];
    prestamos.forEach(function (pr) {
      if (pr.fechaInicio && pr.fechaInicio.indexOf(mes) === 0) {
        var cl = clienteById(pr.clienteId);
        items.push([pr.fechaInicio, "Prestamo", cl ? cl.nombre : "", pr.montoTotal, ""]);
      }
    });
    pagos.forEach(function (p) {
      if (p.fecha && p.fecha.indexOf(mes) === 0) {
        var pr = null;
        prestamos.forEach(function (x) { if (x.id === p.prestamoId) pr = x; });
        var cl = pr ? clienteById(pr.clienteId) : null;
        items.push([p.fecha, "Pago", cl ? cl.nombre : "", p.monto, p.metodo]);
      }
    });
    var csv = "Fecha,Tipo,Cliente,Monto,Detalle\n";
    items.forEach(function (r) { csv += r.join(",") + "\n"; });
    var blob = new Blob([csv], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "reporte-" + mes + ".csv";
    a.click();
    toast("CSV exportado");
  }

  // === CONFIG ===
  function renderConfig() {
    if (sesion) {
      $("#miCuentaInfo").textContent = sesion.nombre + " | DNI: " + sesion.dni + " | Permiso: " + rolNombre(sesion.rol);
    }
    $("#cfgEmpresa").value = appCfg.empresa || "";
    $("#cfgTasa").value = appCfg.tasaInteres || 10;
    $("#cfgMoneda").value = appCfg.moneda || "S/";
    $("#cfgColor").value = appCfg.colorPrimario || "#7C3AED";
    if (appCfg.logo) {
      $("#logoPreview").src = appCfg.logo;
      $("#logoPreview").classList.remove("hidden");
    } else {
      $("#logoPreview").classList.add("hidden");
    }
    renderUsuarios();
    renderAudit();
    renderColorGrid();
  }

  function renderUsuarios() {
    var html = "";
    usuarios.forEach(function (u) {
      html += '<div class="list-item" data-edit-user="' + u.id + '"><div class="li-row"><div><div class="li-title">' + esc(u.nombre) + '</div><div class="li-sub">DNI: ' + esc(u.dni) + ' | ' + rolNombre(u.rol) + '</div></div></div></div>';
    });
    $("#usuariosList").innerHTML = html;
  }

  function renderAudit() {
    var html = "";
    auditoria.forEach(function (a) {
      html += '<div class="list-item"><div class="li-title" style="font-size:13px">' + esc(a.usuario) + ' - ' + esc(a.accion) + '</div><div class="li-sub">' + esc(a.fecha) + '</div></div>';
    });
    if (!auditoria.length) html = "";
    $("#auditList").innerHTML = html;
    $("#auditEmpty").classList.toggle("hidden", auditoria.length > 0);
  }

  function renderColorGrid() {
    var colors = ["#7C3AED", "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#4F46E5", "#16A34A", "#EA580C", "#DB2777", "#6D28D9"];
    var html = "";
    colors.forEach(function (c) {
      html += '<div class="color-swatch' + (appCfg.colorPrimario === c ? " active" : "") + '" data-color="' + c + '" style="background:' + c + '"></div>';
    });
    $("#colorGrid").innerHTML = html;
  }

  // === CRUD ===
  function saveCliente() {
    var id = $("#clId").value || uid();
    var nombre = $("#clNombre").value.trim();
    var doc = $("#clDoc").value.trim();
    if (!nombre || !doc) { toast("Nombre y documento son obligatorios"); return; }
    var obj = {
      id: id, nombre: nombre, documento: doc,
      telefono: $("#clTel").value.trim(),
      direccion: $("#clDir").value.trim(),
      email: $("#clEmail").value.trim(),
      notas: $("#clNotas").value.trim(),
      fechaRegistro: nowStamp()
    };
    DB.put("clientes", obj).then(function () {
      audit("Cliente guardado: " + nombre);
      toast("Cliente guardado");
      closeModal("modalCliente");
      return reload();
    }).then(function () { renderClientes(); });
  }

  function savePrestamo() {
    var clienteId = $("#prCliente").value;
    var monto = parseFloat($("#prMonto").value);
    var tasa = parseFloat($("#prTasa").value) || 0;
    var cuotas = parseInt($("#prCuotas").value) || 1;
    var entregado = parseFloat($("#prEntregado").value) || 0;
    var fecha = $("#prFecha").value;
    if (!clienteId || !monto || !fecha) { toast("Completa los campos obligatorios"); return; }
    var cuotaMonto = calcCuota(monto, tasa, cuotas);
    var frecuencia = $("#prFrecuencia").value;
    var dias = frecuencia === "semanal" ? 7 : frecuencia === "quincenal" ? 15 : 30;
    var totalDias = cuotas * dias;
    var fechaFin = normFecha(new Date(new Date(fecha + "T00:00:00").getTime() + totalDias * 86400000));
    var montoTotal = monto + (monto * tasa / 100 * cuotas);
    var obj = {
      id: uid(), clienteId: clienteId,
      monto: monto, tasa: tasa, cuotas: cuotas,
      cuotaMonto: Math.round(cuotaMonto * 100) / 100,
      montoEntregado: entregado, montoTotal: montoTotal,
      frecuencia: frecuencia,
      fechaInicio: normFecha(fecha), fechaFin: fechaFin,
      estado: "activo",
      notas: $("#prNotas").value.trim(),
      fechaCreacion: nowStamp()
    };
    DB.put("prestamos", obj).then(function () {
      var cl = clienteById(clienteId);
      audit("Prestamo creado: " + (cl ? cl.nombre : clienteId) + " | " + fmtMoney(montoTotal));
      toast("Prestamo registrado");
      closeModal("modalPrestamo");
      return reload();
    }).then(function () { renderPrestamos(); });
  }

  function savePago() {
    var prestamoId = $("#pgPrestamo").value;
    var monto = parseFloat($("#pgMonto").value);
    var fecha = $("#pgFecha").value;
    if (!prestamoId || !monto || !fecha) { toast("Completa los campos obligatorios"); return; }
    var obj = {
      id: uid(), prestamoId: prestamoId,
      monto: monto, fecha: normFecha(fecha),
      metodo: $("#pgMetodo").value,
      notas: $("#pgNotas").value.trim(),
      fechaCreacion: nowStamp()
    };
    DB.put("pagos", obj).then(function () {
      audit("Pago registrado: " + fmtMoney(monto));
      toast("Pago registrado");
      closeModal("modalPago");
      return reload();
    }).then(function () { renderPagos(); });
  }

  function cancelarPrestamo(id) {
    if (!confirm("Cancelar este prestamo?")) return;
    var pr = null;
    prestamos.forEach(function (x) { if (x.id === id) pr = x; });
    if (!pr) return;
    pr.estado = "cancelado";
    DB.put("prestamos", pr).then(function () {
      audit("Prestamo cancelado");
      toast("Prestamo cancelado");
      closeModal("modalDetalle");
      return reload();
    }).then(function () { renderPrestamos(); });
  }

  function saveUsuario() {
    var id = $("#usId").value || uid();
    var nombre = $("#usNombre").value.trim();
    var dni = $("#usDni").value.trim();
    if (!nombre || !dni) { toast("Nombre y DNI obligatorios"); return; }
    var clave = $("#usClave").value.trim() || dni;
    var rol = parseInt($("#usRol").value);
    var obj = { id: id, nombre: nombre, dni: dni, clave: clave, rol: rol };
    DB.putUsuario(obj).then(function () {
      audit("Usuario guardado: " + nombre);
      toast("Usuario guardado");
      closeModal("modalUsuario");
      return reload();
    }).then(function () { renderUsuarios(); });
  }

  function deleteUsuario(id) {
    if (id === (sesion && sesion.id)) { toast("No puedes eliminar tu propio usuario"); return; }
    if (!confirm("Eliminar este usuario?")) return;
    DB.deleteUsuario(id).then(function () {
      audit("Usuario eliminado");
      toast("Usuario eliminado");
      closeModal("modalUsuario");
      return reload();
    }).then(function () { renderUsuarios(); });
  }

  // === MODALS ===
  function openModal(id) { $(id).classList.remove("hidden"); }
  function closeModal(id) { $(id).classList.add("hidden"); }

  function openClienteForm(id) {
    if (id) {
      var c = clienteById(id);
      if (!c) return;
      $("#mcTitle").textContent = "Editar cliente";
      $("#clId").value = c.id;
      $("#clNombre").value = c.nombre || "";
      $("#clDoc").value = c.documento || "";
      $("#clTel").value = c.telefono || "";
      $("#clDir").value = c.direccion || "";
      $("#clEmail").value = c.email || "";
      $("#clNotas").value = c.notas || "";
    } else {
      $("#mcTitle").textContent = "Nuevo cliente";
      $("#clId").value = "";
      $("#clNombre").value = "";
      $("#clDoc").value = "";
      $("#clTel").value = "";
      $("#clDir").value = "";
      $("#clEmail").value = "";
      $("#clNotas").value = "";
    }
    openModal("#modalCliente");
  }

  function openPrestamoForm() {
    if (!clientes.length) { toast("Registra un cliente primero"); return; }
    var sel = $("#prCliente");
    sel.innerHTML = "";
    clientes.forEach(function (c) {
      sel.innerHTML += '<option value="' + c.id + '">' + esc(c.nombre) + ' (' + esc(c.documento) + ')</option>';
    });
    $("#prId").value = "";
    $("#prMonto").value = "";
    $("#prTasa").value = appCfg.tasaInteres || 10;
    $("#prCuotas").value = 12;
    $("#prEntregado").value = "";
    $("#prFecha").value = todayISO();
    $("#prFrecuencia").value = "mensual";
    $("#prNotas").value = "";
    openModal("#modalPrestamo");
  }

  function openPagoForm() {
    if (!prestamos.length) { toast("Registra un prestamo primero"); return; }
    var sel = $("#pgPrestamo");
    sel.innerHTML = "";
    prestamos.forEach(function (pr) {
      var cl = clienteById(pr.clienteId);
      var e = getEstado(pr);
      if (e === "cancelado" || e === "pagado") return;
      sel.innerHTML += '<option value="' + pr.id + '">' + esc(cl ? cl.nombre : "?") + ' | ' + fmtMoney(pr.montoTotal) + '</option>';
    });
    $("#pgMonto").value = "";
    $("#pgFecha").value = todayISO();
    $("#pgMetodo").value = "efectivo";
    $("#pgNotas").value = "";
    updatePagoInfo();
    openModal("#modalPago");
  }

  function updatePagoInfo() {
    var pid = ($("#pgPrestamo") || {}).value || "";
    var pr = null;
    prestamos.forEach(function (x) { if (x.id === pid) pr = x; });
    if (!pr) { var el = $("#pgInfo"); if (el) el.classList.add("hidden"); return; }
    var pagado = 0;
    pagos.forEach(function (p) { if (p.prestamoId === pr.id) pagado += Number(p.monto || 0); });
    var pend = pr.montoTotal - pagado;
    var el = $("#pgInfo");
    el.innerHTML = "Monto total: " + fmtMoney(pr.montoTotal) + " | Pagado: " + fmtMoney(pagado) + " | Pendiente: " + fmtMoney(pend) + " | Cuota: " + fmtMoney(pr.cuotaMonto);
    el.classList.remove("hidden");
  }

  function openDetalle(id) {
    var pr = null;
    prestamos.forEach(function (x) { if (x.id === id) pr = x; });
    if (!pr) return;
    currentDetailId = id;
    var cl = clienteById(pr.clienteId);
    var e = getEstado(pr);
    var pagado = 0;
    pagos.forEach(function (p) { if (p.prestamoId === pr.id) pagado += Number(p.monto || 0); });
    var pend = pr.montoTotal - pagado;
    var html = '<div class="info-box">';
    html += '<strong>Cliente:</strong> ' + esc(cl ? cl.nombre : "?") + '<br>';
    html += '<strong>Monto prestado:</strong> ' + fmtMoney(pr.monto) + '<br>';
    html += '<strong>Monto total (con interes):</strong> ' + fmtMoney(pr.montoTotal) + '<br>';
    html += '<strong>Tasa mensual:</strong> ' + pr.tasa + '%<br>';
    html += '<strong>Cuotas:</strong> ' + pr.cuotas + ' | Cuota: ' + fmtMoney(pr.cuotaMonto) + '<br>';
    html += '<strong>Frecuencia:</strong> ' + (pr.frecuencia || "mensual") + '<br>';
    html += '<strong>Entregado:</strong> ' + fmtMoney(pr.montoEntregado) + '<br>';
    html += '<strong>Inicio:</strong> ' + fmtDate(pr.fechaInicio) + ' | Fin: ' + fmtDate(pr.fechaFin) + '<br>';
    html += '<strong>Estado:</strong> <span class="badge ' + e + '">' + estadoLabel(e) + '</span><br>';
    html += '<strong>Pagado:</strong> ' + fmtMoney(pagado) + ' | Pendiente: ' + fmtMoney(pend);
    if (pr.notas) html += '<br><strong>Notas:</strong> ' + esc(pr.notas);
    html += '</div>';
    $("#detInfo").innerHTML = html;

    var phtml = "";
    var pList = pagos.filter(function (p) { return p.prestamoId === pr.id; });
    pList.sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; });
    pList.forEach(function (p) {
      phtml += '<div class="list-item"><div class="li-row"><div><div class="li-title">' + fmtMoney(p.monto) + '</div><div class="li-sub">' + fmtDate(p.fecha) + ' | ' + esc(p.metodo || "efectivo") + (p.notas ? ' | ' + esc(p.notas) : '') + '</div></div></div></div>';
    });
    if (!pList.length) phtml = '<div class="empty"><p>Sin pagos registrados.</p></div>';
    $("#detPagos").innerHTML = phtml;
    openModal("#modalDetalle");
  }

  function openUsuarioForm(id) {
    if (id) {
      var u = null;
      usuarios.forEach(function (x) { if (x.id === id) u = x; });
      if (!u) return;
      $("#muTitle").textContent = "Editar usuario";
      $("#usId").value = u.id;
      $("#usNombre").value = u.nombre;
      $("#usDni").value = u.dni;
      $("#usClave").value = "";
      $("#usRol").value = u.rol;
      $("#btnDelUsuario").classList.toggle("hidden", u.id === (sesion && sesion.id));
    } else {
      $("#muTitle").textContent = "Nuevo usuario";
      $("#usId").value = "";
      $("#usNombre").value = "";
      $("#usDni").value = "";
      $("#usClave").value = "";
      $("#usRol").value = "1";
      $("#btnDelUsuario").classList.add("hidden");
    }
    openModal("#modalUsuario");
  }

  // === LOGIN ===
  function doLogin() {
    var user = ($("#loginUser") || {}).value.trim().toLowerCase();
    var pass = ($("#loginPass") || {}).value.trim();
    if (!user || !pass) { showLoginErr("Ingresa usuario y contrasena"); return; }
    var found = null;
    usuarios.forEach(function (u) {
      if ((u.dni || "").toLowerCase() === user && u.clave === pass) found = u;
    });
    if (!found) { showLoginErr("Credenciales incorrectas"); return; }
    sesion = found;
    DB.setSesion(found).then(function () {
      audit("Sesion iniciada: " + found.nombre);
      afterLogin();
    });
  }

  function showLoginErr(msg) {
    var el = $("#loginErr");
    el.textContent = msg;
    el.classList.remove("hidden");
  }

  function afterLogin() {
    $("#loginScreen").classList.add("hidden");
    $("#topbar").classList.remove("hidden");
    $("#mainContent").classList.remove("hidden");
    if (sesion) {
      $("#sesionInfo").textContent = sesion.nombre + " | " + rolNombre(sesion.rol);
    }
    setView("dashboard");
  }

  function doLogout() {
    sesion = null;
    DB.clearSesion().then(function () {
      $("#loginScreen").classList.remove("hidden");
      $("#topbar").classList.add("hidden");
      $("#mainContent").classList.add("hidden");
      toggleSidebar(false);
    });
  }

  // === BACKUP ===
  function exportData() {
    Promise.all([
      DB.getAll("clientes"), DB.getAll("prestamos"), DB.getAll("pagos"),
      DB.getUsuarios(), DB.getAll("config"), DB.getAuditoria(9999)
    ]).then(function (results) {
      var data = {
        version: CFG.APP_VERSION,
        exportDate: nowStamp(),
        clientes: results[0], prestamos: results[1], pagos: results[2],
        usuarios: results[3], config: results[4], auditoria: results[5]
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "prestamos-backup-" + todayISO() + ".json";
      a.click();
      toast("Datos exportados");
    });
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var promises = [];
        if (data.clientes) data.clientes.forEach(function (c) { promises.push(DB.put("clientes", c)); });
        if (data.prestamos) data.prestamos.forEach(function (p) { promises.push(DB.put("prestamos", p)); });
        if (data.pagos) data.pagos.forEach(function (p) { promises.push(DB.put("pagos", p)); });
        if (data.usuarios) data.usuarios.forEach(function (u) { promises.push(DB.putUsuario(u)); });
        if (data.config) data.config.forEach(function (c) { promises.push(DB.put("config", c)); });
        Promise.all(promises).then(function () {
          toast("Datos importados");
          return reload();
        }).then(function () { renderConfig(); });
      } catch (err) { toast("Error al importar: " + err.message); }
    };
    reader.readAsText(file);
  }

  // === INIT ===
  function init() {
    return reload().then(function () {
      return DB.getUsuarios().then(function (us) {
        usuarios = us;
        if (!usuarios.some(function (u) { return u.rol === ROL.ADMIN; })) {
          var a = { id: "us-admin", nombre: "admin", dni: "admin", clave: "admin", rol: ROL.ADMIN };
          usuarios.push(a);
          return DB.putUsuario(a);
        }
      });
    }).then(function () {
      return DB.getSesion();
    }).then(function (saved) {
      if (saved) {
        sesion = saved;
        afterLogin();
      } else {
        $("#loginScreen").classList.remove("hidden");
        if (appCfg.empresa) {
          $("#loginSub").textContent = appCfg.empresa + " - Sistema de Prestamos";
        }
      }
      setTimeout(function () {
        var sp = $("#splash");
        if (sp) sp.classList.add("gone");
      }, 600);
      setupEvents();
    }).catch(function (err) {
      console.error("Init error:", err);
      var sp = $("#splash");
      if (sp) sp.classList.add("gone");
      $("#loginScreen").classList.remove("hidden");
    });
  }

  function setupEvents() {
    $("#btnLogin").addEventListener("click", doLogin);
    $("#loginPass").addEventListener("keydown", function (e) { if (e.key === "Enter") doLogin(); });
    $("#btnLogout").addEventListener("click", doLogout);
    $("#btnMenu").addEventListener("click", function () { toggleSidebar(true); });
    $("#backdrop").addEventListener("click", function () { toggleSidebar(false); });

    $$(".nav-item").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.dataset.view); });
    });
    $$("[data-close]").forEach(function (b) {
      b.addEventListener("click", function () { closeModal(b.dataset.close); });
    });
    $$(".toggle-card").forEach(function (h) {
      h.addEventListener("click", function () {
        var body = $("#" + h.dataset.toggle);
        if (body) body.classList.toggle("hidden");
      });
    });

    $("#btnNuevoCliente").addEventListener("click", function () { openClienteForm(); });
    $("#btnSaveCliente").addEventListener("click", saveCliente);
    $("#searchCliente").addEventListener("input", renderClientes);
    $("#clienteList").addEventListener("click", function (e) {
      var card = e.target.closest("[data-cliente]");
      if (card) openClienteForm(card.dataset.cliente);
    });

    $("#btnNuevoPrestamo").addEventListener("click", openPrestamoForm);
    $("#btnSavePrestamo").addEventListener("click", savePrestamo);
    $("#searchPrestamo").addEventListener("input", renderPrestamos);
    $("#filterEstado").addEventListener("change", renderPrestamos);
    $("#prestamoList").addEventListener("click", function (e) {
      var card = e.target.closest("[data-prestamo]");
      if (card) openDetalle(card.dataset.prestamo);
    });

    $("#btnNuevoPago").addEventListener("click", openPagoForm);
    $("#btnSavePago").addEventListener("click", savePago);
    $("#pgPrestamo").addEventListener("change", updatePagoInfo);
    $("#filterPagoPrestamo").addEventListener("change", renderPagos);

    $("#btnCancelPrestamo").addEventListener("click", function () {
      if (currentDetailId) cancelarPrestamo(currentDetailId);
    });
    $("#btnPagoFromDet").addEventListener("click", function () {
      closeModal("modalDetalle");
      openPagoForm();
    });

    $("#btnHistSearch").addEventListener("click", renderHistorial);
    $("#btnHistClear").addEventListener("click", function () {
      $("#histCliente").value = "";
      $("#histTipo").value = "";
      $("#histDesde").value = "";
      $("#histHasta").value = "";
      renderHistorial();
    });

    $("#btnGenReporte").addEventListener("click", generateReport);
    $("#btnExportCsv").addEventListener("click", exportCSV);

    $("#btnSaveNegocio").addEventListener("click", function () {
      appCfg.empresa = $("#cfgEmpresa").value.trim();
      appCfg.tasaInteres = parseFloat($("#cfgTasa").value) || 10;
      appCfg.moneda = $("#cfgMoneda").value;
      Promise.all([DB.setConfig("empresa", appCfg.empresa), DB.setConfig("tasaInteres", appCfg.tasaInteres), DB.setConfig("moneda", appCfg.moneda)]).then(function () {
        audit("Configuracion del negocio actualizada");
        toast("Guardado");
      });
    });

    $("#colorGrid").addEventListener("click", function (e) {
      var sw = e.target.closest(".color-swatch");
      if (sw) {
        $$(".color-swatch").forEach(function (s) { s.classList.remove("active"); });
        sw.classList.add("active");
        $("#cfgColor").value = sw.dataset.color;
      }
    });

    $("#btnSaveApariencia").addEventListener("click", function () {
      var color = $("#cfgColor").value;
      appCfg.colorPrimario = color;
      applyTheme(color);
      DB.setConfig("colorPrimario", color).then(function () {
        audit("Color actualizado");
        toast("Apariencia guardada");
      });
    });

    $("#logoInput").addEventListener("change", function (e) {
      if (e.target.files[0]) {
        var reader = new FileReader();
        reader.onload = function (ev) {
          var dataUrl = ev.target.result;
          appCfg.logo = dataUrl;
          applyLogo(dataUrl);
          DB.setConfig("logo", dataUrl).then(function () {
            $("#logoPreview").src = dataUrl;
            $("#logoPreview").classList.remove("hidden");
            toast("Logo actualizado");
          });
        };
        reader.readAsDataURL(e.target.files[0]);
      }
    });

    $("#btnClearLogo").addEventListener("click", function () {
      appCfg.logo = "";
      applyLogo("");
      DB.setConfig("logo", "").then(function () {
        $("#logoPreview").classList.add("hidden");
        toast("Logo eliminado");
      });
    });

    $("#btnMiPerfil").addEventListener("click", function () {
      if (sesion) openUsuarioForm(sesion.id);
    });
    $("#btnNuevoUsuario").addEventListener("click", function () { openUsuarioForm(); });
    $("#btnSaveUsuario").addEventListener("click", saveUsuario);
    $("#btnDelUsuario").addEventListener("click", function () {
      var id = $("#usId").value;
      if (id) deleteUsuario(id);
    });
    $("#usuariosList").addEventListener("click", function (e) {
      var card = e.target.closest("[data-edit-user]");
      if (card) openUsuarioForm(card.dataset.editUser);
    });

    $("#btnExport").addEventListener("click", exportData);
    $("#btnImport").addEventListener("click", function () { $("#fileImport").click(); });
    $("#fileImport").addEventListener("change", function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    var historialClientes = $("#histCliente");
    if (historialClientes) {
      historialClientes.innerHTML = '<option value="">Todos los clientes</option>';
    }
  }

  function populateHistClientes() {
    var sel = $("#histCliente");
    if (!sel) return;
    sel.innerHTML = '<option value="">Todos los clientes</option>';
    clientes.forEach(function (c) {
      sel.innerHTML += '<option value="' + c.id + '">' + esc(c.nombre) + '</option>';
    });
  }

  window.onerror = function (msg, url, line) {
    var d = document.getElementById("splash");
    if (d) { d.innerHTML = "<div style='padding:20px;color:#fff;font-size:14px;text-align:left'>ERROR: " + msg + " (L" + line + ")</div>"; d.classList.remove("gone"); }
    return false;
  };

  var _booted = false;
  function boot() {
    if (_booted) return;
    _booted = true;
    init().then(function () {}).catch(function (err) {
      console.error("Boot error:", err);
      var sp = document.getElementById("splash");
      if (sp) sp.classList.add("gone");
      var ls = document.getElementById("loginScreen");
      if (ls) ls.classList.remove("hidden");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  setTimeout(boot, 500);
})();
