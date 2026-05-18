const BEDS24_TOKEN = process.env.BEDS24_TEMP_TOKEN;
fetch('https://api.beds24.com/v2/properties?roomId=679091', {
  headers: { 'token': BEDS24_TOKEN }
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2))).catch(e => console.error(e));
