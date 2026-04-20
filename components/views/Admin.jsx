'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Admin({ cfg, setCfg }) {
  const [opcionesTomador, setOpcionesTomador] = useState('');
  const [opcionesTamano, setOpcionesTamano] = useState('');
  const [funnel, setFunnel] = useState([]);
  const [campos, setCampos] = useState([]);
  const [enableDlp, setEnableDlp] = useState(true);
  const [waPredefs, setWaPredefs] = useState([]);

  // Users state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // WhatsApp / MiBot state
  const [waStatus, setWaStatus] = useState(null);  // null = sin verificar
  const [waLoading, setWaLoading] = useState(false);
  const [waQr, setWaQr] = useState(null);
  const [waQrLoading, setWaQrLoading] = useState(false);
  const [waQrError, setWaQrError] = useState('');
  const [waApiKey, setWaApiKey] = useState('');

  useEffect(() => {
    if (cfg) {
      setOpcionesTomador(cfg.opcionesTomador?.join(', ') || '');
      setOpcionesTamano(cfg.opcionesTamano?.join(', ') || '');
      setFunnel(cfg.funnel || []);
      setCampos(cfg.camposPersonalizados || []);
      setEnableDlp(cfg.enableDlp !== undefined ? cfg.enableDlp : true);
      const loadedPredefs = cfg.wa_predefs || [
        {title: "Saludo", text: "Hola, ¿cómo estás?"},
        {title: "Seguimiento", text: "Me comunico para dar seguimiento"},
        {title: "Info", text: "Te comparto la información"},
        {title: "Llamada", text: "¿Tendrás disponibilidad para una llamada?"},
        {title: "Despedida", text: "¡Gracias por tu interés!"}
      ];
      setWaPredefs(loadedPredefs.map(p => typeof p === 'string' ? { title: p.substring(0, 15), text: p } : p));
    }
    loadUsers();
    loadWaStatus();
  }, [cfg]);

  async function waFetch(action, extra = {}) {
    const res = await fetch('/api/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra })
    });
    return res.json();
  }

  async function loadWaStatus() {
    setWaLoading(true);
    const data = await waFetch('status').catch(() => ({ connected: false, error: 'Sin respuesta' }));
    setWaStatus(data);
    setWaLoading(false);
  }

  async function loadQr() {
    setWaQrLoading(true);
    setWaQrError('');
    setWaQr(null);
    const data = await waFetch('qr').catch(() => ({ error: 'Error de conexión' }));
    if (data.error) {
      setWaQrError(data.error);
    } else {
      setWaQr(data.qr);
    }
    // Si el qr tiene raw, mostrarlo para diagnóstico
    if (data.raw) console.info('[MiBot QR raw]', data.raw);
    setWaQrLoading(false);
  }

  async function doDisconnect() {
    const { isConfirmed } = await Swal.fire({
      title: '¿Desconectar WhatsApp?',
      text: 'Tendrás que volver a escanear el QR para reconectar.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, desconectar'
    });
    if (!isConfirmed) return;
    const data = await waFetch('disconnect').catch(() => ({ error: 'Error al desconectar' }));
    if (data.error) {
      Swal.fire('Error', data.error, 'error');
    } else {
      Swal.fire({ title: 'Desconectado', icon: 'success', timer: 1500, showConfirmButton: false });
      setWaStatus(null);
      setWaQr(null);
    }
  }

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const res = await api('getUsuarios');
      setUsers(res || []);
    } catch {
      // error handled in proxy
    }
    setLoadingUsers(false);
  }

  // Config Actions
  async function doSaveConfig() {
    const newCfg = {
      ...cfg,
      funnel: funnel.filter(f => f.stage.trim() !== ''),
      opcionesTomador: opcionesTomador.split(',').map(s => s.trim()).filter(Boolean),
      opcionesTamano: opcionesTamano.split(',').map(s => s.trim()).filter(Boolean),
      camposPersonalizados: campos,
      enableDlp: enableDlp,
      wa_predefs: waPredefs.filter(p => p.text?.trim() || p.title?.trim())
    };

    try {
      await api('saveConfig', { configData: newCfg });
      setCfg(newCfg);
      Swal.fire({ title: '✅ Configuración guardada', icon: 'success', timer: 1400, showConfirmButton: false });
    } catch {
      Swal.fire({ title: 'Error al guardar', icon: 'error' });
    }
  }

  function addStage() {
    setFunnel([...funnel, { stage: 'Nueva Etapa', limit: 0 }]);
  }
  function updateStage(index, field, value) {
    const f = [...funnel];
    f[index][field] = value;
    setFunnel(f);
  }
  function rmStage(index) {
    if (funnel.length <= 1) return Swal.fire({ title: 'Mínimo 1 etapa', icon: 'info' });
    const f = [...funnel];
    f.splice(index, 1);
    setFunnel(f);
  }

  // Campos render and add
  const [cfLabel, setCfLabel] = useState('');
  const [cfTipo, setCfTipo] = useState('texto');
  const [cfOpts, setCfOpts] = useState('');

  async function addCF() {
    if (!cfLabel.trim()) return Swal.fire({ title: 'Nombre requerido', icon: 'warning' });
    const key = 'cf_' + cfLabel.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    if (campos.some(c => c.key === key)) return Swal.fire({ title: 'El campo ya existe', icon: 'info' });
    
    const opciones = cfTipo === 'select' ? cfOpts.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (cfTipo === 'select' && opciones.length < 2) return Swal.fire({ title: 'Mínimo 2 opciones', icon: 'warning' });
    
    const newCampos = [...campos, { key, label: cfLabel, tipo: cfTipo, opciones }];
    try {
      await api('saveConfig', { configData: { ...cfg, camposPersonalizados: newCampos } });
      await api('addDirectoryColumn', { columnKey: key });
      setCampos(newCampos);
      setCfg({ ...cfg, camposPersonalizados: newCampos });
      setCfLabel(''); setCfTipo('texto'); setCfOpts('');
      Swal.fire({ title: 'Campo creado', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'No se pudo crear el campo remoto', 'error');
    }
  }

  async function rmCF(index) {
    const c = campos[index];
    const { isConfirmed } = await Swal.fire({
      title: '¿Eliminar "' + c.label + '"?', 
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar'
    });
    if (!isConfirmed) return;

    const newCampos = [...campos];
    newCampos.splice(index, 1);
    setCampos(newCampos);
    await api('saveConfig', { configData: { ...cfg, camposPersonalizados: newCampos } });
    setCfg({ ...cfg, camposPersonalizados: newCampos });
  }

  // User Actions
  const [uForm, setUform] = useState({ nombre: '', correo: '', telefono: '', rol: 'Agente', password: '' });
  
  async function doCreateUser() {
    if (!uForm.nombre || !uForm.correo || !uForm.password) return Swal.fire('Incompleto', 'Faltan campos', 'warning');
    if (uForm.password.length < 6) return Swal.fire('Error', 'Mínimo 6 caracteres en la clave', 'warning');
    try {
      await api('createUser', uForm);
      Swal.fire('✅ Creado', 'Usuario generado', 'success');
      setUform({ nombre: '', correo: '', telefono: '', rol: 'Agente', password: '' });
      loadUsers();
    } catch {
      Swal.fire('Error', 'No se pudo crear', 'error');
    }
  }

  async function doResetPass(uid, uname) {
    const { value: np } = await Swal.fire({
        title: 'Restablecer contraseña',
        html: `<p>Usuario: <strong>${uname}</strong></p><input id="sp" type="password" class="swal2-input" placeholder="Nueva (mín 6)">`,
        preConfirm: () => document.getElementById('sp').value
    });
    if (np && np.length >= 6) {
        try {
          await api('resetPassword', { userId: uid, newPassword: np });
          Swal.fire('✅ Restablecida', '', 'success');
        } catch {
          Swal.fire('Error', '', 'error');
        }
    }
  }

  return (
    <div className="view on" id="vadmin" style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* ── WhatsApp / MiBot Config ───────────────────────────────── */}
      <div className="acard" style={{ borderLeft: '4px solid #25d366' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>💬</div>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>Conexión WhatsApp — MiBot WA</h3>
              <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--muted)' }}>Escanea el QR con tu WhatsApp para activar el módulo de mensajería.</p>
            </div>
          </div>
          {/* Estado badge */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {waLoading ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Verificando…</span>
            ) : waStatus === null ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Sin verificar</span>
            ) : waStatus.connected || waStatus.status === 'connected' || waStatus.state === 'open' ? (
              <span className="badge bg" style={{ fontSize: '0.75rem' }}>✅ Conectado</span>
            ) : (
              <span className="badge br" style={{ fontSize: '0.75rem' }}>⚠️ Desconectado</span>
            )}
            <button className="btn btngh" style={{ padding: '5px 10px', fontSize: '0.74rem' }} onClick={loadWaStatus} disabled={waLoading}>
              🔄 Verificar
            </button>
            {(waStatus?.connected || waStatus?.status === 'connected' || waStatus?.state === 'open') && (
              <button className="btn btndel" style={{ padding: '5px 10px', fontSize: '0.74rem' }} onClick={doDisconnect}>
                Desconectar
              </button>
            )}
          </div>
        </div>

        {/* Detalle de estado si está conectado */}
        {(waStatus?.connected || waStatus?.status === 'connected') && waStatus?.phone && (
          <div style={{ background: 'rgba(37,211,102,.08)', border: '1px solid rgba(37,211,102,.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.8rem', color: '#25d366', marginBottom: '16px' }}>
            📱 Número activo: <strong>{waStatus.phone}</strong>
          </div>
        )}

        {/* Panel QR */}
        {!(waStatus?.connected || waStatus?.status === 'connected' || waStatus?.state === 'open') && (
          <div style={{ borderTop: '1px solid var(--brd)', paddingTop: '16px' }}>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', marginBottom: '14px' }}>
              Para conectar tu WhatsApp: presiona <strong>Generar QR</strong>, luego abre WhatsApp en tu celular →
              Dispositivos vinculados → Vincular dispositivo → escanea el código.
            </p>
            <button
              className="btn btng"
              onClick={loadQr}
              disabled={waQrLoading}
              style={{ marginBottom: '16px' }}
            >
              {waQrLoading ? '⏳ Generando QR…' : '📷 Generar / Refrescar QR'}
            </button>

            {waQrError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.78rem', color: '#f87171', marginBottom: '12px' }}>
                ⚠️ {waQrError}
              </div>
            )}

            {waQr && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,.15)' }}>
                  {/* Si el QR es base64 o URL directa de imagen */}
                  {waQr.startsWith('data:image') || waQr.startsWith('http') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={waQr} alt="QR WhatsApp" style={{ width: 220, height: 220, display: 'block' }} />
                  ) : (
                    /* Si es un string de ASCII/texto QR, renderizamos en pre */
                    <pre style={{ fontFamily: 'monospace', fontSize: '6px', lineHeight: '8px', color: '#000', margin: 0 }}>{waQr}</pre>
                  )}
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', textAlign: 'center' }}>
                  El QR expira en ~60 segundos. Si venció, presiona <strong>Generar / Refrescar QR</strong>.
                </p>
                <button className="btn btngh" style={{ fontSize: '0.74rem', padding: '5px 12px' }} onClick={loadWaStatus}>
                  ✅ Ya escaneé el QR — Verificar conexión
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* DLP Security Toggle - Salesforce Style */}
      <div className="acard" style={{ borderLeft: '4px solid var(--blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
           <h3 style={{ marginBottom: '4px', fontSize: '0.86rem', color: 'var(--text)' }}>Protección Antifuga de Datos (DLP)</h3>
           <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>Habilita la marca de agua dinámica y el bloqueo anticopia para todos los agentes.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label className="switch" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', fontWeight: 700, color: enableDlp ? 'var(--green)' : 'var(--muted)' }}>
            {enableDlp ? 'Activado' : 'Apagado'}
            <input type="checkbox" checked={enableDlp} onChange={e => setEnableDlp(e.target.checked)} style={{ transform: 'scale(1.2)', cursor: 'pointer', accentColor: 'var(--navy)' }} />
          </label>
        </div>
      </div>

      <div className="acard">
        <h3>Gestión de Usuarios</h3>
        <div className="fgrid">
          <div className="fg"><label>Nombre Completo</label><input type="text" value={uForm.nombre} onChange={e=>setUform({...uForm, nombre: e.target.value})} /></div>
          <div className="fg"><label>Correo</label><input type="email" value={uForm.correo} onChange={e=>setUform({...uForm, correo: e.target.value})} /></div>
          <div className="fg"><label>Teléfono</label><input type="tel" value={uForm.telefono} onChange={e=>setUform({...uForm, telefono: e.target.value})} /></div>
          <div className="fg">
            <label>Rol</label>
            <select value={uForm.rol} onChange={e=>setUform({...uForm, rol: e.target.value})}>
              <option value="Agente">Agente — Solo sus leads</option>
              <option value="Gerente">Gerente — Acceso total</option>
            </select>
          </div>
          <div className="fg"><label>Clave Temporal</label><input type="password" value={uForm.password} onChange={e=>setUform({...uForm, password: e.target.value})} /></div>
          <div className="fg" style={{display:'flex', alignItems:'flex-end'}}>
            <button className="btn btng btnw" onClick={doCreateUser}>+ Crear Usuario</button>
          </div>
        </div>
        
        {loadingUsers ? <p style={{fontSize:'.8rem'}}>Cargando usuarios...</p> : (
          <table className="utbl" style={{marginTop:'20px'}}>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Acciones</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td><strong>{u.nombre}</strong></td>
                  <td>{u.correo}</td>
                  <td><span className={`badge ${u.rol==='Gerente'?'by':'bb'}`}>{u.rol}</span></td>
                  <td><button className="btn btnda" style={{padding:'4px 8px'}} onClick={() => doResetPass(u.id, u.nombre)}>🔑 Clave</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="acard">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
          <h3 style={{margin:0}}>Etapas del Funnel & SLA</h3>
          <button className="btn btnda" onClick={addStage}>+ Etapa</button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'1fr 70px 38px', gap:'10px', marginBottom:'8px'}}>
          <label style={{fontSize:'.67rem', color:'var(--muted)', fontWeight:700}}>Etapa</label>
          <label style={{fontSize:'.67rem', color:'var(--muted)', fontWeight:700, textAlign:'center'}}>Strikes</label>
        </div>
        {funnel.map((f, i) => (
          <div className="strow" key={i}>
            <input type="text" style={{flex:1}} value={f.stage} onChange={e => updateStage(i, 'stage', e.target.value)} />
            <input type="number" style={{width:'70px', textAlign:'center'}} value={f.limit} onChange={e => updateStage(i, 'limit', parseInt(e.target.value)||0)} />
            <button className="btn btndel" onClick={() => rmStage(i)}>✕</button>
          </div>
        ))}
      </div>

      <div className="acard">
        <h3>Catálogos de Selección</h3>
        <div className="fg"><label>Tomadores de Decisión (comas)</label><input type="text" value={opcionesTomador} onChange={e => setOpcionesTomador(e.target.value)} /></div>
        <div className="fg"><label>Tamaños de Org. (comas)</label><input type="text" value={opcionesTamano} onChange={e => setOpcionesTamano(e.target.value)} /></div>
      </div>

      <div className="acard">
        <h3>Campos Personalizados (Formulario)</h3>
        <div className="cfrow">
          <input type="text" placeholder="Ej: Fuente..." value={cfLabel} onChange={e => setCfLabel(e.target.value)} />
          <select value={cfTipo} onChange={e => setCfTipo(e.target.value)}>
             <option value="texto">Texto</option>
             <option value="numero">Número</option>
             <option value="select">Lista (Opciones)</option>
             <option value="fecha">Fecha</option>
             <option value="bool">Sí / No</option>
          </select>
          <input type="text" placeholder="Op1, Op2..." value={cfOpts} onChange={e => setCfOpts(e.target.value)} disabled={cfTipo !== 'select'} style={{opacity: cfTipo === 'select' ? 1 : 0.5}} />
          <button className="btn btng" onClick={addCF}>+</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '14px' }}>
          {campos.map((c, i) => (
            <span className="chip" key={i}>
              {c.label} <span className="ct">{c.tipo}</span>
              <button onClick={() => rmCF(i)}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div className="acard">
        <h3>Respuestas Rápidas (WhatsApp)</h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '10px' }}>Cada recuadro es un mensaje predefinido individual. Aparecerán como botones inyectables en los chats.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {waPredefs.map((obj, idx) => (
            <div key={idx} style={{ display: 'flex', gap: '8px', background: 'var(--s2)', padding: '10px', borderRadius: '6px', border: '1px solid var(--brd)' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <input 
                  type="text" 
                  value={obj.title || ''} 
                  onChange={e => {
                    const np = [...waPredefs];
                    np[idx] = { ...np[idx], title: e.target.value };
                    setWaPredefs(np);
                  }} 
                  placeholder="Título corto del botón (Ej: Saludo)"
                  style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--brd)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}
                />
                <textarea 
                  value={obj.text || ''} 
                  onChange={e => {
                    const np = [...waPredefs];
                    np[idx] = { ...np[idx], text: e.target.value };
                    setWaPredefs(np);
                  }} 
                  placeholder="Escribe el mensaje completo a inyectar..."
                  style={{ minHeight: '60px', padding: '8px', borderRadius: '4px', border: '1px solid var(--brd)', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
              <button 
                className="btn btndel" 
                onClick={() => setWaPredefs(waPredefs.filter((_, i) => i !== idx))}
                style={{ padding: '0 12px', height: 'fit-content' }}
              >✕</button>
            </div>
          ))}
          <button 
            className="btn btnda" 
            onClick={() => setWaPredefs([...waPredefs, { title: '', text: '' }])}
            style={{ width: 'fit-content' }}
          >+ Agregar Respuesta</button>
        </div>
      </div>

      <button className="btn btny btnw" style={{marginBottom:'40px', padding:'12px'}} onClick={doSaveConfig}>
        💾 Guardar Configuración Global
      </button>

    </div>
  );
}
