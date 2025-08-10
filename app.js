// app.js - Finomic-inspired dashboard logic
// Talks to: /api/expenses, /api/expenses/:id, /api/download, /graph, /chat

const API = '/api/expenses';

// Elements
const currentBalanceEl = document.getElementById('current-balance');
const totalSpentEl = document.getElementById('total-spent');
const totalExpensesEl = document.getElementById('total-expenses');
const topCategoryEl = document.getElementById('top-category');
const topCatValueEl = document.getElementById('top-cat-value');
const avgSpendEl = document.getElementById('avg-spend');
const expensesTableBody = document.querySelector('#expenses-table tbody');
const quickFilter = document.getElementById('quick-filter');
const recentPreview = document.getElementById('recent-preview');

const addBtn = document.getElementById('add-expense-button');
const modal = document.getElementById('modal-expense');
const modalBg = document.getElementById('modal-bg');
const modalClose = document.getElementById('modal-close');
const cancelBtn = document.getElementById('cancel-button');
const expenseForm = document.getElementById('expense-form');
const saveBtn = document.getElementById('save-button');
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.getElementById('sidebar');

// Sparklines
let sparkTotal, sparkMonth;

// State
let expenses = [];
let editingId = null;

// THEME init (dark-first, persists)
const themeCheckbox = document.getElementById('theme-toggle');
(function initTheme() {
  const saved = localStorage.getItem('color-mode');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const mode = saved || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-color-mode', mode);
  if (themeCheckbox) themeCheckbox.checked = (mode === 'dark');
})();
if (themeCheckbox) {
  themeCheckbox.addEventListener('change', () => {
    const newMode = themeCheckbox.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-color-mode', newMode);
    localStorage.setItem('color-mode', newMode);
  });
}

// Sidebar toggle (mobile)
if (menuToggle) {
  menuToggle.addEventListener('click', () => {
    if (sidebar.style.display === 'none' || getComputedStyle(sidebar).display === 'none') {
      sidebar.style.display = 'flex';
    } else {
      sidebar.style.display = 'none';
    }
  });
}

// Open/close modal
addBtn.addEventListener('click', () => openModal());
modalClose.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
modalBg.addEventListener('click', closeModal);
function openModal(data) {
  editingId = data ? data.id : null;
  document.getElementById('modal-title').textContent = data ? 'Edit Expense' : 'Add Expense';
  document.getElementById('desc').value = data ? data.description : '';
  document.getElementById('amount').value = data ? Number(data.amount) : '';
  document.getElementById('category').value = data ? data.category : '';
  document.getElementById('date').value = data ? data.date : new Date().toISOString().slice(0,10);
  modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
}
function closeModal() {
  modal.classList.remove('open'); modal.setAttribute('aria-hidden','true');
  editingId = null; expenseForm.reset();
}

// Fetch expenses from server
async function loadExpenses() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error('Failed to fetch');
    expenses = await res.json();
    renderAll();
  } catch (err) {
    console.error('loadExpenses error:', err);
  }
}

// Render everything
function renderAll() {
  renderQuickFilter();
  renderKPIs();
  renderSparklines();
  renderTable();
  renderPreview();
}

// Quick filter dropdown
function renderQuickFilter() {
  const cats = Array.from(new Set(expenses.map(e => e.category).filter(Boolean))).sort();
  quickFilter.innerHTML = '<option value="">All categories</option>';
  cats.forEach(c => {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c; quickFilter.appendChild(opt);
  });
}

// Compute KPIs
function computeKPIs() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let totalThisMonth = 0;
  let balanceAll = 0;
  const categoryTotals = {};
  let largest = { amount: 0 };
  const dailySums = {}; // YYYY-MM-DD -> sum

  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    const d = new Date(e.date);
    balanceAll += amt;
    if (d.getMonth() === thisMonth && d.getFullYear() === thisYear) {
      totalThisMonth += amt;
      const key = e.date;
      dailySums[key] = (dailySums[key] || 0) + amt;
    }
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amt;
    if (amt > largest.amount) largest = { amount: amt, description: e.description };
  }

  // avg daily (days elapsed)
  const daysElapsed = new Date().getDate();
  const avgDaily = daysElapsed ? (totalThisMonth / daysElapsed) : 0;

  // top category
  let topCat = '—', topSum = 0;
  Object.entries(categoryTotals).forEach(([k,v]) => { if (v > topSum){ topSum=v; topCat=k; } });

  return {
    totalThisMonth, balanceAll, avgDaily, topCat, topSum, dailySums
  };
}

// Render KPI DOM
function renderKPIs() {
  const k = computeKPIs();
  currentBalanceEl.textContent = formatMoney(k.balanceAll);
  totalSpentEl.textContent = formatMoney(k.totalThisMonth);
  totalExpensesEl.textContent = String(expenses.length);
  topCategoryEl.textContent = k.topCat || '—';
  topCatValueEl.textContent = k.topSum ? formatMoney(k.topSum) : '';
  avgSpendEl.textContent = formatMoney(k.avgDaily);
  // month note
  const monthName = new Date().toLocaleString(undefined, { month: 'long' });
  const note = `${monthName} ${new Date().getFullYear()}`;
  document.getElementById('balance-note').textContent = note;
}

// Create/Update sparklines
function renderSparklines() {
  const k = computeKPIs();
  // Spark total: use last 12 days across all months (sum per day)
  const daysBack = 12;
  const labels = [];
  const totals = [];
  for (let i = daysBack-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0,10);
    labels.push(d.toLocaleDateString(undefined, { month:'short', day:'numeric' }));
    const v = (k.dailySums && k.dailySums[key]) ? k.dailySums[key] : 0;
    totals.push(Number(v.toFixed(2)));
  }

  // monthly spark: last 6 months totals
  const mmLabels = [];
  const mmTotals = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    mmLabels.push(d.toLocaleString(undefined, { month:'short' }));
    // compute total for that month
    let sum = 0;
    for (const e of expenses) {
      const dd = new Date(e.date);
      const kkey = `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}`;
      if (kkey === key) sum += Number(e.amount) || 0;
    }
    mmTotals.push(Number(sum.toFixed(2)));
  }

  // destroy previous charts if any
  if (sparkTotal) { try { sparkTotal.destroy(); } catch(_){} }
  if (sparkMonth) { try { sparkMonth.destroy(); } catch(_){} }

  const baseOptions = {
    type: 'line',
    options: {
      responsive: false, animation: { duration: 400 }, elements: { point:{ radius:0 } },
      scales: { x:{ display:false }, y:{ display:false } }, plugins: { legend:{ display:false } }
    }
  };

  const ctxTotal = document.getElementById('spark-total').getContext('2d');
  sparkTotal = new Chart(ctxTotal, {
    ...baseOptions,
    data: { labels, datasets: [{ data: totals, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.12)', tension:0.25, borderWidth:2 }] }
  });

  const ctxMonth = document.getElementById('spark-month').getContext('2d');
  sparkMonth = new Chart(ctxMonth, {
    ...baseOptions,
    data: { labels: mmLabels, datasets: [{ data: mmTotals, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.12)', tension:0.35, borderWidth:2 }] }
  });
}

// Render preview list and table
function renderPreview() {
  // recent 5
  const sorted = [...expenses].sort((a,b) => new Date(b.date)-new Date(a.date));
  const preview = sorted.slice(0,6);
  recentPreview.innerHTML = preview.map(r => txHtml(r)).join('');
}

function txHtml(r) {
  const badge = `<span class="badge ${badgeClass(r.category)}">${escapeHtml(r.category)}</span>`;
  const date = new Date(r.date).toLocaleDateString();
  return `<div class="tx">
    <div class="left">
      <div><strong>${escapeHtml(r.description)}</strong></div>
      <div class="muted">${date} • ${badge}</div>
    </div>
    <div class="right">
      <div><strong>${formatMoney(r.amount)}</strong></div>
    </div>
  </div>`;
}

function renderTable() {
  const filter = quickFilter.value;
  const sorted = [...expenses].sort((a,b) => new Date(b.date)-new Date(a.date));
  const rows = filter ? sorted.filter(r => r.category === filter) : sorted;
  const recent = rows.slice(0,10);
  expensesTableBody.innerHTML = '';
  if (!recent.length) {
    expensesTableBody.innerHTML = '<tr><td colspan="5" class="small center muted">No expenses yet</td></tr>';
    return;
  }
  for (const r of recent) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(r.date).toLocaleDateString()}</td>
      <td><span class="badge ${badgeClass(r.category)}">${escapeHtml(r.category)}</span></td>
      <td>${escapeHtml(r.description)}</td>
      <td class="amount-col">${formatMoney(r.amount)}</td>
      <td>
        <button class="btn-ghost edit-btn" data-id="${r.id}" title="Edit">✎</button>
        <button class="btn-ghost del-btn" data-id="${r.id}" title="Delete">🗑</button>
      </td>
    `;
    expensesTableBody.appendChild(tr);
  }
  // attach handlers
  expensesTableBody.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', onDelete));
  expensesTableBody.querySelectorAll('.edit-btn').forEach(b => b.addEventListener('click', onEdit));
  quickFilter.addEventListener('change', renderTable);
}

// Helpers
function formatMoney(v){ return '$' + (Number(v)||0).toFixed(2); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function badgeClass(cat){
  if (!cat) return 'other';
  const c = String(cat).toLowerCase();
  if (c.includes('food')) return 'food';
  if (c.includes('transport')) return 'transport';
  if (c.includes('util')) return 'utilities';
  if (c.includes('entertain')) return 'entertainment';
  if (c.includes('health')) return 'health';
  return 'other';
}

// Actions: delete, edit
async function onDelete(e){
  const id = e.currentTarget.dataset.id;
  if (!confirm('Delete this expense?')) return;
  try {
    const res = await fetch(`${API}/${id}`, { method:'DELETE' });
    if (!res.ok) throw new Error('Delete failed');
    expenses = expenses.filter(x => String(x.id) !== String(id));
    renderAll();
  } catch (err) { alert('Failed to delete: ' + err.message); }
}

function onEdit(e){
  const id = e.currentTarget.dataset.id;
  const rec = expenses.find(x => String(x.id) === String(id));
  if (!rec) return alert('Not found');
  openModal(rec);
}

// Submit form (add or edit)
expenseForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  saveBtn.disabled = true;
  const payload = {
    description: document.getElementById('desc').value.trim(),
    amount: parseFloat(document.getElementById('amount').value),
    category: document.getElementById('category').value,
    date: document.getElementById('date').value
  };
  if (!payload.description || !payload.amount || !payload.category || !payload.date) {
    alert('Please fill all fields'); saveBtn.disabled = false; return;
  }
  try {
    if (editingId) {
      const res = await fetch(`${API}/${editingId}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(()=>({error:'err'})); throw new Error(e.error||'Update failed'); }
      const updated = await res.json();
      expenses = expenses.map(x => x.id === updated.id ? updated : x);
    } else {
      const res = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
      if (!res.ok) { const e = await res.json().catch(()=>({error:'err'})); throw new Error(e.error||'Save failed'); }
      const created = await res.json();
      expenses.unshift(created);
    }
    renderAll(); closeModal();
  } catch (err) {
    alert(err.message||'Save failed');
  } finally { saveBtn.disabled = false; }
});

// initial load
loadExpenses();
