'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Drawer({ open, onClose, lead, tab, setTab, cfg, user, refreshLeads }) {
  const [f, setF] = useState({});
  const [cfs, setCfs] = useState({});
  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [notas, setNotas] = useState('');

  // ── WhatsApp State ──────────────────────────────────────
  const [waMessages, setWaMessages]   = useState([]);
  const [waLoadingHist, setWaLoadingHist] = useState(false);
  const [waMsg, setWaMsg]             = useState('');
  const [waSending, setWaSending]     = useState(false);
  const [waError, setWaError]         = useState('');
  const waChatRef = useRef(null);

  async function loadWaHistory(phone) {
    if (!phone) return;
    setWaLoadingHist(true);
    setWaError('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history', to: phone })
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || 'Error al cargar historial');
        setWaMessages([]);
      } else {
        setWaMessages(Array.isArray(data) ? data : []);
      }
    } catch {
      setWaError('Error de conexión con MiBot');
      setWaMessages([]);
    }
    setWaLoadingHist(false);
  }

  async function sendWaMessage() {
    if (!waMsg.trim()) return;
    if (!lead?.Telefono) return;
    setWaSending(true);
    setWaError('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', to: lead.Telefono, message: waMsg.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || 'No se pudo enviar el mensaje');
      } else {
        // Optimistic update
        const newMsg = {
          id: Date.now(),
          to: lead.Telefono,
          message: waMsg.trim(),
          createdAt: new Date().toISOString(),
          status: 'sent'
        };
        setWaMessages(prev => [...prev, newMsg]);
        setWaMsg('');
        // No auto-log, WA messages stay only in WA tab
      }
    } catch {
      setWaError('Error de conexión con MiBot');
    }
    setWaSending(false);
  }

  // Scroll al último mensaje cuando cambia la lista
  useEffect(() => {
    if (waChatRef.current) {
      waChatRef.current.scrollTop = waChatRef.current.scrollHeight;
    }
  }, [waMessages]);

  // Cargar historial WA cuando se cambia al tab whatsapp
  useEffect(() => {
    if (tab === 'wa' && lead?.Telefono) {
      loadWaHistory(lead.Telefono);
      // Marcar como leídos
      fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all', to: lead.Telefono })
      }).catch(() => {});
    }
  }, [tab, lead]);

  // Auto-polling cada 8s cuando el tab WhatsApp está activo
  useEffect(() => {
    if (tab !== 'wa' || !lead?.Telefono) return;
    const interval = setInterval(() => {
      loadWaHistory(lead.Telefono);
      fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all', to: lead.Telefono })
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [tab, lead]);
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  // Quick Actions (Tasks & Status)
  
  async function promptTask() {
    Swal.fire({ title: 'Cargando equipo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    let usersList = [];
    try {
      usersList = await api('getUsuarios');
      Swal.close();
    } catch {
      Swal.close();
      return Swal.fire('Error', 'No se pudo cargar la lista de usuarios', 'error');
    }

    if (!usersList || usersList.length === 0) {
       return Swal.fire('Error', 'No hay usuarios disponibles', 'warning');
    }

    const un = usersList.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
    
    const htmlForm = `
      <div style="text-align: left; font-size: 0.85rem;">
         <label style="display:block; margin-bottom: 5px; font-weight: 600; color: var(--muted);">Responsable</label>
         <select id="t_assignee" class="swal2-select" style="width: 100%; margin: 0 0 15px 0; font-size: 0.85rem;">
           ${un}
         </select>
         <label style="display:block; margin-bottom: 5px; font-weight: 600; color: var(--muted);">Fecha Límite (Opcional)</label>
         <input type="date" id="t_due" class="swal2-input" style="width: 100%; margin: 0 0 15px 0; font-size: 0.85rem;" />
         <label style="display:block; margin-bottom: 5px; font-weight: 600; color: var(--muted);">Notas / Descripción</label>
         <textarea id="t_notes" class="swal2-textarea" style="width: 100%; margin: 0; min-height: 80px; font-size: 0.85rem;" placeholder="Escribe los detalles de la tarea..."></textarea>
      </div>
    `;

    const result = await Swal.fire({
      title: 'Crear Tarea',
      html: htmlForm,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const assignee = document.getElementById('t_assignee').value;
        const dueDate = document.getElementById('t_due').value;
        const notes = document.getElementById('t_notes').value;
        if (!assignee || !notes.trim()) {
          Swal.showValidationMessage('Las notas son obligatorias');
          return false;
        }
        return { assignee, dueDate, notes };
      }
    });

    if (!result.isConfirmed) return;
    const { assignee, dueDate, notes: taskText } = result.value;

    setLoading(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           action: 'create', 
           text: taskText,
           assignee: assignee,
           dueDate: dueDate || null,
           leadId: lead?.ID_Contacto,
           leadName: lead?.Nombre_Persona || lead?.Nombre_Empresa || 'Contacto Desconocido'
        })
      });
      Swal.fire({ title: '✅ Tarea Asignada', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'No se pudo guardar la tarea', 'error');
    }
    setLoading(false);
  }

  async function handleWaStatusChange(nuevoE) {
     if (nuevoE === lead?.Estado_Funnel) return;
     setLoading(true);
     try {
       await api('saveInteraction', {
          idContacto: lead.ID_Contacto,
          nuevoEstado: nuevoE,
          notas: `🔄 Status actualizado desde WhatsApp a: ${nuevoE}`,
          nombreUsuario: user.nombre
       });
       await refreshLeads();
       setF({ ...f, Estado_Funnel: nuevoE });
       await loadHistorial(lead.ID_Contacto);
       Swal.fire({ title: 'Status Actualizado', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
     } catch {
       Swal.fire('Error', 'No se pudo actualizar', 'error');
     }
     setLoading(false);
  }

  const predefs = cfg.wa_predefs || [
    "Hola, ¿cómo estás?",
    "Me comunico para dar seguimiento",
    "Te comparto la información",
    "¿Tendrás disponibilidad para una llamada?",
    "¡Gracias por tu interés!"
  ];
  // ─────────────────────────────────────────────────────────

  // Sincronizar data inicial cuando se abre el drawer
  useEffect(() => {
    if (open) {
      if (lead) {
        setF({
          Nombre_Persona: lead.Nombre_Persona || '',
          Nombre_Empresa: lead.Nombre_Empresa || '',
          Puesto: lead.Puesto || '',
          Tomador_Decision: lead.Tomador_Decision || '',
          Telefono: lead.Telefono || '',
          Correo_Corp: lead.Correo_Corp || '',
          Tamano_Org: lead.Tamano_Org || '',
          Num_Empleados: lead.Num_Empleados || '',
          Sitio_Web: lead.Sitio_Web || '',
          Direccion: lead.Direccion || '',
          Presupuesto: lead.Presupuesto || '',
          Estado_Funnel: lead.Estado_Funnel || (cfg.funnel?.[0]?.stage || '')
        });
        
        const cfsData = {};
        (cfg.camposPersonalizados || []).forEach(c => {
          cfsData[c.key] = lead[c.key] || '';
        });
        setCfs(cfsData);
        
        loadHistorial(lead.ID_Contacto);
      } else {
        // Nuevo Lead
        setF({
          Nombre_Persona: '', Nombre_Empresa: '', Puesto: '', Tomador_Decision: '',
          Telefono: '', Correo_Corp: '', Tamano_Org: '', Num_Empleados: '',
          Sitio_Web: '', Direccion: '', Presupuesto: '', Estado_Funnel: cfg.funnel?.[0]?.stage || ''
        });
        const cfsData = {};
        (cfg.camposPersonalizados || []).forEach(c => { cfsData[c.key] = ''; });
        setCfs(cfsData);
        setHist([]);
      }
      setNotas('');
    }
  }, [open, lead, cfg]);

  async function loadHistorial(id) {
    if (!id) return;
    setLoadingHist(true);
    try {
      const res = await api('getInteractions', { idContacto: id });
      setHist(res || []);
    } catch {
      setHist([]);
    }
    setLoadingHist(false);
  }

  async function doSavePerfil() {
    if (!f.Nombre_Persona) return Swal.fire('Requerido', 'El nombre es obligatorio', 'warning');
    setLoading(true);
    try {
      const perfil = { ID_Contacto: lead?.ID_Contacto, ...f, ...cfs };
      await api('saveProfile', { perfil, userId: user.id });
      await refreshLeads();
      Swal.fire({ title: '✅ Guardado', icon: 'success', timer: 1500, showConfirmButton: false });
      if (!lead?.ID_Contacto) onClose(); // close if it was new
    } catch {
      Swal.fire('Error', 'No se pudo guardar', 'error');
    }
    setLoading(false);
  }

  async function doSaveInt() {
    if (!lead?.ID_Contacto) return Swal.fire('Sin ID', 'Guarda el perfil primero', 'info');
    if (!notas.trim()) return Swal.fire('Requerido', 'Escribe notas de la interacción', 'warning');
    
    let nuevoE = f.Estado_Funnel;
    const actual = lead.Estado_Funnel;
    const lim = cfg.funnel?.find(x => x.stage === actual)?.limit || 0;

    if (nuevoE === actual && lim > 0) {
      let racha = 0;
      for (const h of hist) { if (h.Estado_Momento === actual) racha++; else break; }
      if (racha >= lim - 1) {
        nuevoE = 'Congelado';
        await Swal.fire({ title: '🚨 SLA', text: `Límite de strikes en "${actual}". Movido a Congelado.`, icon: 'warning' });
      }
    }

    setLoading(true);
    try {
      await api('saveInteraction', { idContacto: lead.ID_Contacto, nuevoEstado: nuevoE, notas, nombreUsuario: user.nombre });
      await refreshLeads();
      setF({ ...f, Estado_Funnel: nuevoE });
      setNotas('');
      await loadHistorial(lead.ID_Contacto);
      Swal.fire({ title: '✅ Registrado', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'Hubo un problema', 'error');
    }
    setLoading(false);
  }

  async function copyEmail(ev) {
    ev.preventDefault();
    if (!f.Correo_Corp) return Swal.fire('Vacío', 'No hay correo para copiar', 'info');
    
    try {
      await navigator.clipboard.writeText(f.Correo_Corp);
      if (lead?.ID_Contacto) {
         await api('saveInteraction', {
             idContacto: lead.ID_Contacto, 
             nuevoEstado: lead.Estado_Funnel, 
             notas: '📋 [SEGURIDAD] El usuario copió el correo al portapapeles.', 
             nombreUsuario: user.nombre 
         });
         await loadHistorial(lead.ID_Contacto);
      }
      Swal.fire({ title: 'Copiado', icon: 'success', timer: 1200, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'No se pudo copiar', 'error');
    }
  }

  return (
    <>
      <div id="ov" style={{ display: open ? 'block' : 'none' }} onClick={onClose} />
      <div id="drawer" className={open ? 'open' : ''}>
        <div id="drhdr">
          <div>
            <div id="drtitle">{lead?.Nombre_Persona || 'Nuevo Lead'}</div>
            <div id="drsub">{lead?.Nombre_Empresa || 'Completa el perfil'}</div>
          </div>
          <button className="btnx" onClick={onClose}>✕</button>
        </div>
        
        <div id="drbody">
          <div className="dtabs">
            <button className={`dtab ${tab === 'perfil' ? 'on' : ''}`} onClick={() => setTab('perfil')}>Perfil</button>
            <button className={`dtab ${tab === 'int' ? 'on' : ''}`} onClick={() => setTab('int')}>Interacción</button>
            <button className={`dtab ${tab === 'hist' ? 'on' : ''}`} onClick={() => setTab('hist')}>Historial</button>
            {lead?.Telefono && (
              <button className={`dtab ${tab === 'wa' ? 'on' : ''}`} onClick={() => setTab('wa')} style={{ color: tab === 'wa' ? '#25d366' : undefined }}>
                💬 WhatsApp
              </button>
            )}
          </div>

          <div className={`dpanel ${tab === 'perfil' ? 'on' : ''}`}>
             <p className="stitle">Datos de Contacto</p>
             <div className="fgrid">
                <div className="fg full"><label>Nombre</label><input type="text" value={f.Nombre_Persona || ''} onChange={e => setF({...f, Nombre_Persona: e.target.value})} /></div>
                <div className="fg full"><label>Empresa</label><input type="text" value={f.Nombre_Empresa || ''} onChange={e => setF({...f, Nombre_Empresa: e.target.value})} /></div>
                <div className="fg"><label>Puesto</label><input type="text" value={f.Puesto || ''} onChange={e => setF({...f, Puesto: e.target.value})} /></div>
                <div className="fg">
                  <label>Decisor</label>
                  <select value={f.Tomador_Decision || ''} onChange={e => setF({...f, Tomador_Decision: e.target.value})}>
                     <option value="">—</option>
                     {cfg.opcionesTomador?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Teléfono</label><input type="tel" value={f.Telefono || ''} onChange={e => setF({...f, Telefono: e.target.value})} /></div>
                <div className="fg">
                   <label>Correo Corporativo</label>
                   <div style={{display:'flex', gap:'6px'}}>
                     <input type="email" style={{flex:1}} value={f.Correo_Corp || ''} onChange={e => setF({...f, Correo_Corp: e.target.value})} />
                     <button className="btn btnda" onClick={copyEmail} style={{padding:'0 12px', fontSize:'0.75rem'}}>📋 Copiar</button>
                   </div>
                </div>
                <div className="fg">
                  <label>Tamaño Org.</label>
                  <select value={f.Tamano_Org || ''} onChange={e => setF({...f, Tamano_Org: e.target.value})}>
                     <option value="">—</option>
                     {cfg.opcionesTamano?.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="fg"><label>Empleados</label><input type="number" value={f.Num_Empleados || ''} onChange={e => setF({...f, Num_Empleados: e.target.value})} /></div>
             </div>

             {/* Campos extra */}
             {cfg.camposPersonalizados?.length > 0 && (
               <>
                 <p className="stitle" style={{marginTop:'18px'}}>Campos Adicionales</p>
                 <div className="fgrid">
                   {cfg.camposPersonalizados.map(c => (
                     <div className="fg" key={c.key}>
                        <label>{c.label}</label>
                        {c.tipo === 'select' ? (
                          <select value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})}>
                            <option value="">—</option>
                            {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : c.tipo === 'bool' ? (
                          <select value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})}>
                            <option value="">—</option><option value="Sí">Sí</option><option value="No">No</option>
                          </select>
                        ) : (
                          <input type={c.tipo==='numero'?'number':c.tipo==='fecha'?'date':'text'} value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} />
                        )}
                     </div>
                   ))}
                 </div>
               </>
             )}

             <button className="btn btng btnw" style={{marginTop:'10px'}} onClick={doSavePerfil} disabled={loading}>
               {loading ? 'Guardando...' : '💾 Guardar Perfil'}
             </button>
          </div>

          <div className={`dpanel ${tab === 'int' ? 'on' : ''}`}>
             <p className="stitle">Registrar Interacción</p>
             <div className="fg">
                <label>Estado</label>
                <select value={f.Estado_Funnel} onChange={e => setF({...f, Estado_Funnel: e.target.value})}>
                   {cfg.funnel?.map(x => <option key={x.stage} value={x.stage}>{x.stage}</option>)}
                   <option value="Congelado">❄️ Congelado</option>
                </select>
             </div>
             <div className="fg">
                <label>Notas</label>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Agrega notas descriptivas..."></textarea>
             </div>
             <button className="btn btny btnw" style={{marginTop:'10px'}} onClick={doSaveInt} disabled={loading}>
               {loading ? 'Registrando...' : '⚡ Registrar Interacción'}
             </button>
          </div>

          <div className={`dpanel ${tab === 'hist' ? 'on' : ''}`}>
             <p className="stitle">Línea de Tiempo</p>
             <div className="tl">
                {loadingHist ? <p style={{color:'var(--muted)', fontSize:'.8rem'}}>Cargando historial...</p> : 
                 hist.length === 0 ? <p style={{color:'var(--muted)', fontSize:'.8rem'}}>Sin interacciones.</p> :
                 hist.map((h, i) => (
                   <div className="tli" key={i}>
                     <div className={`tldot ${h.Estado_Momento === 'Congelado' ? 'fz' : ''}`}></div>
                     <div className="tlmeta">{new Date(h.Fecha_Hora).toLocaleString()} · <strong style={{color:'var(--navy)'}}>{h.Estado_Momento}</strong> · {h.ID_Usuario}</div>
                     <div className="tlnote">{h.Notas}</div>
                   </div>
                 ))
                }
             </div>
          </div>

          {/* WhatsApp Chat Panel */}
          <div className={`dpanel ${tab === 'wa' ? 'on' : ''}`} style={{ display: tab === 'wa' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--brd)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--s2)', flexWrap: 'wrap' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>💬</div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{lead?.Nombre_Persona || 'Contacto'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{lead?.Telefono}</div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select 
                  value={f.Estado_Funnel || ''} 
                  onChange={e => handleWaStatusChange(e.target.value)}
                  style={{ padding: '5px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--brd)', outline: 'none', background: 'var(--s1)' }}
                >
                  <option value="">Status...</option>
                  {cfg.funnel?.map(x => <option key={x.stage} value={x.stage}>{x.stage}</option>)}
                </select>
                
                <button onClick={promptTask} style={{ background: 'var(--navy)', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                  + Tarea
                </button>
                
                <button
                  onClick={() => loadWaHistory(lead?.Telefono)}
                  style={{ background: 'var(--s1)', border: '1px solid var(--brd)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)', padding: '4px 8px', borderRadius: '4px' }}
                  title="Recargar historial"
                >🔄</button>
              </div>
            </div>

            {/* Chat bubbles */}
            <div ref={waChatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg)' }}>
              {waLoadingHist && (
                <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>Cargando historial…</p>
              )}
              {!waLoadingHist && waMessages.length === 0 && !waError && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '20px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>💬</div>
                  <p>Sin mensajes aún.</p>
                  <p style={{ fontSize: '0.72rem' }}>Envía el primer mensaje a {lead?.Nombre_Persona}.</p>
                </div>
              )}
              {waError && (
                <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.78rem', color: '#f87171', textAlign: 'center' }}>
                  ⚠️ {waError}
                </div>
              )}
              {waMessages.map((msg, i) => {
                const ts = msg.createdAt || msg.sentAt || msg.date || msg.timestamp;
                const text = msg.message || msg.body || msg.text || '';
                const isOut = msg.fromMe !== false; // treat sent msgs as outgoing
                return (
                  <div key={msg.id || i} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%',
                      background: isOut ? '#005c4b' : 'var(--s2)',
                      color: isOut ? '#e9edef' : 'var(--text)',
                      padding: '8px 12px',
                      borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.83rem',
                      lineHeight: '1.5',
                      wordBreak: 'break-word'
                    }}>
                      <div>{text}</div>
                      {ts && (
                        <div style={{ fontSize: '0.65rem', color: isOut ? 'rgba(233,237,239,.55)' : 'var(--muted)', textAlign: 'right', marginTop: '4px' }}>
                          {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions (Predefined msgs) */}
            <div style={{ padding: '8px 12px', background: 'var(--s1)', borderTop: '1px solid var(--brd)', display: 'flex', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
               {predefs.map((p, idx) => {
                 const isObj = typeof p === 'object' && p !== null;
                 const title = isObj ? p.title || p.text?.substring(0, 15) : p;
                 const text =  isObj ? p.text : p;
                 return (
                   <button 
                     key={idx} 
                     onClick={() => setWaMsg(text)}
                     title={text}
                     style={{ background: 'var(--s2)', border: '1px solid var(--brd)', borderRadius: '12px', padding: '5px 12px', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                   >
                     {title}
                   </button>
                 );
               })}
            </div>

            {/* Input area */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--brd)', background: 'var(--s2)', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
              <textarea
                value={waMsg}
                onChange={e => setWaMsg(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWaMessage(); } }}
                placeholder={`Mensaje para ${lead?.Nombre_Persona || 'contacto'}…`}
                rows={1}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: '#ffffff',
                  border: '1px solid var(--brd)',
                  borderRadius: '20px',
                  padding: '10px 16px',
                  color: '#000000',
                  fontSize: '0.85rem',
                  outline: 'none',
                  lineHeight: '1.4',
                  maxHeight: '100px',
                  overflowY: 'auto',
                  fontFamily: 'inherit'
                }}
              />
              <button
                onClick={sendWaMessage}
                disabled={waSending || !waMsg.trim()}
                style={{
                  width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                  background: waSending || !waMsg.trim() ? 'var(--brd)' : '#25d366',
                  border: 'none', cursor: waSending || !waMsg.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.1rem', transition: 'background .2s'
                }}
                title="Enviar (Enter)"
              >
                {waSending ? '⏳' : '➤'}
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
