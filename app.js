import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// konfigurasi Firebase — sesuaikan bila perlu (hapus trailing slash)
const firebaseConfig = {
  apiKey: "AIzaSyCpBVzHfQRENwdlF9LkVwAGq0_uXiZs-aA",
  databaseURL: "https://sibakar-2bf33-default-rtdb.asia-southeast1.firebasedatabase.app"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// DOM references
const tempEl   = document.getElementById("temperature");
const mq2El    = document.getElementById("mq2");
const mq7El    = document.getElementById("mq7");
const apiEl    = document.getElementById("apiStatus");
const logTable = document.querySelector("#logTable tbody");
const exportBtn= document.getElementById("exportBtn");
const banner   = document.getElementById("fireBanner");
const apiCard  = document.querySelector(".sensor-card.api");

// Chart setup (same as sebelumnya)
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

// small history and insight helper
const history = { suhu:[], mq2:[], mq7:[] };
function genInsight(arr,label,th) {
  if(arr.length<2) return "Belum cukup data";
  const d = (arr.at(-1)-arr.at(-2)).toFixed(1);
  const trend = d>0?"meningkat":d<0?"menurun":"stabil";
  const status= arr.at(-1)>th?"⚠️ Melebihi":"✅ Normal";
  return `${label} ${trend} (${d}), ${status}`;
}

if("Notification" in window) Notification.requestPermission();
function notifyFire(){
  if(Notification.permission==="granted"){
    new Notification("🔥 SiBAKAR Alert",{body:"Api terdeteksi!"});
  }
}

// normalize incoming object to {temperature,mq2,mq7,api,ts}
function normalizeRecord(obj, fallbackTs = Date.now()) {
  const rec = {};
  rec.temperature = obj.temperature ?? obj.Suhu ?? obj.Temperature ?? obj.suhu ?? null;
  rec.mq2 = obj.mq2 ?? obj.MQ2 ?? obj.MQ_2 ?? null;
  rec.mq7 = obj.mq7 ?? obj.MQ7 ?? obj.MQ_7 ?? null;
  rec.api  = obj.api ?? obj.Api ?? obj.fire ?? obj.ApiTerdeteksi ?? false;
  rec.ts   = Number(obj.ts ?? obj.timestamp ?? obj.createdAt ?? fallbackTs);
  return rec;
}

// storage: Map keyed by unique id to avoid duplicate rows
const entries = new Map();

function addOrUpdateEntry(id, rec) {
  entries.set(String(id), rec);
}

// rebuild table and update UI from latest entry
function rebuildUI() {
  const all = Array.from(entries.values()).sort((a,b) => a.ts - b.ts);
  // rebuild table
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
    if (chart.data.labels.length > 60) {
      chart.data.labels.shift(); chart.data.datasets[0].data.shift();
    }
    chart.update();
  }
  pushToChart(tempChart, suhu);
  pushToChart(mq2Chart, mq2);
  pushToChart(mq7Chart, mq7);

  history.suhu.push(Number(suhu)); if(history.suhu.length>10) history.suhu.shift();
  history.mq2.push(Number(mq2));   if(history.mq2.length>10) history.mq2.shift();
  history.mq7.push(Number(mq7));   if(history.mq7.length>10) history.mq7.shift();

  document.getElementById("insight-temp").textContent = "Insight suhu: " + genInsight(history.suhu,"Suhu",40);
  document.getElementById("insight-mq2").textContent  = "Insight MQ2: "  + genInsight(history.mq2,"Gas MQ2",300);
  document.getElementById("insight-mq7").textContent  = "Insight MQ7: "  + genInsight(history.mq7,"Gas MQ7",100);
}

// process snapshot from any node, identifier used to prevent duplicate keys
function processSnapshot(snap, nodeKey) {
  const val = snap.val();
  if (!val) return;
  // case: push-list (object of children)
  if (typeof val === "object" && Object.values(val).some(v => typeof v === "object" && (v.ts || v.temperature || v.Suhu || v.MQ2))) {
    for (const [k, v] of Object.entries(val)) {
      const rec = normalizeRecord(v, Date.now());
      addOrUpdateEntry(`${nodeKey}_${k}`, rec);
    }
  } else {
    // single-record object
    const rec = normalizeRecord(val, Date.now());
    // use timestamp + nodeKey for uniqueness
    addOrUpdateEntry(`${nodeKey}_${rec.ts}`, rec);
  }
  rebuildUI();
}

// attach listeners to both nodes commonly used
onValue(ref(db, "/readings"), snap => {
  try { processSnapshot(snap, "readings"); }
  catch(e){ console.error("readings handler error:", e); }
});
onValue(ref(db, "/SiBAKAR"), snap => {
  try { processSnapshot(snap, "SiBAKAR"); }
  catch(e){ console.error("SiBAKAR handler error:", e); }
});

// export button (reads table DOM)
exportBtn.addEventListener("click", () => {
  const wb = XLSX.utils.book_new();
  const rows = [["Hari","Tanggal","Waktu","Suhu","MQ2","MQ7","Api"]];
  document.querySelectorAll("#logTable tbody tr").forEach(tr => {
    rows.push(Array.from(tr.children).map(td => td.textContent));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "LogSensor");
  XLSX.writeFile(wb, "SiBAKAR_Log.xlsx");
});

console.log("SiBAKAR app.js loaded - listeners attached for /readings and /SiBAKAR");