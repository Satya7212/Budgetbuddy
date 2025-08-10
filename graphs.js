/**
 * graphs.js
 * Fetches /api/expenses and renders 3 animated charts with Chart.js
 * - categoryChart (pie)
 * - monthlyChart (bar)
 * - dailyChart (line)
 *
 * Also supports download buttons and updates on theme change.
 */

(async () => {
  // DOM
  const categoryCtx = document.getElementById('categoryChart').getContext('2d');
  const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');
  const dailyCtx = document.getElementById('dailyChart').getContext('2d');

  const downloadCat = document.getElementById('download-cat');
  const downloadMonthly = document.getElementById('download-monthly');
  const downloadDaily = document.getElementById('download-daily');

  const monthsRangeSelect = document.getElementById('months-range');
  const refreshCat = document.getElementById('refresh-btn-cat');
  const refreshDaily = document.getElementById('refresh-btn-daily');

  // Chart instances (will be set below)
  let categoryChart = null;
  let monthlyChart = null;
  let dailyChart = null;

  // Color palettes for light/dark
  const paletteLight = {
    primary: '#2563eb',
    accent: '#7c3aed',
    text: '#0f172a',
    muted: '#6b7280',
    chartColors: [
      '#2563eb', '#06b6d4', '#f97316', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b'
    ]
  };
  const paletteDark = {
    primary: '#60a5fa',
    accent: '#7c3aed',
    text: '#e6eef8',
    muted: '#9aa4b2',
    chartColors: [
      '#60a5fa', '#06b6d4', '#f97316', '#34d399', '#fb7185', '#a78bfa', '#fbbf24'
    ]
  };

  // read current theme mode
  function isDark() {
    return document.documentElement.getAttribute('data-color-mode') === 'dark';
  }
  function pal() { return isDark() ? paletteDark : paletteLight; }

  // utility: fetch expenses
  async function fetchExpenses() {
    const res = await fetch('/api/expenses');
    if (!res.ok) throw new Error('Failed to load expenses');
    return res.json();
  }

  // Process dataset helpers
  function categoryTotals(expenses) {
    const sums = {};
    for (const e of expenses) {
      const cat = e.category || 'Other';
      sums[cat] = (sums[cat] || 0) + Number(e.amount || 0);
    }
    // sort descending
    const entries = Object.entries(sums).sort((a,b) => b[1] - a[1]);
    return entries;
  }

  function monthlyTotals(expenses, monthsBack = 12) {
    const now = new Date();
    const map = {};
    // create keys for last monthsBack months
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      map[key] = 0;
    }
    for (const e of expenses) {
      const d = new Date(e.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (key in map) map[key] += Number(e.amount || 0);
    }
    const labels = Object.keys(map);
    const values = labels.map(k => map[k]);
    const pretty = labels.map(l => {
      const [y,m] = l.split('-'); const date = new Date(y, Number(m)-1, 1);
      return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
    });
    return { labels: pretty, values };
  }

  function dailyTotals(expenses, days = 30) {
    const now = new Date();
    const map = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0,10);
      map[key] = 0;
    }
    for (const e of expenses) {
      const k = (new Date(e.date)).toISOString().slice(0,10);
      if (k in map) map[k] += Number(e.amount || 0);
    }
    const labels = Object.keys(map).map(k => {
      const d = new Date(k); return d.toLocaleString(undefined, { month: 'short', day: 'numeric' });
    });
    const values = Object.values(map);
    return { labels, values };
  }

  // Chart creation functions
  function createCategoryChart(labels, data) {
    const colors = pal().chartColors;
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(categoryCtx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: labels.map((_,i) => colors[i % colors.length]),
          hoverOffset: 8,
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 700, easing: 'cubicBezier(.25,.8,.25,1)' },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true, callbacks: {
            label: ctx => `${ctx.label}: $${Number(ctx.parsed).toFixed(2)}`
          }}
        }
      }
    });

    // legend DOM
    const legendWrap = document.getElementById('category-legend');
    legendWrap.innerHTML = '';
    labels.forEach((lab, i) => {
      const swatch = document.createElement('div');
      swatch.style.display = 'inline-flex';
      swatch.style.alignItems = 'center';
      swatch.style.gap = '8px';
      swatch.style.fontSize = '0.9rem';
      swatch.innerHTML = `<span style="width:12px;height:12px;border-radius:3px;background:${colors[i % colors.length]};display:inline-block"></span>${lab}`;
      legendWrap.appendChild(swatch);
    });
  }

  function createMonthlyChart(labels, data) {
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(monthlyCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Spending',
          data,
          backgroundColor: pal().accent ? pal().chartColors[0] : '#60a5fa',
          borderRadius: 6,
          barPercentage: 0.65
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 700, easing: 'cubicBezier(.25,.8,.25,1)' },
        scales: {
          x: { grid: { display:false }, ticks:{ color: pal().text } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks:{ color: pal().text } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `$${Number(ctx.parsed.y).toFixed(2)}` } }
        }
      }
    });
  }

  function createDailyChart(labels, data) {
    if (dailyChart) dailyChart.destroy();
    dailyChart = new Chart(dailyCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Daily',
          data,
          borderColor: pal().chartColors[1],
          backgroundColor: pal().chartColors[1] ? pal().chartColors[1] : 'rgba(96,165,250,0.12)',
          fill: 'start',
          tension: 0.28,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 700, easing: 'cubicBezier(.25,.8,.25,1)' },
        scales: {
          x: { grid: { display:false }, ticks:{ color: pal().text } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks:{ color: pal().text } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => `$${Number(ctx.parsed.y).toFixed(2)}` } }
        }
      }
    });
  }

  // Render pipeline
  async function renderAll() {
    try {
      const expenses = await fetchExpenses();

      // category
      const catEntries = categoryTotals(expenses);
      const catLabels = catEntries.map(e => e[0]);
      const catVals = catEntries.map(e => Number(e[1].toFixed(2)));
      createCategoryChart(catLabels, catVals);

      // monthly
      const monthsBack = Number(monthsRangeSelect.value || 12);
      const monthly = monthlyTotals(expenses, monthsBack);
      createMonthlyChart(monthly.labels, monthly.values);

      // daily (last 30)
      const daily = dailyTotals(expenses, 30);
      createDailyChart(daily.labels, daily.values);
    } catch (err) {
      console.error('Render failed', err);
    }
  }

  // download helper
  function downloadChartImage(chartInstance, filename = 'chart.png') {
    try {
      const dataUrl = chartInstance.toBase64Image('image/png', 1);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.click();
    } catch (err) {
      console.error('Download failed', err);
    }
  }

  // event wiring
  downloadCat.addEventListener('click', () => { if (categoryChart) downloadChartImage(categoryChart, 'category.png'); });
  downloadMonthly.addEventListener('click', () => { if (monthlyChart) downloadChartImage(monthlyChart, 'monthly.png'); });
  downloadDaily.addEventListener('click', () => { if (dailyChart) downloadChartImage(dailyChart, 'daily.png'); });

  monthsRangeSelect.addEventListener('change', renderAll);
  refreshCat.addEventListener('click', renderAll);
  refreshDaily.addEventListener('click', renderAll);

  // theme handling: re-render on theme change
  const obs = new MutationObserver((mut) => {
    for (const m of mut) {
      if (m.attributeName === 'data-color-mode') {
        // short delay to let CSS apply
        setTimeout(() => renderAll(), 80);
      }
    }
  });
  obs.observe(document.documentElement, { attributes: true });

  // storage event (in case toggle changed in another tab)
  window.addEventListener('storage', (e) => {
    if (e.key === 'color-mode') setTimeout(renderAll, 80);
  });

  // initial render
  renderAll();

})();
