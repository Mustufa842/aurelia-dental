// Shared Dr. AI knowledge base and reply logic, used by src/index.js

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

export function ruleBasedReply(message) {
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

export async function anthropicReply(message, history, env) {
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
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 300,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  return textBlock ? textBlock.text : ruleBasedReply(message);
}
