const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

async function getBeds24Token() {
  const refreshToken = process.env.BEDS24_REFRESH_TOKEN;
  const refreshRes = await fetch('https://api.beds24.com/v2/authentication/token', {
    method: 'GET',
    headers: { 'refreshToken': refreshToken }
  });
  const data = await refreshRes.json();
  return data.token;
}

async function run() {
  const token = await getBeds24Token();
  const res = await fetch('https://api.beds24.com/v2/properties', {
    headers: { 'token': token }
  });
  const json = await res.json();
  fs.writeFileSync('props.json', JSON.stringify(json, null, 2));
  console.log("Done");
}

run();
