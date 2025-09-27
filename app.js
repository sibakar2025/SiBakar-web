import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

// inisialisasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCpBVzHfQRENwdlF9LkVwAGq0_uXiZs-aA",
  databaseURL: "https://sibakar-2bf33-default-rtdb.asia-southeast1.firebasedatabase.app"
};
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// DOM
const tempEl   = document.getElementById("temperature");
const mq2El    = document.getElementById("mq2");
const mq7El    = document.getElementById("mq7");
const apiEl    = document.getElementById("apiStatus");
const logTable = document.querySelector("#logTable tbody");
const exportBtn= document.getElementById("exportBtn");
const banner   = document.getElementById("fireBanner");
const apiCard  = document.querySelector(".sensor-card.api");

// Chart helper
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

// history arrays limited
const history = { suhu:[], mq2:[], mq7:[] };
function genInsight(arr,label,th) {
  if(arr.length<2) return "Belum cukup data";
  const d = (arr.at(-1)-arr.at(-2)).toFixed(1);
  const trend = d>0?"meningkat":d<0?"menurun":"stabil";
  const status= arr.at(-1)>th?"⚠️ Melebihi":"✅ Normal";
  return `${label} ${trend} (${d}), ${status}`;
}

// notifikasi
if("Notification" in window) Notification.requestPermission();
function notifyFire(){
  if(Notification.permission==="granted"){
    new Notification("🔥 SiBAKAR Alert",{body:"Api terdeteksi!"});
  }
}

// utility: parse incoming record into uniform shape
function normalizeRecord(obj, defaultTs) {
  // possible keys: temperature, mq2, mq7, api, ts OR Suhu, MQ2, MQ7, Api
  const rec = {};
  rec.temperature = (obj.temperature ?? obj.Suhu ?? obj.Temperature ?? obj.suhu ?? null);
  rec.mq2 = (obj.mq2 ?? obj.MQ2 ?? obj.MQ_2 ?? null);
  rec.mq7 = (obj.mq7 ?? obj.MQ7 ?? obj.MQ_7 ?? null);
  rec.api  = (obj.api ?? obj.Api ?? obj.fire ?? obj.ApiTerdeteksi ?? false);
  rec.ts   = (obj.ts ?? obj.timestamp ?? obj.createdAt ?? defaultTs ?? Date.now());
  return rec;
}

// render a single entry into table row
function makeRow(entry) {
  const d = new Date(Number(entry.ts));
  const hari = d.toLocaleDateString("id-ID",{weekday:"long"});
  const tanggal = d.toLocaleDateString("id-ID");
  const waktu = d.toLocaleTimeString("id-ID");
  return `<tr>
    <td>${hari}</td><td>${tanggal}</td><td>${waktu}</td>
    <td>${(entry.temperature==null)?"--":Number(entry.temperature).toFixed(1)}</td>
    <td>${(entry.mq2==null)?"--":Number(entry.mq2).toFixed(1)}</td>
    <td>${(entry.mq7==null)?"--":Number(entry.mq7).toFixed(1)}</td>
    <td>${entry.api ? "API" : "AMAN"}</td>
  </tr>`;
}

// update charts and UI from last entry
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

  // push to charts (limit length)
  function pushToChart(chart, value) {
    chart.data.labels.push(now);
    chart.data.datasets[0].data.push(Number(value));
    if (chart.data.labels.length > 60) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    chart.update();
  }
  pushToChart(tempChart, suhu);
  pushToChart(mq2Chart, mq2);
  pushToChart(mq7Chart, mq7);

  // history for insight
  history.suhu.push(Number(suhu));
  history.mq2.push(Number(mq2));
  history.mq7.push(Number(mq7));
  if (history.suhu.length>10) history.suhu.shift();
  if (history.mq2.length>10) history.mq2.shift();
  if (history.mq7.length>10) history.mq7.shift();

  document.getElementById("insight-temp").textContent = "Insight suhu: " + genInsight(history.suhu,"Suhu",40);
  document.getElementById("insight-mq2").textContent  = "Insight MQ2: "  + genInsight(history.mq2,"Gas MQ2",300);
  document.getElementById("insight-mq7").textContent  = "Insight MQ7: "  + genInsight(history.mq7,"Gas MQ7",100);
}

// main listener: listen to /readings (adjust if your device writes to different node)
onValue(ref(db, "/readings"), snap => {
  const val = snap.val();
  const rows = [];
  // case 1: snap is object of push children
  if (val && typeof val === 'object') {
    // detect if this object is a single record or map of records
    const possibleRecords = Object.entries(val).map(([k,v]) => {
      if (v && typeof v === 'object' && (v.temperature || v.Suhu || v.MQ2 || v.MQ7 || v.ts)) {
        return normalizeRecord(v, v.ts ?? Date.now());
      }
      return null;
    }).filter(x=>x!==null);

    if (possibleRecords.length>0) {
      // sort by timestamp
      possibleRecords.sort((a,b)=>Number(a.ts)-Number(b.ts));
      possibleRecords.forEach(r=> rows.push(r));
    } else {
      // maybe val itself is a single record with direct fields
      rows.push(normalizeRecord(val, Date.now()));
    }
  }

  // rebuild table from rows
  logTable.innerHTML = "";
  rows.forEach(r => {
    logTable.insertAdjacentHTML("beforeend", makeRow(r));
  });

  // update UI from last row if exists
  if (rows.length>0) updateUIFromEntry(rows[rows.length-1]);
});

// Export Excel reads table DOM
exportBtn.addEventListener("click",()=>{
  const wb = XLSX.utils.book_new();
  const rows = [["Hari","Tanggal","Waktu","Suhu","MQ2","MQ7","Api"]];
  document.querySelectorAll("#logTable tbody tr").forEach(tr=>{
    rows.push(Array.from(tr.children).map(td=>td.textContent));
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb,ws,"LogSensor");
  XLSX.writeFile(wb,"SiBAKAR_Log.xlsx");
});