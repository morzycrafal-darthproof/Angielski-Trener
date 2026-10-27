// Przypomnienia o nauce (web push). Jeden użytkownik, stan w Firestore w dokumencie reminders/me:
// { subscription, on, first:'19:00', second:'21:30', lastStudy:'YYYY-MM-DD', report:{date, cards, minutes, streak}, sent:{date, slots:[]} }
// Cloud Scheduler co 15 min woła /push/tick; serwer sam decyduje, czy już pora (godziny w strefie Europe/Warsaw).
// Zmienne środowiskowe: VAPID_PUBLIC, VAPID_PRIVATE.
import webpush from 'web-push';
import { Firestore } from '@google-cloud/firestore';

const VAPID_PUBLIC = process.env.VAPID_PUBLIC || '';
if (VAPID_PUBLIC) webpush.setVapidDetails('https://morzycrafal-darthproof.github.io/Angielski-Trener/', VAPID_PUBLIC, process.env.VAPID_PRIVATE);
const doc = new Firestore().collection('reminders').doc('me');

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function warsaw(offsetDays = 0) {// 'YYYY-MM-DD' i 'HH:MM' w Polsce
  const d = new Date(Date.now() + offsetDays * 864e5);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
const read = async () => (await doc.get()).data() || {};

export const publicKey = () => ({ key: VAPID_PUBLIC });

export async function subscribe(b) {
  const upd = { on: !!b.on };
  if (b.subscription && typeof b.subscription.endpoint === 'string') upd.subscription = b.subscription;
  if (HHMM.test(b.first)) upd.first = b.first;
  if (HHMM.test(b.second)) upd.second = b.second;
  await doc.set(upd, { merge: true });
  return { ok: true };
}

// Aplikacja raportuje przy każdej nauce i przy otwarciu. lastStudy to lokalna data telefonu, więc raport wysłany
// z opóźnieniem (np. po nauce offline) nadal zalicza właściwy dzień.
export async function activity(b) {
  const s = await read(), upd = {};
  if (DATE.test(b.lastStudy) && (!s.lastStudy || b.lastStudy > s.lastStudy)) upd.lastStudy = b.lastStudy;
  upd.report = { date: warsaw().date, cards: +b.cards || 0, cardsTomorrow: +b.cardsTomorrow || 0, minutes: +b.minutes || 0, streak: +b.streak || 0 };
  await doc.set(upd, { merge: true });
  return { ok: true };
}

function message(s, slot, today, yesterday) {
  const r = s.report || {};
  const cards = r.date === today ? r.cards : r.date === yesterday ? r.cardsTomorrow : 0;
  const streak = s.lastStudy === yesterday ? r.streak || 0 : 0;
  const minutes = Math.max(5, Math.min(30, r.minutes || Math.ceil(cards / 3)));
  if (slot === 0) return {
    title: '📚 Czas na angielski',
    body: (cards ? `Czeka ${cards} kart (ok. ${minutes} min).` : 'Krótka sesja fiszek i jedna rozmowa?') + (streak ? ` Seria: 🔥 ${streak} dni.` : ''),
  };
  return streak
    ? { title: `🔥 Seria ${streak} dni jest zagrożona!`, body: 'Wystarczy 5 minut fiszek, żeby jej nie stracić.' }
    : { title: '⏰ Ostatnia szansa na dziś', body: 'Pięć minut fiszek przed snem robi różnicę.' };
}

async function push(s, msg) {
  try {
    await webpush.sendNotification(s.subscription, JSON.stringify({ ...msg, url: './?v=cards' }), { TTL: 3600, urgency: 'normal' });
    return true;
  } catch (e) {
    // 404/410 = subskrypcja wygasła (np. odinstalowanie aplikacji, wyczyszczenie danych)
    if (e.statusCode === 404 || e.statusCode === 410) await doc.set({ subscription: null }, { merge: true });
    console.warn('push failed:', e.statusCode, e.body || e.message);
    return false;
  }
}

export async function tick() {
  const s = await read(), now = warsaw(), yesterday = warsaw(-1).date;
  if (!s.on || !s.subscription) return { skip: 'wyłączone' };
  if (s.lastStudy === now.date) return { skip: 'dziś była nauka' };
  // najpóźniejsza godzina, która już minęła; jeśli przypomnienie włączono np. o 22:00, idzie tylko drugie
  const slots = [s.first || '19:00', s.second || '21:30'];
  let slot = -1; slots.forEach((t, i) => { if (t <= now.time) slot = i; });
  if (slot < 0) return { skip: 'za wcześnie' };
  const sent = s.sent && s.sent.date === now.date ? s.sent.slots : [];
  if (sent.includes(slot)) return { skip: 'już wysłane' };
  const ok = await push(s, message(s, slot, now.date, yesterday));
  await doc.set({ sent: { date: now.date, slots: [...sent, slot] } }, { merge: true });
  return { sent: slot, ok };
}

export async function test() {
  const s = await read();
  if (!s.subscription) return { ok: false, error: 'Brak subskrypcji. Włącz przypomnienia w aplikacji.' };
  const ok = await push(s, { title: '🔔 Test przypomnienia', body: 'Działa! Tak będą wyglądać przypomnienia o nauce.' });
  return ok ? { ok } : { ok, error: 'Nie udało się wysłać. Wyłącz i włącz przypomnienia ponownie.' };
}
