// TDR Bot Dashboard - Client-side JS

const BASE = '.';
let currentData = null;
let postsData = null;
let accuracyData = null;
let activePark = 'TDL';
let accuracyChart = null;
let hourlyChart = null;
let engagementChart = null;

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchJSON(path) {
  try {
    const resp = await fetch(`${BASE}/data/${path}?t=${Date.now()}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

async function refreshData() {
  const [c, p, a] = await Promise.all([
    fetchJSON('current.json'),
    fetchJSON('posts.json'),
    fetchJSON('accuracy.json'),
  ]);
  if (c) { currentData = c; renderHeader(c); renderWaitTimes(c); renderHourlyChart(c); renderAgents(c); }
  if (p) { postsData = p; renderPosts(p); renderEngagementChart(p); }
  if (a) { accuracyData = a; renderAccuracy(a); }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function renderHeader(data) {
  const bot = data.bot || {};
  const weather = data.weather;

  // Status badge
  const badge = document.getElementById('status-badge');
  const lastCollected = bot.last_collected ? new Date(bot.last_collected) : null;
  const minutesAgo = lastCollected ? (Date.now() - lastCollected.getTime()) / 60000 : Infinity;

  if (minutesAgo < 15) {
    badge.textContent = 'Healthy';
    badge.className = 'badge healthy';
  } else if (minutesAgo < 60) {
    badge.textContent = 'Warning';
    badge.className = 'badge warning';
  } else if (lastCollected) {
    badge.textContent = 'Error';
    badge.className = 'badge error';
  } else {
    badge.textContent = 'No Data';
    badge.className = 'badge unknown';
  }

  // Updated at
  const updated = data.updated_at ? new Date(data.updated_at) : null;
  document.getElementById('last-updated').textContent = updated
    ? `Updated: ${formatTime(updated)}`
    : '';

  // Weather
  document.getElementById('weather-info').textContent = weather
    ? `${weather.weather} ${weather.temperature}°C`
    : '';

  // Stats
  document.getElementById('posts-today').textContent = bot.posts_today ?? '-';
  document.getElementById('last-posted').textContent = bot.last_posted
    ? formatTime(new Date(bot.last_posted))
    : '-';
  document.getElementById('last-collected').textContent = lastCollected
    ? formatTime(lastCollected)
    : '-';
}

// ---------------------------------------------------------------------------
// Wait Times
// ---------------------------------------------------------------------------

function renderWaitTimes(data) {
  const parks = data.parks || {};
  const parkData = parks[activePark] || [];
  const sims = data.simulations || {};
  const sim = sims[activePark];

  // Simulation info
  const simEl = document.getElementById('sim-info');
  if (sim) {
    simEl.innerHTML = `
      <div class="sim-item">
        <span class="sim-value">${sim.crowd_level}</span>
        <span class="sim-label">Crowd Level</span>
      </div>
      <div class="sim-item">
        <span class="sim-value">${sim.best_plan_rides}</span>
        <span class="sim-label">Best Rides</span>
      </div>
      <div class="sim-item">
        <span class="sim-value">${sim.best_plan_score}</span>
        <span class="sim-label">Plan Score</span>
      </div>
    `;
  } else {
    simEl.innerHTML = '';
  }

  // Wait times list
  const list = document.getElementById('wait-times-list');
  if (parkData.length === 0) {
    list.innerHTML = '<div class="no-data">No wait time data available</div>';
    return;
  }

  list.innerHTML = parkData.map(a => {
    if (!a.is_open) {
      return `<div class="wait-card">
        <span class="name">${a.name}</span>
        <span class="closed">Closed</span>
      </div>`;
    }
    const w = a.wait_time ?? 0;
    const cls = w <= 15 ? 'w-green' : w <= 30 ? 'w-yellow' : w <= 60 ? 'w-orange' : 'w-red';
    return `<div class="wait-card ${cls}">
      <span class="name">${a.name}</span>
      <span class="wait">${w} min</span>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Hourly Wait Time Chart
// ---------------------------------------------------------------------------

function renderHourlyChart(data) {
  const hourlyWaits = data.hourly_waits || {};
  const container = document.getElementById('hourly-chart-container');
  const ctx = document.getElementById('hourly-chart');
  if (!ctx) return;

  const parkData = hourlyWaits[activePark] || [];
  if (parkData.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const labels = parkData.map(d => d.hour + ':00');
  const values = parkData.map(d => d.avg);
  const counts = parkData.map(d => d.count);

  const gradient = ctx.getContext('2d');
  const grad = gradient.createLinearGradient(0, 0, 0, 220);
  grad.addColorStop(0, 'rgba(91,141,239,0.3)');
  grad.addColorStop(1, 'rgba(91,141,239,0.02)');

  if (hourlyChart) hourlyChart.destroy();
  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `${activePark} Avg Wait`,
        data: values,
        borderColor: '#5b8def',
        backgroundColor: grad,
        tension: 0.4,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#5b8def',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: '#8892a8', font: { size: 10 } },
          grid: { color: '#252d4520' },
        },
        y: {
          min: 0,
          ticks: { color: '#8892a8', callback: v => v + 'min' },
          grid: { color: '#252d4520' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `Avg: ${ctx.parsed.y}min (${counts[ctx.dataIndex]} records)`,
          },
        },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

function renderAgents(data) {
  const agents = data.agents || [];
  const list = document.getElementById('agents-list');

  if (agents.length === 0) {
    list.innerHTML = '<div class="no-data">No agent data available</div>';
    return;
  }

  list.innerHTML = agents.map(a => {
    const cls = `agent-${a.status}`;
    const statusLabel = {
      ok: 'OK', error: 'Error', unknown: 'Unknown', no_log: 'No Log'
    }[a.status] || a.status;

    let html = `<div class="agent-card ${cls}">
      <div class="agent-header">
        <span class="agent-name"><span class="agent-status-dot"></span>${escapeHtml(a.name)}</span>
        <span class="agent-badge">${statusLabel}</span>
      </div>
      <div class="agent-meta">
        <span>Schedule: ${escapeHtml(a.schedule)}</span>
        ${a.last_run ? `<span>Last: ${escapeHtml(a.last_run)}</span>` : ''}
      </div>`;

    if (a.message) {
      html += `<div class="agent-message">${escapeHtml(a.message)}</div>`;
    }

    html += '</div>';
    return html;
  }).join('');
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

function renderPosts(posts) {
  const list = document.getElementById('posts-list');
  if (!posts || posts.length === 0) {
    list.innerHTML = '<div class="no-data">No recent posts</div>';
    return;
  }

  // Show last 20
  list.innerHTML = posts.slice(0, 20).map(p => `
    <div class="post-card">
      <div class="post-header">
        <span class="post-type">${p.post_type}</span>
        <span class="post-date">${p.date}${p.posted_at ? ' ' + formatTime(new Date(p.posted_at)) : ''}</span>
      </div>
      <div class="post-content">${escapeHtml(p.content)}</div>
      <div class="post-metrics">
        Imp: <span>${(p.impressions || 0).toLocaleString()}</span>
        &nbsp;Eng: <span>${(p.engagements || 0).toLocaleString()}</span>
      </div>
    </div>
  `).join('');
}

// ---------------------------------------------------------------------------
// Engagement Chart
// ---------------------------------------------------------------------------

function renderEngagementChart(posts) {
  const container = document.getElementById('engagement-chart-container');
  const ctx = document.getElementById('engagement-chart');
  if (!ctx || !posts || posts.length === 0) {
    if (container) container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  // Group by date, sum impressions & engagements
  const byDate = {};
  for (const p of posts) {
    const d = byDate[p.date] || (byDate[p.date] = { imp: 0, eng: 0 });
    d.imp += p.impressions || 0;
    d.eng += p.engagements || 0;
  }

  const dates = Object.keys(byDate).sort();
  const impressions = dates.map(d => byDate[d].imp);
  const engagements = dates.map(d => byDate[d].eng);

  if (engagementChart) engagementChart.destroy();
  engagementChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates.map(d => d.slice(5)), // MM-DD
      datasets: [
        {
          label: 'Impressions',
          data: impressions,
          backgroundColor: 'rgba(91,141,239,0.6)',
          borderRadius: 4,
          yAxisID: 'y',
        },
        {
          label: 'Engagements',
          data: engagements,
          backgroundColor: 'rgba(167,139,250,0.6)',
          borderRadius: 4,
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: '#8892a8', font: { size: 10 }, maxRotation: 45 },
          grid: { display: false },
        },
        y: {
          position: 'left',
          ticks: { color: '#5b8def', font: { size: 10 } },
          grid: { color: '#252d4520' },
        },
        y1: {
          position: 'right',
          ticks: { color: '#a78bfa', font: { size: 10 } },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { labels: { color: '#e4e8f1', font: { size: 11 } } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Accuracy
// ---------------------------------------------------------------------------

function renderAccuracy(data) {
  if (!data) return;

  // Summary cards
  const summary = document.getElementById('accuracy-summary');
  let cardsHtml = '';
  for (const park of ['TDL', 'TDS']) {
    const p = data[park];
    if (!p) continue;
    const o = p.overall;
    const color = o.accuracy >= 70 ? 'var(--green)' : o.accuracy >= 50 ? 'var(--yellow)' : 'var(--red)';
    cardsHtml += `
      <div class="acc-card">
        <div class="acc-park">${park}</div>
        <div class="acc-value" style="color:${color}">${o.accuracy}%</div>
        <div class="acc-detail">${o.hits}/${o.total} hits (30d)</div>
      </div>
    `;
  }
  summary.innerHTML = cardsHtml;

  // Chart
  const ctx = document.getElementById('accuracy-chart');
  if (!ctx) return;

  const datasets = [];
  const colors = { TDL: '#5b8def', TDS: '#a78bfa' };

  for (const park of ['TDL', 'TDS']) {
    const p = data[park];
    if (!p || !p.daily.length) continue;
    datasets.push({
      label: park,
      data: p.daily.map(d => ({ x: d.date, y: d.accuracy })),
      borderColor: colors[park],
      backgroundColor: colors[park] + '20',
      tension: 0.3,
      fill: true,
      pointRadius: 2,
    });
  }

  if (accuracyChart) accuracyChart.destroy();
  accuracyChart = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'category',
          ticks: { color: '#8892a8', maxRotation: 45, font: { size: 10 } },
          grid: { color: '#252d4530' },
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#8892a8', callback: v => v + '%' },
          grid: { color: '#252d4530' },
        },
      },
      plugins: {
        legend: { labels: { color: '#e4e8f1', font: { size: 11 } } },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

document.querySelectorAll('.park-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.park-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activePark = tab.dataset.park;
    if (currentData) {
      renderWaitTimes(currentData);
      renderHourlyChart(currentData);
    }
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(d) {
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

refreshData();
setInterval(refreshData, 60000);
