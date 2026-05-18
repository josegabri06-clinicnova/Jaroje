const REFRESH_TOKEN = process.env.BEDS24_REFRESH_TOKEN;
fetch('https://api.beds24.com/v2/authentication/token', {
  method: 'GET',
  headers: { 'refreshToken': REFRESH_TOKEN }
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2))).catch(e => console.error(e));
