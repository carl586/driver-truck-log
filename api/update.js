import { neon } from '@neondatabase/serverless';
import { waitUntil } from '@vercel/functions';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const data = req.body;
    if (!data || !data.status) {
      return res.status(400).json({ error: 'Missing status' });
    }

    const sql = neon(process.env.DATABASE_URL);

    await sql`
      INSERT INTO updates (
        id, status, is_truck,
        driver_name, phone, company_name, truck_number,
        truck_owner, owner_phone, previous_company, previous_truck,
        codriver_name, codriver_phone,
        vin, state, plate, year,
        effective_date, notes, created_at, synced
      ) VALUES (
        ${data.id},
        ${data.status},
        ${data.isTruck || false},
        ${data.driverName || null},
        ${data.phone || null},
        ${data.companyName || null},
        ${data.truckNumber || null},
        ${data.truckOwner || null},
        ${data.ownerPhone || null},
        ${data.previousCompany || null},
        ${data.previousTruck || null},
        ${data.codriverName || null},
        ${data.codriverPhone || null},
        ${data.vin || null},
        ${data.state || null},
        ${data.plate || null},
        ${data.year || null},
        ${data.effectiveDate || null},
        ${data.notes || null},
        ${data.createdAt || Date.now()},
        true
      )
    `;

    // Respond immediately — Telegram runs in background
    res.status(200).json({ ok: true });
    waitUntil(sendTelegram(data));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

async function sendTelegram(data) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('Telegram env vars missing');
    return;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildTelegramMessage(data),
        parse_mode: 'HTML',
      }),
    });
    const tg = await r.json();
    if (!tg.ok) console.error('Telegram error:', tg);
  } catch (err) {
    console.error('Telegram failed:', err);
  }
}

/** yyyy-mm-dd → m/d/yyyy (no leading zeros) */
function formatDate(iso) {
  if (!iso) return '';
  const parts = String(iso).split('-');
  if (parts.length !== 3) return iso;
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  const y = parts[0];
  if (!m || !d || !y) return iso;
  return `${m}/${d}/${y}`;
}

function line(label, value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return `<b>${label}:</b> ${String(value).trim()}`;
}

function buildTelegramMessage(e) {
  const lines = [];

  if (e.status === 'joined') {
    lines.push('<b>#newdriver</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('Truck Owner', e.truckOwner));
    lines.push(line('Driver Name', e.driverName));
    lines.push(line('Phone number', e.phone));
    lines.push(line('Hire date', formatDate(e.effectiveDate)));
  } else if (e.status === 'switched') {
    lines.push('<b>#switchdriver</b>', '');
    lines.push(line('Company', e.companyName));
    const truckParts = [];
    if (e.truckNumber) truckParts.push(`to ${e.truckNumber}`);
    if (e.previousTruck) truckParts.push(`from ${e.previousTruck}`);
    if (truckParts.length) lines.push(`<b>Truck:</b> ${truckParts.join(' ')}`);
    lines.push(line('Truck owner', e.truckOwner));
    lines.push(line('Owner phone number', e.ownerPhone));
    lines.push(line('Driver name', e.driverName));
    lines.push(line('Phone number', e.phone));
    lines.push(line('Codriver name', e.codriverName));
    lines.push(line('Codriver ph', e.codriverPhone));
    lines.push(line('Switch date', formatDate(e.effectiveDate)));
  } else if (e.status === 'left') {
    lines.push('<b>#leftdriver</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('Truck owner', e.truckOwner));
    lines.push(line('Driver name', e.driverName));
    lines.push(line('Phone number', e.phone));
    lines.push(line('Left date', formatDate(e.effectiveDate)));
  } else if (e.status === 'returned') {
    lines.push('<b>#returndriver</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('Truck Owner', e.truckOwner));
    lines.push(line('Driver Name', e.driverName));
    lines.push(line('Phone number', e.phone));
    lines.push(line('Return date', formatDate(e.effectiveDate)));
  } else if (e.status === 'newtruck') {
    lines.push('<b>#newtruck</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('VIN', e.vin));
    lines.push(line('State', e.state));
    lines.push(line('Plate', e.plate));
    lines.push(line('Year', e.year));
    lines.push(line('Truck Owner', e.truckOwner));
    lines.push(line('Owner phone', e.ownerPhone));
    lines.push(line('Date', formatDate(e.effectiveDate)));
  } else if (e.status === 'switchedtruck') {
    lines.push('<b>#switchtruck</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('Truck Owner', e.truckOwner));
    lines.push(line('Owner phone', e.ownerPhone));
    lines.push(line('Switch date', formatDate(e.effectiveDate)));
  } else if (e.status === 'lefttruck') {
    lines.push('<b>#lefttruck</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('Truck Owner', e.truckOwner));
    lines.push(line('Owner phone', e.ownerPhone));
    lines.push(line('Left date', formatDate(e.effectiveDate)));
  } else if (e.status === 'returnedtruck') {
    lines.push('<b>#returntruck</b>', '');
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('VIN', e.vin));
    lines.push(line('Truck Owner', e.truckOwner));
    lines.push(line('Owner phone', e.ownerPhone));
    lines.push(line('Return date', formatDate(e.effectiveDate)));
  } else {
    lines.push(`<b>#${e.status}</b>`, '');
    lines.push(line('Driver', e.driverName));
    lines.push(line('Company', e.companyName));
    lines.push(line('Truck', e.truckNumber));
    lines.push(line('Date', formatDate(e.effectiveDate)));
  }

  if (e.notes) lines.push(line('Notes', e.notes));

  return lines.filter(Boolean).join('\n');
}
