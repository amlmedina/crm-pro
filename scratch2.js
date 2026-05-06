const gasUrl = 'https://script.google.com/macros/s/AKfycbx2c3HpG-iRXMmOiCB-XJkkXHuN3Rwpdz_FW6Fr61uPen6_IaNkM8Aslq6BbaAooPJpJw/exec';
const payload = {
  action: 'saveProfile',
  userId: '1',
  perfil: {
    ID_Contacto: 'C-1774562597536',
    Nombre_Persona: 'Alejandro',
    Cumpleanos: '05-21'
  }
};
fetch(gasUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload)
}).then(r => r.json()).then(d => {
  console.log("Save Response:", d);
  // Fetch again to see if it updated
  return fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'getContacts', userId: '1', userRole: 'Gerente' })
  });
}).then(r => r.json()).then(d => {
  const bdayLead = d.data.find(l => l.ID_Contacto === 'C-1774562597536');
  console.log("After save:", bdayLead.Cumpleanos);
}).catch(console.error);
