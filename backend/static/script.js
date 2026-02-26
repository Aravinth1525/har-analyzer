let globalData = null;
let chart = null;


async function upload() {

const file = document.getElementById("fileInput").files[0];

const formData = new FormData();
formData.append("file", file);

const res = await fetch("http://localhost:8000/upload", {
method: "POST",
body: formData
});

globalData = await res.json();

populateFilters();
renderSummary();
applyFilter();
}


function populateFilters() {

const methods = new Set();
const services = new Set();
const statuses = new Set();

globalData.apis.forEach(a => {

methods.add(a.method);

const svc = a.endpoint.split("/")[1];
if (svc) services.add("/" + svc);

statuses.add(a.status);

});

fillSelect("methodFilter", methods);
fillSelect("serviceFilter", services);
fillSelect("statusFilter", statuses);
}


function fillSelect(id, values) {

const select = document.getElementById(id);
select.innerHTML = `<option value="ALL">All</option>`;

values.forEach(v => select.innerHTML += `<option>${v}</option>`);
}


function renderSummary() {

const s = globalData.summary;

document.getElementById("summary").innerHTML = `
<div class="row text-center">

<div class="col">Total APIs<br><b>${s.total}</b></div>
<div class="col">Average<br><b>${(s.avg/1000).toFixed(2)} s</b></div>
<div class="col">Slowest<br><b>${(s.max/1000).toFixed(2)} s</b></div>
<div class="col">Errors<br><b>${s.failed}</b></div>

</div>
`;
}


function getFilteredApis() {

const method = document.getElementById("methodFilter").value;
const service = document.getElementById("serviceFilter").value;
const status = document.getElementById("statusFilter").value;

let apis = globalData.apis;

if (method !== "ALL") apis = apis.filter(a => a.method === method);
if (service !== "ALL") apis = apis.filter(a => a.endpoint.startsWith(service));
if (status !== "ALL") apis = apis.filter(a => String(a.status) === status);

return apis;
}


function getColor(ms) {

if (ms < 1000) return "green";
if (ms < 2000) return "orange";
return "red";

}


function drawChart(apis) {

const canvas = document.getElementById("apiChart");

if (chart) chart.destroy();

chart = new Chart(canvas, {

type: "bar",

data: {
labels: apis.map((_, i) => i + 1),
datasets: [{
label: "Response Time (seconds)",
data: apis.map(a => a.time / 1000),
backgroundColor: apis.map(a => getColor(a.time))
}]
},

options: {

plugins: {

tooltip: {
callbacks: {
label: function(context) {

const api = apis[context.dataIndex];

return [
`${api.method} ${api.endpoint}`,
`Status: ${api.status}`,
`Time: ${(api.time/1000).toFixed(2)} s`,
`Reason: ${api.reason}`
];
}
}
},

zoom: {
pan: { enabled: true, mode: 'x' },
zoom: { wheel: { enabled: true }, mode: 'x' }
}

},

scales: {
x: { ticks: { display: false } }
}

}

});
}


function resetZoom() {
if (chart) chart.resetZoom();
}


function renderErrors(apis) {

const errors = apis.filter(a => a.error_message);
document.getElementById("errorCount").innerText = errors.length;

let html = "";

errors.forEach(a => {

html += `
<div class="api-item">
<b>${a.method}</b> ${a.endpoint}<br>
Error: <b style="color:red">${a.error_message}</b>
</div>
`;
});

document.getElementById("errorList").innerHTML =
html || "No error messages found.";
}


function renderFailures(apis) {

const failed = apis.filter(a => a.status >= 400);
document.getElementById("failureCount").innerText = failed.length;

let html = "";

failed.forEach(a => {

html += `
<div class="api-item">
<b>${a.method}</b> ${a.endpoint}<br>
Status: ${a.status} |
Time: ${(a.time/1000).toFixed(2)} s<br>
Reason: <b style="color:red">${a.reason}</b>
</div>
`;
});

document.getElementById("failureList").innerHTML =
html || "No failures detected.";
}


function applyFilter() {

const apis = getFilteredApis();

drawChart(apis);
renderErrors(apis);
renderFailures(apis);
}


function downloadReport() {

const apis = getFilteredApis();

let csv =
"Method,Endpoint,Status,Time(s),Reason,Error Message,URL,Response\n";

apis.forEach(a => {

let response = a.response || "";
response = response.replace(/"/g, '""').replace(/\n/g, ' ');

csv += `"${a.method}","${a.endpoint}",${a.status},${(a.time/1000).toFixed(2)},"${a.reason}","${a.error_message}","${a.url}","${response}"\n`;

});

const blob = new Blob([csv], { type: "text/csv" });
const url = window.URL.createObjectURL(blob);

const link = document.createElement("a");
link.href = url;
link.download = "api_report.csv";
link.click();
}