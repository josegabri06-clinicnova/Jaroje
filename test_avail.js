const TOKEN = process.env.BEDS24_TEMP_TOKEN;
const today = "2026-05-12";
const checkout = "2026-05-15";

// Test inventory endpoint
fetch(`https://api.beds24.com/v2/inventory/rooms/availability?startDate=${today}&endDate=${checkout}&propertyId=327286`, {
  headers: { 'token': TOKEN }
}).then(r => r.json()).then(j => console.log(JSON.stringify(j, null, 2))).catch(e => console.error(e));
