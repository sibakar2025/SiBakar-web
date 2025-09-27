// app.js (type="module")
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

/*
  Konfigurasi Firebase — sesuaikan bila perlu.
  Pastikan DatabaseURL persis sama dengan yang ada di Firebase Console tanpa trailing slash.
*/
const firebaseConfig = {
  apiKey: "AIzaSyCpBVzHfQRENwdlF9LkVwAGq0_uXiZs-aA",
  databaseURL: "https://sibakar-2bf33-default-rtdb.asia-southeast1.firebasedatabase.app"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

/* DOM refs */
const tempEl   = document.getElementById("temperature");
const mq2El    = document.getElementById("mq2");
const mq7El    = document.getElementById("mq7");
const apiEl    = document.getElementById("apiStatus");
const logTable = document.querySelector("#logTable tbody");
const exportBtn= document.getElementById("exportBtn");
const banner   = document.getElementById("fireBanner");
const apiCard  = document.querySelector(".sensor-card.api");

const reportTableBody = document.querySelector("#reportTable tbody");
const downloadReportBtn = document.getElementById("downloadReportBtn");
const clearReportBtn = document.getElementById("clearReportBtn");
const reportStatus = document.getElementById("reportStatus");

/* Chart setup */
function makeChart(ctx, color) {
  return new Chart(ctx, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: color, tension:0.3, pointRadius:0 }] },
    options:{ plugins:{ legend:{display:false} }, scales:{ x:{display:false}, y:{display:false} } }
  });
}
const tempChart = makeChart(document.getElementById("tempChart"), "#e53935");
const mq2Chart  = makeChart(document.getElementById("mq2Chart"),  "#fb8c00");
const mq7Chart  = makeChart(document.getElementById("mq7Chart"),  "#1e88e5");

/* history + entries storage */
const history = { suhu:[], mq2:[], mq7:[] };
const entries = new Map(); // keyed by unique id

function genInsight(arr,label,th) {
  if(arr.length<2) return "Belum cukup data";
  const d = (arr.at(-1)-arr.at(-2)).toFixed(1);
  const trend = d>0?"meningkat":d<0?"menurun":"stabil";
  const status= arr.at(-1)>th?"⚠️ Melebihi":"✅ Normal";
  return `${label} ${trend} (${d}), ${status}`;
}

/* Notifications */
if("Notification" in window) Notification.requestPermission();
function notifyFire(){
  if(Notification.permission==="granted"){
    new Notification("🔥 SiBAKAR Alert",{body:"Api terdeteksi!"});
  }
}

/* normalize incoming record to consistent shape */
function normalizeRecord(obj, fallbackTs = Date.now()) {
  const rec = {};
  rec.temperature = (obj.temperature ?? obj.Suhu ?? obj.Temperature ?? obj.suhu) ?? null;
  rec.mq2 = (obj.mq2 ?? obj.MQ2 ?? obj.MQ_2 ?? obj.MQ) ?? null;
  rec.mq7 = (obj.mq7 ?? obj.MQ7 ?? obj.MQ_7) ?? null;
  rec.api  = (obj.api ?? obj.Api ?? obj.fire ?? obj.ApiTerdeteksi) ?? false;
  const tsRaw = obj.ts ?? obj.timestamp ?? obj.createdAt ?? obj.time ?? fallbackTs;
  rec.ts   = Number(tsRaw) || Number(fallbackTs);
  return rec;
}

/* add/update entry */
function addOrUpdateEntry(id, rec) {
  entries.set(String(id), rec);
}

/* UI rebuild */
function rebuildUI() {
  const all = Array.from(entries.values()).sort((a,b) => a.ts - b.ts);
  logTable.innerHTML = "";
  for (const r of all) {
    const d = new Date(Number(r.ts));
    const hari = d.toLocaleDateString("id-ID",{weekday:"long"});
    const tanggal = d.toLocaleDateString("id-ID");
    const waktu = d.toLocaleTimeString("id-ID");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${hari}</td><td>${tanggal}</td><td>${waktu}</td>
      <td>${r.temperature==null?"--":Number(r.temperature).toFixed(1)}</td>
      <td>${r.mq2==null?"--":Number(r.mq2).toFixed(1)}</td>
      <td>${r.mq7==null?"--":Number(r.mq7).toFixed(1)}</td>
      <td>${r.api ? "API" : "AMAN"}</td>`;
    logTable.appendChild(tr);
  }

  if (all.length === 0) return;
  const last = all[all.length-1];
  updateUIFromEntry(last);
}

function updateUIFromEntry(entry) {
  const suhu = entry.temperature ?? 0;
  const mq2  = entry.mq2 ?? 0;
  const mq7  = entry.mq7 ?? 0;
  const api  = entry.api ?? false;

  tempEl.textContent = (suhu === null) ? "-- °C" : `${Number(suhu).toFixed(1)} °C`;
  mq2El.textContent  = `${Number(mq2).toFixed(1)} ppm`;
  mq7El.textContent  = `${Number(mq7).toFixed(1)} ppm`;
  apiEl.textContent  = api ? "API" : "AMAN";

  apiCard.classList.toggle("danger", api);
  banner.classList.toggle("show", api);
  if(api) notifyFire();

  const now = new Date().toLocaleTimeString("id-ID");
  function pushToChart(chart, value) {
    chart.data.labels.push(now);
    chart.data.datasets[0].data.push(Number(value));
    if (chart.data.labels.length > 60) { chart.data.labels.shift(); chart.data.datasets[0].data.shift(); }
    chart.update();
  }
  pushToChart(tempChart, suhu);
  pushToChart(mq2Chart, mq2);
  pushToChart(mq7Chart, mq7);

  if (!Number.isNaN(Number(suhu))) { history.suhu.push(Number(suhu)); if(history.suhu.length>10) history.suhu.shift(); }
  if (!Number.isNaN(Number(mq2)))  { history.mq2.push(Number(mq2));   if(history.mq2.length>10) history.mq2.shift(); }
  if (!Number.isNaN(Number(mq7)))  { history.mq7.push(Number(mq7));   if(history.mq7.length>10) history.mq7.shift(); }

  document.getElementById("insight-temp").textContent = "Insight suhu: " + genInsight(history.suhu,"Suhu",40);
  document.getElementById("insight-mq2").textContent  = "Insight MQ2: "  + genInsight(history.mq2,"Gas MQ2",300);
  document.getElementById("insight-mq7").textContent  = "Insight MQ7: "  + genInsight(history.mq7,"Gas MQ7",100);
}

/* process snapshot (supports push-list and single objects) */
function processSnapshot(snap, nodeKey) {
  const val = snap.val();
  if (!val) return;
  if (typeof val === "object" && Object.values(val).some(v => typeof v === "object" && (v.ts || v.temperature || v.Suhu || v.MQ2))) {
    for (const [k, v] of Object.entries(val)) {
      const rec = normalizeRecord(v, Date.now());
      addOrUpdateEntry(`${nodeKey}_${k}`, rec);
    }
  } else {
    const rec = normalizeRecord(val, Date.now());
    addOrUpdateEntry(`${nodeKey}_${rec.ts}`, rec);
  }
  rebuildUI();
}

/* attach listeners */
onValue(ref(db, "/readings"), snap => {
  try { processSnapshot(snap, "readings"); }
  catch(e){ console.error("readings handler error:", e); }
});
onValue(ref(db, "/SiBAKAR"), snap => {
  try { processSnapshot(snap, "SiBAKAR"); }
  catch(e){ console.error("SiBAKAR handler error:", e); }
});

/* Export utilities */
function exportRowsToExcel(filename, rows) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}

/* Export full log button */
exportBtn.addEventListener("click", () => {
  const rows = [["Hari","Tanggal","Waktu","Suhu","MQ2","MQ7","Api"]];
  document.querySelectorAll("#logTable tbody tr").forEach(tr => {
    rows.push(Array.from(tr.children).map(td => td.textContent));
  });
  exportRowsToExcel(`SiBAKAR_Log_Full_${new Date().toISOString().slice(0,19)}.xlsx`, rows);
});

/* ---------- Laporan otomatis setiap 3 detik ---------- */
const autoReports = []; // array of {ts, waktu, suhu, mq2, mq7, api}
let reportCounter = 0;
function pushAutoReportIfChanged() {
  const all = Array.from(entries.values()).sort((a,b) => a.ts - b.ts);
  if (all.length === 0) {
    reportStatus.textContent = "Menunggu data pertama...";
    return;
  }
  const last = all[all.length - 1];
  const d = new Date(Number(last.ts));
  const waktu = d.toLocaleString("id-ID");
  const rec = {
    ts: last.ts,
    waktu,
    suhu: last.temperature == null ? "" : Number(last.temperature).toFixed(1),
    mq2:  last.mq2 == null ? "" : Number(last.mq2).toFixed(1),
    mq7:  last.mq7 == null ? "" : Number(last.mq7).toFixed(1),
    api:  last.api ? "API" : "AMAN"
  };

  const lastReport = autoReports.at(-1);
  const changed = !lastReport || lastReport.ts !== rec.ts || lastReport.suhu !== rec.suhu || lastReport.mq2 !== rec.mq2 || lastReport.mq7 !== rec.mq7 || lastReport.api !== rec.api;
  if (!changed) {
    reportStatus.textContent = `Tidak ada perubahan sejak ${autoReports.length} laporan terakhir.`;
    return;
  }

  autoReports.push(rec);
  if (autoReports.length > 500) autoReports.shift();

  // append to report table DOM
  const tr = document.createElement("tr");
  tr.innerHTML = `<td>${++reportCounter}</td><td>${rec.waktu}</td><td>${rec.suhu}</td><td>${rec.mq2}</td><td>${rec.mq7}</td><td>${rec.api}</td>`;
  reportTableBody.prepend(tr);
  reportStatus.textContent = `Laporan otomatis terakhir: ${rec.waktu}`;
}

/* Start auto report every 3 seconds */
const AUTO_REPORT_INTERVAL_MS = 3000;
let autoReportTimer = setInterval(pushAutoReportIfChanged, AUTO_REPORT_INTERVAL_MS);
reportStatus.textContent = `Laporan otomatis berjalan setiap ${AUTO_REPORT_INTERVAL_MS/1000} detik.`;

/* Download auto reports */
downloadReportBtn.addEventListener("click", () => {
  if (autoReports.length === 0) {
    alert("Belum ada data laporan otomatis untuk diunduh.");
    return;
  }
  const rows = [["No","Waktu","Suhu","MQ2","MQ7","Api"]];
  autoReports.forEach((r,i) => {
    rows.push([i+1, r.waktu, r.suhu, r.mq2, r.mq7, r.api]);
  });
  exportRowsToExcel(`SiBAKAR_AutoReport_${new Date().toISOString().slice(0,19)}.xlsx`, rows);
});

/* Clear auto reports */
clearReportBtn.addEventListener("click", () => {
  autoReports.length = 0;
  reportTableBody.innerHTML = "";
  reportCounter = 0;
  reportStatus.textContent = "Laporan otomatis dibersihkan.";
});

/* Final log */
console.log("SiBAKAR app.js loaded - listeners attached for /readings and /SiBAKAR, auto-report every 3s.");