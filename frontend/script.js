'use strict';

let globalData = null;
let chart      = null;

const CHART_H = 320;
const PX_PER_PT = 6;   // pixels per data point (line chart can be tighter)
const MIN_W   = 900;

// ─── Upload ───────────────────────────────────────────────────────────────────

async function upload() {
  const file = document.getElementById('fileInput').files[0];
  if (!file) { alert('Please choose a HAR file first.'); return; }

  const fd = new FormData();
  fd.append('file', file);

  try {
    const res = await fetch('http://localhost:8000/upload', { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Server returned ' + res.status);
    globalData = await res.json();
  } catch (e) {
    alert('Upload failed: ' + e.message);
    return;
  }

  ['filterCard','summaryCard','graphCard','errorCard','failureCard']
    .forEach(id => document.getElementById(id).classList.remove('d-none'));

  buildFilters();
  renderSummary();
  applyFilter();
}

// ─── Dropdown filters ─────────────────────────────────────────────────────────

document.addEventListener('click', e => {
  if (!e.target.closest('.dd-wrap')) closeAllDD();
});

function closeAllDD() {
  document.querySelectorAll('.dd-wrap').forEach(d => d.classList.remove('open'));
}

function toggleDD(id) {
  const el = document.getElementById(id);
  const wasOpen = el.classList.contains('open');
  closeAllDD();
  if (!wasOpen) el.classList.add('open');
}

function buildMenu(menuId, badgeId, values) {
  const menu = document.getElementById(menuId);
  menu.innerHTML = '';

  const allRow = makeCheckRow(menuId + '_all', 'Select All', true, true);
  menu.appendChild(allRow);
  const allChk = allRow.querySelector('input');

  values.forEach(v => {
    const row = makeCheckRow(menuId + '_' + v, v, true, false);
    menu.appendChild(row);
    row.querySelector('input').addEventListener('change', () => {
      syncAll(menu, allChk);
      updateBadge(menu, badgeId, values.length);
      applyFilter();
    });
  });

  allChk.addEventListener('change', () => {
    menu.querySelectorAll('input[data-item]').forEach(c => c.checked = allChk.checked);
    updateBadge(menu, badgeId, values.length);
    applyFilter();
  });

  updateBadge(menu, badgeId, values.length);
}

function makeCheckRow(id, label, checked, isAll) {
  const div = document.createElement('label');
  div.className = 'dd-row' + (isAll ? ' dd-all' : '');
  div.htmlFor = id;
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.id = id;
  chk.checked = checked;
  if (!isAll) chk.dataset.item = label;
  const span = document.createElement('span');
  span.textContent = label;
  div.appendChild(chk);
  div.appendChild(span);
  return div;
}

function syncAll(menu, allChk) {
  const items = menu.querySelectorAll('input[data-item]');
  const checked = menu.querySelectorAll('input[data-item]:checked');
  allChk.checked = checked.length === items.length;
  allChk.indeterminate = checked.length > 0 && checked.length < items.length;
}

function updateBadge(menu, badgeId, total) {
  const n = menu.querySelectorAll('input[data-item]:checked').length;
  const b = document.getElementById(badgeId);
  b.textContent = (n === 0 || n === total) ? '' : n;
  b.style.display = b.textContent ? 'inline-flex' : 'none';
}

function getChecked(menuId) {
  return Array.from(document.querySelectorAll('#' + menuId + ' input[data-item]:checked'))
    .map(c => c.dataset.item);
}

function buildFilters() {
  const methods  = [...new Set(globalData.apis.map(a => a.method))].sort();
  const services = [...new Set(globalData.apis.map(a => {
    const p = a.endpoint.split('/')[1];
    return p ? '/' + p : null;
  }).filter(Boolean))].sort();
  const statuses = [...new Set(globalData.apis.map(a => String(a.status)))].sort();

  buildMenu('menu-method',  'badge-method',  methods);
  buildMenu('menu-service', 'badge-service', services);
  buildMenu('menu-status',  'badge-status',  statuses);
}

function clearFilters() {
  ['menu-method','menu-service','menu-status'].forEach(menuId => {
    const menu = document.getElementById(menuId);
    menu.querySelectorAll('input').forEach(c => { c.checked = true; c.indeterminate = false; });
    const badgeId = menuId.replace('menu-','badge-');
    const total = menu.querySelectorAll('input[data-item]').length;
    updateBadge(menu, badgeId, total);
  });
  applyFilter();
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function renderSummary() {
  const s = globalData.summary;
  document.getElementById('summary').innerHTML = `
    <div class="row text-center">
      <div class="col">Total APIs<br><b>${s.total}</b></div>
      <div class="col">Average<br><b>${(s.avg/1000).toFixed(2)} s</b></div>
      <div class="col">Slowest<br><b>${(s.max/1000).toFixed(2)} s</b></div>
      <div class="col">Errors<br><b>${s.failed}</b></div>
    </div>`;
}

// ─── Filtering ────────────────────────────────────────────────────────────────

function getFilteredApis() {
  if (!globalData) return [];
  const methods  = getChecked('menu-method');
  const services = getChecked('menu-service');
  const statuses = getChecked('menu-status');
  return globalData.apis.filter(a => {
    const svc = '/' + (a.endpoint.split('/')[1] || '');
    return methods.includes(a.method)
        && services.includes(svc)
        && statuses.includes(String(a.status));
  });
}

function applyFilter() {
  const apis = getFilteredApis();
  drawChart(apis);
  renderErrors(apis);
  renderFailures(apis);
}

// ─── Chart — TradingEconomics style line chart ────────────────────────────────

function segmentColor(ctx) {
  // Color each segment by the value at its start point
  const v = ctx.p0.parsed.y * 1000; // back to ms
  if (v < 1000) return '#22c55e';
  if (v < 2000) return '#f97316';
  return '#ef4444';
}

function drawChart(apis) {
  if (chart) { chart.destroy(); chart = null; }

  const n = apis.length;
  const chartWidth = Math.max(n * PX_PER_PT, MIN_W);

  // Fresh canvas
  const wrapper = document.getElementById('chartWrapper');
  wrapper.style.width  = chartWidth + 'px';
  wrapper.style.height = CHART_H + 'px';

  const old = document.getElementById('apiChart');
  old.remove();
  const canvas = document.createElement('canvas');
  canvas.id = 'apiChart';
  canvas.width  = chartWidth;
  canvas.height = CHART_H;
  wrapper.appendChild(canvas);

  const times = apis.map(a => +(a.time / 1000).toFixed(3));

  // Gradient fill under line
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, CHART_H);
  grad.addColorStop(0,   'rgba(59,130,246,0.18)');
  grad.addColorStop(1,   'rgba(59,130,246,0)');

  chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: apis.map((_, i) => i + 1),
      datasets: [{
        data: times,
        // Coloured segments
        segment: {
          borderColor: segmentColor,
        },
        pointRadius: 0,           // no dots — clean line like trading chart
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#2563eb',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        borderWidth: 1.8,
        tension: 0.3,             // slight curve — smoother look
        fill: true,
        backgroundColor: grad,
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        mode: 'index',
        intersect: false,         // tooltip follows cursor anywhere on chart
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15,23,42,0.92)',
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            title: ctx => `API #${ctx[0].dataIndex + 1}`,
            label: ctx => {
              const a = apis[ctx.dataIndex];
              return [
                `  ${a.method} ${a.endpoint}`,
                `  Status : ${a.status}`,
                `  Time   : ${(a.time/1000).toFixed(2)} s`,
                `  Reason : ${a.reason}`
              ];
            }
          },
          external: (context) => {
            // Update hover info bar above chart
            if (context.tooltip.dataPoints && context.tooltip.dataPoints.length) {
              const i = context.tooltip.dataPoints[0].dataIndex;
              const a = apis[i];
              document.getElementById('hoverInfo').innerHTML =
                `<b>#${i+1}</b> &nbsp; ${a.method} ${a.endpoint} &nbsp;|&nbsp; ${(a.time/1000).toFixed(2)} s &nbsp;|&nbsp; ${a.status}`;
            }
          }
        },
        zoom: {
          pan:  { enabled: true, mode: 'x' },
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' }
        }
      },
      scales: {
        x: {
          ticks: { display: false },
          grid:  { color: 'rgba(0,0,0,0.04)', drawBorder: false },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          position: 'right',      // y-axis on right like trading charts
          title: { display: false },
          ticks: {
            color: '#64748b',
            font: { size: 11 },
            callback: v => v + ' s'
          },
          grid: { color: 'rgba(0,0,0,0.06)', drawBorder: false },
          border: { display: false }
        }
      }
    }
  });
}

function resetZoom() {
  if (chart) chart.resetZoom();
}

// ─── Error / Failure lists ────────────────────────────────────────────────────

function renderErrors(apis) {
  const errs = apis.filter(a => a.error_message);
  document.getElementById('errorCount').textContent = errs.length;
  document.getElementById('errorList').innerHTML = errs.length
    ? errs.map(a => `
        <div class="list-item">
          <b>${a.method}</b> ${a.endpoint}<br>
          Error: <b class="text-danger">${a.error_message}</b>
        </div>`).join('')
    : '<div class="list-item text-muted">No error messages found.</div>';
}

function renderFailures(apis) {
  const fail = apis.filter(a => a.status >= 400);
  document.getElementById('failureCount').textContent = fail.length;
  document.getElementById('failureList').innerHTML = fail.length
    ? fail.map(a => `
        <div class="list-item">
          <b>${a.method}</b> ${a.endpoint}<br>
          Status: ${a.status} &nbsp;|&nbsp; Time: ${(a.time/1000).toFixed(2)} s<br>
          Reason: <b class="text-danger">${a.reason}</b>
        </div>`).join('')
    : '<div class="list-item text-muted">No failures detected.</div>';
}

// ─── CSV download ─────────────────────────────────────────────────────────────

function downloadReport() {
  if (!globalData) { alert('Analyze a file first.'); return; }
  const apis = getFilteredApis();
  let csv = 'Method,Endpoint,Status,Time(s),Reason,Error Message,URL,Response\n';
  apis.forEach(a => {
    const r = (a.response || '').replace(/"/g, '""').replace(/\n/g, ' ');
    csv += `"${a.method}","${a.endpoint}",${a.status},${(a.time/1000).toFixed(2)},"${a.reason}","${a.error_message}","${a.url}","${r}"\n`;
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  link.download = 'api_report.csv';
  link.click();
}