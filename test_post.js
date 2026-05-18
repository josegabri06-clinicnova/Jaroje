const BEDS24_TOKEN = process.env.BEDS24_TEMP_TOKEN;
fetch('https://api.beds24.com/v2/bookings', {
  method: 'POST',
  headers: { 'token': BEDS24_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify([{
    roomId: "679091",
    roomQty: 1,
    arrival: "2026-05-13",
    departure: "2026-05-14",
    firstName: "Test POST",
    status: "1"
  }])
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2))).catch(e => console.error(e));
