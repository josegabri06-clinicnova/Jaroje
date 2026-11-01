const https = require('https');

const token = "IipmtrF7oU5yqTxmrFB8VHiMWFyNZjKazUNk5tVtkyZTWUKlSg+rfnr51O2ufG7JS1ka3yEx4lQKGPjXK0yaHvASmoIhDR1sElwPNJxbTvBK02RFisURhH46JaRO3g8ArTcFQ7S0Bwm13zLuIx/XFQ==";
const bookingId = "90131016";

const options = {
  hostname: 'api.beds24.com',
  path: `/v2/bookings?id=${bookingId}`,
  method: 'GET',
  headers: {
    'token': token,
    'Accept': 'application/json'
  }
};

console.log('Sending GET request to Beds24...');
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log(`Status Code: ${res.statusCode}`);
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('Request failed:', e);
});

req.end();
