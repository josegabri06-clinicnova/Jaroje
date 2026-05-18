const NEW_TOKEN = "WkpfFL2d0QB+lC+CgHqlA0+/Yf3xosDTlDYP+HBjm6pPyguu96TYPy+gMT1+GcX1aqJ/VzcXcpuHgl4tderIHK8RPjvm2C7oPTPmleC1PBZVt3H9akVZYrLcGGaUWL/cuffy3Cn36ruDBVAW63zoooSpr4Yiwga/pilrsv9NjWQ=";

// Try as temp token
fetch('https://api.beds24.com/v2/bookings', {
  headers: { 'token': NEW_TOKEN }
}).then(r => r.json()).then(j => {
  console.log("AS TEMP TOKEN:", j.success ? "✅ WORKS" : "❌ FAILED: " + j.error);
  
  // Try as refresh token
  return fetch('https://api.beds24.com/v2/authentication/token', {
    headers: { 'refreshToken': NEW_TOKEN }
  });
}).then(r => r.json()).then(j => {
  console.log("AS REFRESH TOKEN:", JSON.stringify(j, null, 2));
}).catch(e => console.error(e));
