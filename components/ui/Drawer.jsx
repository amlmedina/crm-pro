'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Drawer({ open, onClose, lead, leads, setLeads, tab, setTab, cfg, user, refreshLeads, isCensored, drawerQueue = [], drawerQueueIdx = -1, onAdvanceQueue, drawerQueueStageName = '' }) {
  const [f, setF] = useState({});
  const [cfs, setCfs] = useState({});
  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [notas, setNotas] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [toast, setToast] = useState(null); // { msg, type: 'ok'|'err' }
  const notasRef = useRef(null);
  const histContactRef = useRef(null); // Tracks the current contact to cancel stale history loads

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (user.rol === 'Gerente' || user.rol === 'Administrador') {
      api('getUsuarios').then(res => setUsersList(res)).catch(() => {});
    }
  }, [user]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) {
        if (!Swal.isVisible()) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ── WhatsApp State ──────────────────────────────────────
  const [waMessages, setWaMessages]   = useState([]);
  const [waLoadingHist, setWaLoadingHist] = useState(false);
  const [waMsg, setWaMsg]             = useState('');
  const [waSending, setWaSending]     = useState(false);
  const [waError, setWaError]         = useState('');
  const waChatRef = useRef(null);

  async function loadWaHistory(phone, lid) {
    if (!phone && !lid) return;
    setWaLoadingHist(true);
    setWaError('');
    try {
      const identifiers = [phone, lid].filter(Boolean).join(',');
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history', to: identifiers })
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
    // Prefer LID if available, otherwise use Telefono
    const target = lead?.LID || lead?.Telefono;
    if (!target) return;
    
    setWaSending(true);
    setWaError('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', to: target, message: waMsg.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || 'No se pudo enviar el mensaje');
      } else {
        // Optimistic update
        const newMsg = {
          id: Date.now(),
          to: target,
          message: waMsg.trim(),
          createdAt: new Date().toISOString(),
          status: 'sent',
          fromMe: true
        };
        setWaMessages(prev => [...prev, newMsg]);
        setWaMsg('');
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
    if (tab === 'wa' && (lead?.Telefono || lead?.LID)) {
      loadWaHistory(lead.Telefono, lead.LID);
      // Marcar como leídos
      const identifiers = [lead.Telefono, lead.LID].filter(Boolean).join(',');
      fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all', to: identifiers })
      }).catch(() => {});
    }
  }, [tab, lead]);

  // Auto-polling cada 8s cuando el tab WhatsApp está activo
  useEffect(() => {
    if (tab !== 'wa' || (!lead?.Telefono && !lead?.LID)) return;
    const interval = setInterval(() => {
      loadWaHistory(lead.Telefono, lead.LID);
      const identifiers = [lead.Telefono, lead.LID].filter(Boolean).join(',');
      fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all', to: identifiers })
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [tab, lead]);
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  async function mergeVirtualLead() {
     const options = {};
     leads.filter(l => !l.isUnknown && l.Nombre_Persona).forEach(l => {
       options[l.ID_Contacto] = `${l.Nombre_Persona} (${l.Nombre_Empresa || 'Sin empresa'}) - ${l.Telefono || 'Sin Tel'}`;
     });

     const { value: selectedId } = await Swal.fire({
       title: 'Vincular Contacto',
       text: 'Selecciona el lead existente al cual asignar este número / LID.',
       input: 'select',
       inputOptions: options,
       inputPlaceholder: '— Selecciona un Contacto —',
       showCancelButton: true,
       confirmButtonText: 'Vincular',
       cancelButtonText: 'Cancelar'
     });

     if (selectedId) {
        const targetLead = leads.find(l => String(l.ID_Contacto) === String(selectedId));
        if (targetLead) {
           console.log("[DEBUG-MERGE] Target Lead Antes:", JSON.stringify(targetLead));
           const backupLid = targetLead.LID;
           
           // State-safe update
           const updatedLead = { ...targetLead, LID: lead.Telefono };
           updatedLead.Notas = (updatedLead.Notas || '') + `\n[Sistema] Contacto vinculado con LID: ${lead.Telefono}${backupLid ? ` (LID anterior: ${backupLid})` : ''}`;
           
           console.log("[DEBUG-MERGE] Proyectado para Guardar:", JSON.stringify(updatedLead));
           
           setLoading(true);
           try {
              const res = await api('saveProfile', { perfil: updatedLead, userId: user.id });
              console.log("[DEBUG-MERGE] Respuesta de API:", JSON.stringify(res));

              // No need to merge chats physically if we "mix" them in the UI,
              // but we keep the redundant merge_chats call just in case or for legacy data.
              if (backupLid) {
                 await fetch('/api/whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'merge_chats', from_phone: backupLid, to_phone: lead.Telefono })
                 }).catch(() => {});
              }

              await refreshLeads();
              onClose();
              Swal.fire('Vinculado', 'El ID de WhatsApp ha sido enlazado a este cliente sin reemplazar su teléfono.', 'success');
           } catch {
              Swal.fire('Error', 'No se pudo vincular en la base de datos.', 'error');
           }
           setLoading(false);
        }
     }
  }
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
          Telefono: lead.Telefono || '',
          LID: lead.LID || '',
          Correo_Corp: lead.Correo_Corp || '',
          Cumpleanos: lead.Cumpleanos || '',
          Estado_Funnel: lead.Estado_Funnel || (cfg.funnel?.[0]?.stage || ''),
          Agente_Asignado: lead.Agente_Asignado || ''
        });
        
        const cfsData = {};
        (cfg.camposPersonalizados || []).forEach(c => {
          cfsData[c.key] = lead[c.key] || '';
        });
        setCfs(cfsData);
        
        setHist([]); // Clear old history to prevent mixup
        histContactRef.current = lead.ID_Contacto;
        loadHistorial(lead.ID_Contacto);
      } else {
        // Nuevo Lead
        setF({
          Nombre_Persona: '', Telefono: '', LID: '', Correo_Corp: '',
          Cumpleanos: '', Estado_Funnel: cfg.funnel?.[0]?.stage || '',
          Agente_Asignado: user.rol === 'Agente' ? user.nombre : ''
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
      // Only apply if this contact is still the active one (prevents race conditions)
      if (histContactRef.current === id) {
        setHist(res || []);
      }
    } catch {
      if (histContactRef.current === id) setHist([]);
    }
    if (histContactRef.current === id) setLoadingHist(false);
  }

  function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  async function doSavePerfil() {
    if (!f.Nombre_Persona) return Swal.fire('Requerido', 'El nombre es obligatorio', 'warning');
    setLoading(true);
    try {
      const cleanPhone = String(f.Telefono || '').replace(/[\s\-\+\(\)]/g, '');
      const titleName = toTitleCase(f.Nombre_Persona);
      
      const perfil = { 
        ID_Contacto: lead?.ID_Contacto, 
        ...f, 
        Nombre_Persona: titleName,
        Telefono: cleanPhone,
        ...cfs 
      };
      
      // Update local state to reflect UI changes immediately
      setF(prev => ({ ...prev, Nombre_Persona: titleName, Telefono: cleanPhone }));

      await api('saveProfile', { perfil, userId: user.id });

      if (lead?.ID_Contacto) {
        // Optimistic update for existing contacts to avoid backend cache delays
        if (setLeads) {
          setLeads(prev => prev.map(l => l.ID_Contacto === lead.ID_Contacto ? { ...l, ...perfil } : l));
        }
        Swal.fire({ title: '✅ Guardado', icon: 'success', timer: 1500, showConfirmButton: false });
      } else {
        // For new contacts, we must refresh to get the generated ID_Contacto
        await refreshLeads();
        Swal.fire({ title: '✅ Creado', icon: 'success', timer: 1500, showConfirmButton: false });
        onClose();
      }
    } catch {
      Swal.fire('Error', 'No se pudo guardar', 'error');
    }
    setLoading(false);
  }

  async function doSaveInt() {
    if (!lead?.ID_Contacto) { showToast('Guarda el perfil primero', 'err'); return; }
    if (!notas.trim()) { showToast('Escribe una nota primero', 'err'); return; }
    
    const nuevoE = f.Estado_Funnel;
    const savedNotas = notas;
    const savedLead = lead;

    // 1. Immediately update UI: clear notes, update local history, advance to next in queue
    setHist(prev => [{ Fecha_Hora: new Date().toISOString(), Estado_Momento: nuevoE, Notas: savedNotas, ID_Usuario: user.nombre }, ...prev]);
    setNotas('');

    // 2. Optimistic local update of leads state (no full reload)
    if (setLeads) {
      setLeads(prev => prev.map(l =>
        l.ID_Contacto === savedLead.ID_Contacto
          ? { ...l, Estado_Funnel: nuevoE, Ultima_Interaccion: new Date().toISOString() }
          : l
      ));
    }

    // 3. Auto-advance to next lead in queue (if in Funnel queue mode)
    if (drawerQueue.length > 0 && onAdvanceQueue) {
      const nextIdx = drawerQueueIdx + 1;
      const nextLead = drawerQueue[nextIdx];
      if (nextLead) {
        showToast(`✅ Guardado • Abriendo ${nextLead.Nombre_Persona || 'siguiente'}...`);
        setTimeout(() => {
          onAdvanceQueue(nextLead, nextIdx);
          if (notasRef.current) notasRef.current.focus();
        }, 120);
      } else {
        const colName = drawerQueueStageName ? ` la columna ${drawerQueueStageName}` : 'la lista';
        showToast(`✅ Último contacto de ${colName} registrado`);
      }
    } else {
      showToast('✅ Interacción registrada');
      if (notasRef.current) notasRef.current.focus();
    }

    // 4. Persist to backend in background (non-blocking)
    try {
      await api('saveInteraction', { idContacto: savedLead.ID_Contacto, nuevoEstado: nuevoE, notas: savedNotas, nombreUsuario: user.nombre });
      loadHistorial(savedLead.ID_Contacto);
    } catch {
      showToast('Error sincronizando con el servidor', 'err');
    }
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
            <div id="drtitle">{(isCensored && isCensored('Nombre_Persona') && lead) ? '••••••••••' : (lead?.Nombre_Persona || 'Nuevo Lead')}</div>
            <div id="drsub">{(isCensored && isCensored('Nombre_Empresa') && lead) ? '••••••••••' : (lead?.Nombre_Empresa || 'Completa el perfil')}</div>
          </div>
          <button className="btnx" onClick={onClose}>✕</button>
        </div>
        
        <div id="drbody">
          <div className="dtabs">
            <button className={`dtab ${tab === 'perfil' ? 'on' : ''}`} onClick={() => setTab('perfil')}>Perfil</button>
            <button className={`dtab ${tab === 'int' ? 'on' : ''}`} onClick={() => { setTab('int'); setTimeout(() => notasRef.current?.focus(), 80); }}>Interacción 360°</button>
            {(lead?.Telefono || lead?.LID) && (
              <button className={`dtab ${tab === 'wa' ? 'on' : ''}`} onClick={() => setTab('wa')} style={{ color: tab === 'wa' ? '#25d366' : undefined }}>
                💬 WhatsApp
              </button>
            )}
          </div>

          <div className={`dpanel ${tab === 'perfil' ? 'on' : ''}`}>
             
             {lead?.isUnknown && (
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--s2)', borderRadius: '8px', border: '1px dashed var(--brd)' }}>
                   <p className="stitle" style={{margin: '0 0 8px 0'}}>👤 Contacto Virtual (No guardado)</p>
                   <p style={{fontSize:'0.85rem', color:'var(--text2)', marginBottom:'16px'}}>Este usuario se comunicó por WhatsApp pero no está registrado en tu CRM.</p>
                   
                   <button className="btn bb" onClick={mergeVirtualLead} disabled={loading} style={{width:'100%', marginBottom: '10px'}}>
                     🔗 Enlazar a un prospecto o cliente existente
                   </button>
                   <div style={{textAlign:'center', fontSize:'0.75rem', color:'var(--text2)', marginBottom: '10px'}}>O registra sus datos aquí abajo y guarda los cambios para crearlo.</div>
                </div>
             )}

             <p className="stitle">Datos de Contacto</p>
             <div className="fgrid">
                <div className="fg full"><label>Nombre</label>
                  {(isCensored && isCensored('Nombre_Persona') && lead) ? <input type="text" className="inp" value="••••••••••" disabled /> : <input type="text" className="inp" value={f.Nombre_Persona || ''} onChange={e => setF({...f, Nombre_Persona: e.target.value})} />}
                </div>
                <div className="fg"><label>Teléfono</label>
                  {(isCensored && isCensored('Telefono') && lead) ? <input type="text" className="inp" value="••••••••••" disabled /> : <input type="tel" className="inp" value={f.Telefono || ''} onChange={e => setF({...f, Telefono: e.target.value})} />}
                </div>
                <div className="fg"><label>🎂 Cumpleaños (MM-DD)</label>
                  <input type="text" className="inp" placeholder="05-20" maxLength={5} value={f.Cumpleanos || ''} onChange={e => setF({...f, Cumpleanos: e.target.value})} />
                </div>
                <div className="fg"><label style={{color: '#2563eb', fontWeight: '800'}}>LID (WhatsApp ID) ✨ NUEVO </label>
                  <input type="text" className="inp" value={f.LID || ''} onChange={e => setF({...f, LID: e.target.value})} />
                </div>
                {(user.rol === 'Gerente' || user.rol === 'Administrador') && (
                  <div className="fg">
                    <label>Asignado A (Agente)</label>
                    <select className="inp" value={f.Agente_Asignado || ''} onChange={e => setF({...f, Agente_Asignado: e.target.value})}>
                      <option value="">Sin Asignar</option>
                      {usersList.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div className="fg full">
                   <label>Correo Electrónico</label>
                   <div style={{display:'flex', gap:'6px'}}>
                     {(isCensored && isCensored('Correo_Corp') && lead) ? <input type="text" className="inp" style={{flex:1}} value="••••••••••" disabled /> : <input type="email" className="inp" style={{flex:1}} value={f.Correo_Corp || ''} onChange={e => setF({...f, Correo_Corp: e.target.value})} />}
                     <button className="btn btnda" onClick={copyEmail} style={{padding:'0 12px', fontSize:'0.75rem'}} disabled={isCensored && isCensored('Correo_Corp') && lead}>📋 Copiar</button>
                   </div>
                </div>
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
                          <select className="inp" value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} disabled={isCensored && isCensored(c.key) && lead}>
                            <option value="">—</option>
                            {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : c.tipo === 'bool' ? (
                          <select className="inp" value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} disabled={isCensored && isCensored(c.key) && lead}>
                            <option value="">—</option><option value="Sí">Sí</option><option value="No">No</option>
                          </select>
                        ) : (
                          (isCensored && isCensored(c.key) && lead) ? <input type="text" className="inp" value="••••••••••" disabled /> : <input type={c.tipo==='numero'?'number':c.tipo==='fecha'?'date':'text'} className="inp" value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} />
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
            
            {/* 1. SECCIÓN SUPERIOR: Datos 360° */}
            {(() => {
               const viewFields = cfg.view360Fields || ['Nombre_Persona', 'Telefono', 'Correo_Corp', 'Nombre_Empresa'];
               const defaultLabels = { Telefono: 'Teléfono', Correo_Corp: 'Correo', Nombre_Persona: 'Nombre', Nombre_Empresa: 'Empresa' };
               const getLabel = k => defaultLabels[k] || cfg.camposPersonalizados?.find(c => c.key === k)?.label || k;
               const getVal = k => {
                 if (isCensored && isCensored(k) && lead) return '••••••••••';
                 return f[k] || cfs[k] || '—';
               };
               
               return (
                 <div style={{ background: 'var(--s2)', border: '1px solid var(--brd)', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                     <p className="stitle" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--navy)' }}>Vista 360° - Datos del Contacto</p>
                     
                     {drawerQueue.length > 0 && onAdvanceQueue && (
                       <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                         <button 
                           className="btn btnda"
                           disabled={drawerQueueIdx <= 0} 
                           onClick={() => onAdvanceQueue(drawerQueue[drawerQueueIdx - 1], drawerQueueIdx - 1)}
                           style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                           title="Contacto anterior"
                         >
                           ◀ Anterior
                         </button>
                         <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700 }}>
                           {drawerQueueIdx + 1} / {drawerQueue.length}
                         </span>
                         <button 
                           className="btn btnda"
                           disabled={drawerQueueIdx >= drawerQueue.length - 1} 
                           onClick={() => onAdvanceQueue(drawerQueue[drawerQueueIdx + 1], drawerQueueIdx + 1)}
                           style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                           title="Siguiente contacto"
                         >
                           Siguiente ▶
                         </button>
                       </div>
                     )}
                   </div>
                   
                   <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                     {viewFields.map(k => (
                       <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                         <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>{getLabel(k)}</span>
                         <span style={{ fontSize: '0.85rem', color: 'var(--text)', fontFamily: 'var(--font-ibm-plex-mono), monospace', marginTop: '2px', wordBreak: 'break-word' }}>{getVal(k)}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               );
            })()}

            {/* 2. SECCIÓN CENTRAL: Acción */}
            <div style={{ background: 'var(--s1)', border: '1px solid var(--brd)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <p className="stitle" style={{ margin: '0 0 10px 0' }}>Registrar Interacción</p>
              <div className="fg" style={{ marginBottom: '10px' }}>
                <label style={{ marginBottom: '6px', display: 'block' }}>Estado</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {cfg.funnel?.map(x => (
                    <button
                      key={x.stage}
                      onClick={() => setF({ ...f, Estado_Funnel: x.stage })}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        border: `2px solid ${f.Estado_Funnel === x.stage ? 'var(--navy)' : 'var(--brd)'}`,
                        background: f.Estado_Funnel === x.stage ? 'var(--navy)' : 'var(--s2)',
                        color: f.Estado_Funnel === x.stage ? '#fff' : 'var(--text)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: f.Estado_Funnel === x.stage ? 700 : 400,
                        transition: 'all 0.15s'
                      }}
                    >
                      {x.stage}
                    </button>
                  ))}
                  <button
                    onClick={() => setF({ ...f, Estado_Funnel: 'Congelado' })}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      border: `2px solid ${f.Estado_Funnel === 'Congelado' ? '#93c5fd' : 'var(--brd)'}`,
                      background: f.Estado_Funnel === 'Congelado' ? '#1d4ed8' : 'var(--s2)',
                      color: f.Estado_Funnel === 'Congelado' ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: f.Estado_Funnel === 'Congelado' ? 700 : 400,
                      transition: 'all 0.15s'
                    }}
                  >
                    ❄️ Congelado
                  </button>
                </div>
              </div>

              <div className="fg">
                <label style={{ marginBottom: '6px', display: 'block' }}>Notas <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.75rem' }}>· Cmd/Ctrl+Enter para guardar</span></label>
                <textarea
                  ref={notasRef}
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="¿Qué pasó en este contacto?"
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      doSaveInt();
                    }
                  }}
                />
              </div>

              <button
                className="btn btny btnw"
                style={{ marginTop: '10px', opacity: loading ? 0.6 : 1 }}
                onClick={doSaveInt}
                disabled={loading}
              >
                {loading ? 'Registrando...' : '⚡ Registrar'}
              </button>
            </div>

            {/* 3. SECCIÓN INFERIOR: Historial */}
            <div>
               <p className="stitle" style={{ marginBottom: '10px' }}>Historial de Interacciones</p>
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
          </div>

          {/* WhatsApp Chat Panel */}
          <div className={`dpanel ${tab === 'wa' ? 'on' : ''}`} style={{ display: tab === 'wa' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--brd)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--s2)', flexWrap: 'wrap' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>💬</div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{lead?.Nombre_Persona || 'Contacto'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{lead?.LID || lead?.Telefono}</div>
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
                  onClick={() => loadWaHistory(lead?.Telefono, lead?.LID)}
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

      {/* iPhone-style Toast */}
      <div style={{
        position: 'fixed',
        bottom: '32px',
        right: '24px',
        zIndex: 99999,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px'
      }}>
        {toast && (
          <div style={{
            background: toast.type === 'err' ? 'rgba(239,68,68,0.92)' : 'rgba(17,24,39,0.88)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '14px',
            fontSize: '0.88rem',
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            animation: 'toastIn 0.25s ease',
            whiteSpace: 'nowrap'
          }}>
            {toast.msg}
          </div>
        )}
      </div>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
