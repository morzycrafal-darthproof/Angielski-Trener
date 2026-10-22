// Pośrednik między aplikacją a Gemini (Vertex AI) na Cloud Run.
// Brak klucza API: Cloud Run korzysta z uprawnień konta usługi projektu.
// Zmienne środowiskowe: ACCESS_CODE (wymagany kod z ustawień aplikacji), MODEL, GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION.
import http from 'node:http';
import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';

const PORT = process.env.PORT || 8080;
const MODEL = process.env.MODEL || 'gemini-3.5-flash';
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const ORIGINS = ['https://morzycrafal-darthproof.github.io', 'http://localhost:8000'];
const LIMIT_PER_HOUR = 120; // wszystkie zapytania łącznie; ochrona kredytów przed pętlą albo wyciekiem kodu

const ai = new GoogleGenAI({
  enterprise: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION || 'global',
});

let hits = [];
function rateOk() { const now = Date.now(); hits = hits.filter(t => now - t < 3600e3); if (hits.length >= LIMIT_PER_HOUR) return false; hits.push(now); return true; }
function codeOk(given) {
  if (!ACCESS_CODE) return false;
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(ACCESS_CODE).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- prompty ----------
function persona(body) {
  const s = body.scenario || {};
  const words = (body.words || []).slice(0, 12).map(w => `${w.en} (${w.pl})`).join(', ');
  return `You are a friendly English conversation partner for a Polish adult learner moving from B1 to B2.
Role-play scenario: ${s.title || 'Free conversation'}.
Your role: ${s.role || 'a friendly native speaker from the UK'}.
Goal of the conversation: ${s.goal || 'have a natural conversation on the topic the learner chooses'}.
${s.topic ? `Topic chosen by the learner: ${s.topic}.` : ''}
Rules:
- Stay in role. Speak natural British English at B2 level. Keep each reply short: 1–3 sentences, then usually ask a question to keep the learner talking.
- If the learner clearly struggles, simplify your language.
- Never correct mistakes inside your reply — corrections go only into the "corrections" field.
- The learner's messages come from speech recognition, so ignore missing punctuation, capital letters and obvious recognition errors.
${words ? `- Naturally use some of these words the learner is studying, and create chances for the learner to use them: ${words}.` : ''}
- When the goal of the scenario is reached (usually after 8–12 exchanges), close the conversation politely in role.`;
}

const CORR = {
  type: 'array',
  description: 'Only mistakes in the LAST learner message that change the meaning or sound clearly unnatural. Skip punctuation, capitalisation and speech-recognition noise. Empty array if none.',
  items: {
    type: 'object',
    properties: {
      wrong: { type: 'string', description: 'The learner\'s fragment' },
      right: { type: 'string', description: 'Natural corrected version' },
      why: { type: 'string', description: 'Short explanation in Polish' },
    },
    required: ['wrong', 'right', 'why'],
  },
};
const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Your next line in the conversation, in English' },
    corrections: CORR,
    finished: { type: 'boolean', description: 'true if you have just closed the conversation' },
  },
  required: ['reply', 'corrections', 'finished'],
};
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    comment: { type: 'string', description: '2–3 sentences in Polish: overall feedback, what went well, what to work on' },
    mistakes: { ...CORR, description: 'The most important recurring or meaning-changing mistakes from the whole conversation, max 8. Explanations in Polish.' },
    phrases: {
      type: 'array',
      description: '3–5 useful B2 words or phrases from this conversation (or that the learner should have used), worth adding to flashcards',
      items: {
        type: 'object',
        properties: {
          en: { type: 'string' }, pl: { type: 'string', description: 'Polish translation' },
          ex: { type: 'string', description: 'Example sentence in English' },
        },
        required: ['en', 'pl', 'ex'],
      },
    },
    usedWords: { type: 'array', items: { type: 'string' }, description: 'Which of the learner\'s study words the LEARNER used correctly (exact "en" values)' },
  },
  required: ['comment', 'mistakes', 'phrases', 'usedWords'],
};

function contents(history) {
  return (history || []).slice(-30).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: String(m.text || '').slice(0, 1500) }],
  }));
}

// Gemini czasem zawiesza się zamiast odpowiedzieć w 3–9 s, więc przerywamy po 15 s i ponawiamy.
// Trzy próby mieszczą się w 60 s limitu Cloud Run.
async function ask(system, history, schema, thinkingLevel) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await ai.models.generateContent({
        model: MODEL,
        contents: contents(history),
        config: {
          systemInstruction: system, responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0.7,
          ...(thinkingLevel ? { thinkingConfig: { thinkingLevel } } : {}),
          httpOptions: { timeout: 15000 },
        },
      });
      return JSON.parse(r.text);
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn('retry after:', e.message || e);
    }
  }
}

async function chat(body) {
  const history = body.history || [];
  if (!history.length) history.push({ role: 'user', text: '(The learner has just opened the conversation. Start it in role with a short greeting and a first question. Return an empty corrections array.)' });
  return ask(persona(body), history, CHAT_SCHEMA, 'LOW'); // szybka odpowiedź w rozmowie; podsumowanie myśli dłużej
}

async function summary(body) {
  const words = (body.words || []).map(w => w.en).join(', ');
  const system = `${persona(body)}

The conversation is over. Now act as an English teacher and analyse ONLY the learner's messages (role "user").
The learner's study words were: ${words || 'none'}.
Write all explanations in Polish.`;
  const history = (body.history || []).concat({ role: 'user', text: '(Conversation finished. Return the summary.)' });
  return ask(system, history, SUMMARY_SCHEMA);
}

// ---------- HTTP ----------
function send(res, code, obj, origin) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Access-Code',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  });
  res.end(obj === null ? '' : JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const origin = ORIGINS.includes(req.headers.origin) ? req.headers.origin : ORIGINS[0];
  if (req.method === 'OPTIONS') return send(res, 204, null, origin);
  if (req.method === 'GET' && req.url === '/') return send(res, 200, { ok: true }, origin);
  if (req.method !== 'POST' || !['/chat', '/summary'].includes(req.url)) return send(res, 404, { error: 'not found' }, origin);
  // Własny nagłówek: Cloud Run przechwytuje „Authorization: Bearer” jako token Google.
  if (!codeOk(req.headers['x-access-code'])) return send(res, 401, { error: 'Zły kod dostępu' }, origin);
  if (!rateOk()) return send(res, 429, { error: 'Limit zapytań na godzinę wyczerpany' }, origin);
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 100e3) return send(res, 413, { error: 'Za duże zapytanie' }, origin); }
  try {
    const body = JSON.parse(raw || '{}');
    const out = req.url === '/chat' ? await chat(body) : await summary(body);
    send(res, 200, out, origin);
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Błąd serwera: ' + (e.message || e) }, origin);
  }
}).listen(PORT, () => console.log(`listening on ${PORT}, model ${MODEL}`));
