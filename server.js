// ============================================================
// AURELIA DENTAL — Backend Server
// Express API that powers the reservation form and the
// Dr. AI concierge chat widget on the frontend.
// ============================================================

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'aurelia-admin';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

// ---- storage bootstrap -------------------------------------------------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]', 'utf-8');

function readBookings() {
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf-8'));
  } catch (err) {
    console.error('Failed to read bookings store:', err);
    return [];
  }
}

function writeBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), 'utf-8');
}

// ---- middleware ----------------------------------------------------------
// CORS_ORIGIN can be a comma-separated list, e.g.
// "https://aurelia-dental.pages.dev,https://www.your-domain.com"
// Leave unset to allow any origin (fine for local dev / quick testing).
const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins } : {}));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// simple request logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ---- validation helpers ---------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-()\s]{7,20}$/;

function validateBooking(body) {
  const errors = [];
  const name = (body.name || '').toString().trim();
  const phone = (body.phone || '').toString().trim();
  const email = (body.email || '').toString().trim();
  const date = (body.date || '').toString().trim();
  const treatment = (body.treatment || '').toString().trim();
  const notes = (body.notes || '').toString().trim();

  if (!name || name.length < 2) errors.push('Please enter your full name.');
  if (!phone || !PHONE_RE.test(phone)) errors.push('Please enter a valid phone number.');
  if (email && !EMAIL_RE.test(email)) errors.push('Please enter a valid email address.');
  if (!date) errors.push('Please choose a preferred date.');
  if (!treatment) errors.push('Please choose a treatment of interest.');

  return { errors, clean: { name, phone, email, date, treatment, notes } };
}

// ---- routes: bookings ------------------------------------------------------
app.post('/api/bookings', (req, res) => {
  const { errors, clean } = validateBooking(req.body || {});
  if (errors.length) {
    return res.status(400).json({ success: false, errors });
  }

  const booking = {
    id: crypto.randomUUID(),
    ...clean,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  const bookings = readBookings();
  bookings.unshift(booking);
  writeBookings(bookings);

  res.status(201).json({
    success: true,
    message: 'Reservation received. Our concierge team will confirm shortly.',
    booking,
  });
});

app.get('/api/bookings', (req, res) => {
  if (req.header('x-admin-key') !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.json({ success: true, bookings: readBookings() });
});

app.patch('/api/bookings/:id', (req, res) => {
  if (req.header('x-admin-key') !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  const bookings = readBookings();
  const idx = bookings.findIndex((b) => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Not found' });

  const allowedStatus = ['pending', 'confirmed', 'cancelled'];
  if (req.body.status && allowedStatus.includes(req.body.status)) {
    bookings[idx].status = req.body.status;
  }
  writeBookings(bookings);
  res.json({ success: true, booking: bookings[idx] });
});

// ---- routes: Dr. AI chat ----------------------------------------------------
const KNOWLEDGE = {
  whitening:
    "Our Laser Teeth Whitening treatment brightens your smile by up to 8 shades in a single 45-minute VIP session ($299). Results are enamel-safe with zero sensitivity. Would you like to check available slots this week?",
  implant:
    "We use CBCT 3D Guided Implant Technology for painless single or full-arch tooth restorations, led by Dr. Alexander Vance. Implants start at $1,850. Shall I reserve a 3D scan consultation for you?",
  veneers:
    "Our handcrafted porcelain laminate veneers are custom-designed with digital smile design software, starting at $950/tooth. Dr. Sarah Chen leads our veneer practice. Would you like to see before/after examples?",
  invisalign:
    "Invisalign Diamond Care uses AI tooth-movement prediction for faster, virtually invisible alignment, starting at $3,200. Dr. Elena Rostova can assess your candidacy — want me to book a consult?",
  endodontics:
    "Our Microscopic Endodontics treatments use high-magnification, painless techniques to preserve your natural tooth structure. Would you like more detail on the procedure or recovery time?",
  pricing:
    "Our signature treatment fees begin at: Laser Whitening ($299), Porcelain Veneers ($950/tooth), 3D Implants ($1,850), and Invisalign ($3,200). We also offer 0% APR bespoke financing plans.",
  booking:
    "I can help you book right now — please share your preferred date, treatment of interest, and a contact number, or fill out the reservation form on this page and I'll confirm it instantly.",
  symptom:
    "I'm sorry you're experiencing discomfort. Is it sharp sensitivity to hot or cold, a dull throbbing pain, or pain when biting? A clinical exam is always recommended for an exact diagnosis, but I can help route you to the right specialist.",
  hours:
    "Our concierge line and Dr. AI are available 24/7. In-clinic appointments run 8am–8pm daily, with VIP after-hours slots available on request.",
  location:
    "We'd love to welcome you in person — let me know your city and I can point you to your nearest Aurelia Dental studio, or I can arrange a virtual consultation instead.",
};

function ruleBasedReply(message) {
  const q = message.toLowerCase();
  if (/(whiten|bleach|stain)/.test(q)) return KNOWLEDGE.whitening;
  if (/(implant)/.test(q)) return KNOWLEDGE.implant;
  if (/(veneer|smile makeover|makeover)/.test(q)) return KNOWLEDGE.veneers;
  if (/(invisalign|aligner|brace)/.test(q)) return KNOWLEDGE.invisalign;
  if (/(root canal|endodontic)/.test(q)) return KNOWLEDGE.endodontics;
  if (/(price|cost|quote|fee|how much)/.test(q)) return KNOWLEDGE.pricing;
  if (/(book|appointment|visit|schedule|reserve)/.test(q)) return KNOWLEDGE.booking;
  if (/(hurt|pain|sensitiv|symptom|ache|swelling)/.test(q)) return KNOWLEDGE.symptom;
  if (/(hour|open|close|time)/.test(q)) return KNOWLEDGE.hours;
  if (/(where|location|address|near)/.test(q)) return KNOWLEDGE.location;
  return "Thank you for reaching out! Our clinical concierge team can personalize your treatment plan. Would you like me to connect you with a senior dentist, or help you book a consultation?";
}

async function anthropicReply(message, history) {
  const systemPrompt = `You are Dr. AI, the warm, concise concierge chatbot for Aurelia Dental, a luxury dental studio.
Speak in short, helpful, hospitality-toned replies (2-4 sentences max). Offer to book appointments when relevant.
Known services & pricing: Laser Whitening ($299), Porcelain Veneers ($950/tooth), 3D Guided Implants ($1,850),
Invisalign Diamond Care ($3,200), Microscopic Endodontics, Holistic Preventive Spa. Specialists: Dr. Sarah Chen
(veneers/prosthodontics), Dr. Alexander Vance (implants/surgery), Dr. Elena Rostova (Invisalign/orthodontics).
Never give a clinical diagnosis — for pain/symptoms, gather basic detail and recommend an in-person exam.`;

  const messages = [
    ...history.slice(-6).map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: message },
  ];

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 300,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text : ruleBasedReply(message);
}

app.post('/api/chat', async (req, res) => {
  const message = (req.body && req.body.message || '').toString().trim();
  const history = Array.isArray(req.body && req.body.history) ? req.body.history : [];

  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required.' });
  }

  try {
    let reply;
    let mode;
    if (ANTHROPIC_API_KEY) {
      reply = await anthropicReply(message, history);
      mode = 'ai';
    } else {
      reply = ruleBasedReply(message);
      mode = 'rules';
    }
    res.json({ success: true, reply, mode });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.json({ success: true, reply: ruleBasedReply(message), mode: 'rules-fallback' });
  }
});

// ---- health check -----------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    aiMode: ANTHROPIC_API_KEY ? 'live-anthropic' : 'rule-based',
    time: new Date().toISOString(),
  });
});

// fallback to index.html for root
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✨ Aurelia Dental server running at http://localhost:${PORT}`);
  console.log(`   Dr. AI mode: ${ANTHROPIC_API_KEY ? 'live Anthropic API' : 'rule-based (set ANTHROPIC_API_KEY in .env for live AI)'}`);
  console.log(`   Admin bookings: GET /api/bookings with header x-admin-key: ${ADMIN_KEY}\n`);
});
