const gasUrl = 'https://script.google.com/macros/s/AKfycbx2c3HpG-iRXMmOiCB-XJkkXHuN3Rwpdz_FW6Fr61uPen6_IaNkM8Aslq6BbaAooPJpJw/exec';
fetch(gasUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'getContacts', userId: '1', userRole: 'Gerente' })
}).then(r => r.json()).then(d => {
  console.log("Config keys:", d.config ? Object.keys(d.config) : 'No config');
  console.log("First lead keys:", d.data && d.data[0] ? Object.keys(d.data[0]) : 'No data');
  if (d.data) {
     const bdayLead = d.data.find(l => l.Nombre_Persona === 'Prueba' || l.Cumpleanos || l.cf_cumpleanos || l.cf_cumpleaos);
     console.log("Sample lead:", bdayLead);
  }
}).catch(console.error);
