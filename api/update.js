import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Allow your GitHub Pages site to call this API
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const data = req.body;

    if (!data || !data.status) {
      return res.status(400).json({ error: 'Missing status' });
    }

    const sql = neon(process.env.DATABASE_URL);

    // Save to Neon
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

    // Build Telegram message
    const text = buildTelegramMessage(data);

    // Send to Telegram
    const tgRes = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML'
        })
      }
    );

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      console.error('Telegram error:', tgData);
      return res.status(500).json({
        error: 'Saved to database but Telegram failed',
        details: tgData.description
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}

function buildTelegramMessage(e) {
  const titles = {
    joined: '#newdriver',
    switched: '#switched',
    left: '#left',
    returned: '#returned',
    newtruck: '#newtruck',
    switchedtruck: '#switchedtruck',
    lefttruck: '#lefttruck',
    returnedtruck: '#returnedtruck'
  };

  let lines = [`<b>${titles[e.status] || e.status}</b>`, ''];

  if (e.isTruck || ['newtruck','switchedtruck','lefttruck','returnedtruck'].includes(e.status)) {
    if (e.truckNumber) lines.push(`<b>truck</b>  ${e.truckNumber}`);
    if (e.vin)         lines.push(`<b>vin</b>  ${e.vin}`);
    if (e.state)       lines.push(`<b>state</b>  ${e.state}`);
    if (e.plate)       lines.push(`<b>plate</b>  ${e.plate}`);
    if (e.year)        lines.push(`<b>year</b>  ${e.year}`);
    if (e.effectiveDate) lines.push(`<b>date</b>  ${e.effectiveDate}`);
  } else {
    if (e.driverName)      lines.push(`<b>driver name</b>  ${e.driverName}`);
    if (e.phone)           lines.push(`<b>phone number</b>  ${e.phone}`);
    if (e.companyName)     lines.push(`<b>company</b>  ${e.companyName}`);
    if (e.previousCompany) lines.push(`<b>previous company</b>  ${e.previousCompany}`);
    if (e.previousTruck)   lines.push(`<b>previous truck</b>  ${e.previousTruck}`);
    if (e.truckNumber)     lines.push(`<b>truck</b>  ${e.truckNumber}`);
    if (e.truckOwner)      lines.push(`<b>truck owner</b>  ${e.truckOwner}`);
    if (e.ownerPhone)      lines.push(`<b>owner phone</b>  ${e.ownerPhone}`);
    if (e.codriverName)    lines.push(`<b>co-driver</b>  ${e.codriverName}`);
    if (e.codriverPhone)   lines.push(`<b>co-driver phone</b>  ${e.codriverPhone}`);
    if (e.effectiveDate)   lines.push(`<b>date</b>  ${e.effectiveDate}`);
  }

  if (e.notes) lines.push(`<b>notes</b>  ${e.notes}`);

  return lines.join('\n');
}
