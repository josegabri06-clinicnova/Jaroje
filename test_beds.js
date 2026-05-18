const BEDS24_TOKEN = process.env.BEDS24_TEMP_TOKEN;
fetch('https://api.beds24.com/v2/bookings', {
  headers: { 'token': BEDS24_TOKEN }
}).then(r => r.json()).then(j => console.log(JSON.stringify(j.data[0], null, 2))).catch(e => console.error(e));
