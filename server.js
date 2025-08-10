

const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'expenses.db');
const app = express();


if (!fs.existsSync(DB_FILE)) fs.closeSync(fs.openSync(DB_FILE, 'w'));

app.use(express.json()); 


app.use(express.static(path.join(__dirname, 'public')));


const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) return console.error('DB open error', err.message);
});
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL
  )`);
  
  db.get('SELECT COUNT(*) as c FROM expenses', (err, row) => {
    if (err) return console.error(err);
    if (row && row.c === 0) {
      const stmt = db.prepare('INSERT INTO expenses(description,amount,category,date) VALUES (?,?,?,?)');
      const samples = [
        ['Groceries', 24.50, 'Food', '2025-07-10'],
        ['Bus ticket', 2.75, 'Transport', '2025-07-11'],
        ['Electricity bill', 60.00, 'Utilities', '2025-07-05'],
        ['Cinema', 12.00, 'Entertainment', '2025-08-01'],
        ['Lunch', 10.25, 'Food', '2025-08-03']
      ];
      samples.forEach(s => stmt.run(s[0], s[1], s[2], s[3]));
      stmt.finalize();
      console.log('Inserted sample data.');
    }
  });
});


function validateExpense(payload) {
  if (!payload) return 'Missing payload';
  const { description, amount, category, date } = payload;
  if (!description || String(description).trim() === '') return 'Description required';
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) <= 0) return 'Amount must be a positive number';
  if (!category || String(category).trim() === '') return 'Category required';
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Date required (YYYY-MM-DD)';
  return null;
}


app.get('/api/expenses', (req, res) => {
  let sql = 'SELECT * FROM expenses';
  const filters = [];
  const params = [];
  if (req.query.category) {
    filters.push('category = ?'); params.push(req.query.category);
  }
  if (req.query.start) {
    filters.push('date >= ?'); params.push(req.query.start);
  }
  if (req.query.end) {
    filters.push('date <= ?'); params.push(req.query.end);
  }
  if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
  sql += ' ORDER BY date DESC, id DESC';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});


app.post('/api/expenses', (req, res) => {
  const errMsg = validateExpense(req.body);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { description, amount, category, date } = req.body;
  const stmt = db.prepare('INSERT INTO expenses(description,amount,category,date) VALUES (?,?,?,?)');
  stmt.run(description.trim(), Number(amount), category.trim(), date, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    const id = this.lastID;
    db.get('SELECT * FROM expenses WHERE id = ?', [id], (err2, row) => {
      if (err2) return res.status(500).json({ error: err2.message });
      res.json(row);
    });
  });
  stmt.finalize();
});


app.put('/api/expenses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  const errMsg = validateExpense(req.body);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const { description, amount, category, date } = req.body;
  db.run(
    'UPDATE expenses SET description = ?, amount = ?, category = ?, date = ? WHERE id = ?',
    [description.trim(), Number(amount), category.trim(), date, id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
      db.get('SELECT * FROM expenses WHERE id = ?', [id], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(row);
      });
    }
  );
});


app.delete('/api/expenses/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  db.run('DELETE FROM expenses WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ success: true });
  });
});


app.get('/api/download', (req, res) => {
  db.all('SELECT * FROM expenses ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    
    const fields = ['id', 'description', 'amount', 'category', 'date'];
    const escapeCsv = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = fields.join(',') + '\n';
    const body = rows.map(r => fields.map(f => escapeCsv(r[f])).join(',')).join('\n');
    const csv = header + body;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    res.send(csv);
  });
});


app.post('/api/chat', express.json(), (req, res) => {
  const msg = (req.body.message || '').toLowerCase().trim();
  if (!msg) return res.json({ reply: "Send me a question like 'total' or 'category breakdown'." });

  if (msg.includes('total')) {
    db.get('SELECT COALESCE(SUM(amount),0) as total FROM expenses', [], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const total = Number(row.total || 0);
      return res.json({ reply: `Your total spending is $${total.toFixed(2)}` });
    });
  } else if (msg.includes('category')) {
    db.all('SELECT category, COALESCE(SUM(amount),0) as total FROM expenses GROUP BY category', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const parts = rows.map(r => `${r.category}: $${Number(r.total).toFixed(2)}`);
      return res.json({ reply: `Category breakdown — ${parts.join(' • ')}` });
    });
  } else if (msg.includes('top')) {
  
    const nMatch = msg.match(/top\s+(\d+)/);
    let n = 5;
    if (nMatch) n = Math.min(50, Number(nMatch[1]));
    db.all('SELECT * FROM expenses ORDER BY amount DESC LIMIT ?', [n], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      const parts = rows.map(r => `${r.description} ($${Number(r.amount).toFixed(2)})`).slice(0, n);
      return res.json({ reply: `Top ${n} expenses: ${parts.join(' • ')}` });
    });
  } else {
    return res.json({ reply: "I can answer: 'total', 'category', or 'top N' (e.g. 'top 3')." });
  }
});


app.get('/graph', (req, res) => {
  const p = path.join(__dirname, 'public', 'graph.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('graph.html not found in /public');
});
app.get('/chat', (req, res) => {
  const p = path.join(__dirname, 'public', 'chat.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  return res.status(404).send('chat.html not found in /public');
});


app.post('/api/chatbot', express.json(), async (req, res) => {
  const msg = (req.body && req.body.message) ? String(req.body.message).trim() : '';
  if (!msg) return res.status(400).json({ error: 'Empty message' });

  
  const dbAll = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))
  );
  const dbGet = (sql, params = []) => new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))
  );

  const text = msg.toLowerCase();

  
  const fmt = (v) => {
    const n = Number(v) || 0;
    return '$' + n.toFixed(2);
  };


  async function totalInMonth(ym) {
    const row = await dbGet('SELECT SUM(amount) as s FROM expenses WHERE substr(date,1,7) = ?', [ym]);
    return row && row.s ? Number(row.s) : 0;
  }

  
  async function totalBetween(start, end) {
    const row = await dbGet('SELECT SUM(amount) as s FROM expenses WHERE date >= ? AND date <= ?', [start, end]);
    return row && row.s ? Number(row.s) : 0;
  }

  
  async function totalsByCategory() {
    const rows = await dbAll('SELECT category, SUM(amount) as s FROM expenses GROUP BY category ORDER BY s DESC');
    return rows;
  }

  
  try {
    
    if (/\b(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(text)) {
      const replies = [
        'Hello — how can I help you with your finances today?',
        'Hi — I can summarize your expenses, suggest budgets, or answer finance questions.'
      ];
      return res.json({ reply: replies[Math.floor(Math.random()*replies.length)] });
    }

    
    if (/\b(total|how much).*this month|spent this month|month.*spent\b/.test(text)) {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const total = await totalInMonth(ym);
      return res.json({ reply: `You spent ${fmt(total)} in ${now.toLocaleString(undefined,{month:'long', year:'numeric'})}.` });
    }

    
    {
      const m = text.match(/(?:spent|how much).*on\s+([a-zA-Z ]{2,30})\s*(?:this month|in\s+\w+)?/);
      if (m) {
        const cat = m[1].trim();
        const now = new Date();
        const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const row = await dbGet('SELECT SUM(amount) as s FROM expenses WHERE category = ? AND substr(date,1,7)=?', [cat, ym]);
        const s = row && row.s ? Number(row.s) : 0;
        return res.json({ reply: `You spent ${fmt(s)} on ${cat} in ${now.toLocaleString(undefined,{month:'long', year:'numeric'})}.` });
      }
    }

    
    if (/\b(top category|biggest category|largest category)\b/.test(text)) {
      const rows = await totalsByCategory();
      if (!rows.length) return res.json({ reply: 'I don’t see any expenses yet.' });
      const top = rows[0];
      return res.json({ reply: `Your top category is ${top.category} with ${fmt(top.s)} total spending.` });
    }

    
    if (/\b(breakdown|by category|category breakdown)\b/.test(text)) {
      const rows = await totalsByCategory();
      if (!rows.length) return res.json({ reply: 'No expenses found to create a breakdown.' });
      const parts = rows.map(r => `${r.category}: ${fmt(r.s)}`);
      return res.json({ reply: `Category breakdown — ${parts.join(' · ')}` });
    }

    
    if (/\b(avg|average).*daily.*month|average daily\b/.test(text)) {
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const total = await totalInMonth(ym);
      const days = now.getDate();
      const avg = total / (days || 1);
      return res.json({ reply: `Your average daily spend so far this month is ${fmt(avg)}.` });
    }

    
    {
      const m = text.match(/last\s+(\d{1,2})\s+days?/);
      if (m) {
        const days = Number(m[1]);
        const today = new Date();
        const past = new Date(); past.setDate(today.getDate() - (days-1));
        const start = past.toISOString().slice(0,10);
        const end = today.toISOString().slice(0,10);
        const tot = await totalBetween(start, end);
        return res.json({ reply: `In the last ${days} days (${start} → ${end}) you spent ${fmt(tot)}.` });
      }
    }

    
    if (/\b(suggest|help|budget).*budget\b/.test(text) || /\b(i want to budget|help me budget)\b/.test(text)) {
      
      const m = text.match(/(\d[\d,\.]*)/);
      let income = null;
      if (m) {
        income = Number(m[1].replace(/,/g, ''));
      }
      
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const total = await totalInMonth(ym);
      
      const suggestion = [
        `A simple starting plan is the 50/30/20 rule: 50% needs, 30% wants, 20% savings/debt.`,
        `This month you've spent ${fmt(total)} so far.`
      ];
      if (income) {
        const needs = income * 0.5, wants = income * 0.3, save = income * 0.2;
        suggestion.push(`If your monthly income is ${fmt(income)}, try: Needs ${fmt(needs)}, Wants ${fmt(wants)}, Save ${fmt(save)}.`);
      } else {
        suggestion.push('If you tell me your monthly income I can make a budget recommendation with real numbers.');
      }
      return res.json({ reply: suggestion.join(' ') });
    }

    
    if (/\binflation\b/.test(text)) {
      return res.json({ reply: 'Inflation means the general rise in prices over time, reducing purchasing power. A small, steady inflation is normal; high inflation erodes savings and income.' });
    }
    if (/\bsavings\b/.test(text) && /\bhow\b|\bwhere\b|\bbest\b/.test(text)) {
      return res.json({ reply: 'For savings: start with an emergency fund (3–6 months expenses), use high-yield savings for short-term goals, and diversified investments for long-term growth.' });
    }

    
    if (/\b(tip|advice|suggest)\b/.test(text)) {
      
      const rows = await totalsByCategory();
      if (rows.length) {
        const top = rows[0].category;
        return res.json({ reply: `A quick tip: review your top category (${top}). If it’s recurring spending, consider setting a monthly cap and automating alerts when you approach it.` });
      } else {
        return res.json({ reply: 'Tip: log every expense for at least two weeks — tracking helps reveal where to cut back.' });
      }
    }

    
    if (/\b(add|log).*expense\b/.test(text) || /\bhow to add expense\b/.test(text)) {
      return res.json({ reply: 'To add an expense use the Add Expense button on the dashboard. Provide description, amount, category, and date. I can also add it for you if you paste the details here like: add expense, Lunch, 12.50, Food, 2025-08-09' });
    }

    
    {
      const addMatch = text.match(/add expense[,:\s]+(.+?),\s*([\d\.]+),\s*([a-zA-Z ]+),\s*(\d{4}-\d{2}-\d{2})/i);
      if (addMatch) {
        const description = addMatch[1].trim();
        const amount = Number(addMatch[2]);
        const category = addMatch[3].trim();
        const date = addMatch[4];
        
        await new Promise((resolve, reject) => {
          const stmt = db.prepare('INSERT INTO expenses(description, amount, category, date) VALUES (?,?,?,?)');
          stmt.run(description, amount, category, date, function (err) {
            stmt.finalize();
            if (err) return reject(err);
            resolve(this.lastID);
          });
        });
        return res.json({ reply: `Added expense ${description} ${fmt(amount)} in ${category} on ${date}.` });
      }
    }

    
    const smallTalk = [
      "I can help with expense summaries, budgeting tips, and basic finance explanations. Ask me things like 'How much did I spend this month?' or 'Suggest a budget.'",
      "I’m here to help with your finances. Would you like a summary of your recent spending or some budgeting tips?"
    ];
    return res.json({ reply: smallTalk[Math.floor(Math.random()*smallTalk.length)] });

  } catch (err) {
    console.error('Chatbot error:', err);
    return res.status(500).json({ error: 'Chatbot failed to process request' });
  }
});



app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`BudgetBuddy listening at http://localhost:${PORT}`));
