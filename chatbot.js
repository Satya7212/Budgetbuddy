// chatbot.js - frontend for rule-based assistant

const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// helper to append message
function appendMessage(text, who='bot', meta='') {
  const el = document.createElement('div');
  el.className = `msg ${who}`;
  el.innerHTML = `<div class="body">${escapeHtml(text)}</div>${meta ? `<div class="meta">${escapeHtml(meta)}</div>` : ''}`;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }

// show typing indicator
function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg bot';
  el.innerHTML = `<div class="typing"></div>`;
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

async function sendMessage(message) {
  // show user message
  appendMessage(message, 'user');
  chatInput.value = '';

  // show typing
  const typingEl = showTyping();

  try {
    const res = await fetch('/api/chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const data = await res.json();
    typingEl.remove();
    if (res.ok && data && data.reply) {
      appendMessage(data.reply, 'bot');
    } else {
      appendMessage('Sorry, I could not process that request right now.', 'bot');
    }
  } catch (err) {
    console.error(err);
    typingEl.remove();
    appendMessage('Network error — could not reach the assistant.', 'bot');
  }
}

// load a welcome message (only once)
(function init() {
  appendMessage('Hello — I am your finance assistant. Ask me about your expenses, budgets, or basic finance concepts.', 'bot');
})();

// handle form submit
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const txt = chatInput.value.trim();
  if (!txt) return;
  sendMessage(txt);
});
