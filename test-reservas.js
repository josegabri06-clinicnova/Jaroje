const fs = require('fs');
require('dotenv').config({ path: '.env' });

async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: 679091,
        unitId: 5,
        checkIn: '2027-01-10',
        checkOut: '2027-01-12',
        guestName: 'TEST Jaroje Bot',
        isBlock: true
      })
    });
    // Let's write a script that sends a cancel request to Beds24
    
    // We already have a BEDS24 connection. Let's just use the beds24 token directly to cancel.
    const refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
      method: 'GET',
      headers: { 'refreshToken': process.env.BEDS24_REFRESH_TOKEN }
    });
    const { token } = await refreshRes.json();
    const cancelRes = await fetch('https://api.beds24.com/v2/bookings', {
      method: 'POST',
      headers: { 'token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify([{
        id: 86745095,
        status: 'cancelled'
      }])
    });
    console.log(await cancelRes.text());
  } catch(e) {
    console.error(e);
  }
}
run();
