'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';
import { THEMES } from '@/lib/themes';

export default function Admin({ cfg, setCfg, currentTheme, changeTheme }) {
  const [adminTab, setAdminTab] = useState('usuarios');
  const [pipelineTab, setPipelineTab] = useState('etapas');
  const [funnel, setFunnel] = useState([]);
  const [campos, setCampos] = useState([]);
  const [enableDlp, setEnableDlp] = useState(true);
  const [censoredFields, setCensoredFields] = useState([]);
  const [view360Fields, setView360Fields] = useState([]);
  const [funnelCardFields, setFunnelCardFields] = useState([]);
  const [linkSearchFields, setLinkSearchFields] = useState([]);
  const [waPredefs, setWaPredefs] = useState([]);
  const [bdayDefaultMessage, setBdayDefaultMessage] = useState('');
  const [defaultTheme, setDefaultTheme] = useState('galaxia');

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
      setCensoredFields(cfg.censoredFields || []);
      setView360Fields(cfg.view360Fields || ['Nombre_Persona', 'Telefono', 'Correo_Corp', 'Nombre_Empresa']);
      setFunnelCardFields(cfg.funnelCardFields || ['Telefono', 'Nombre_Empresa']);
      setLinkSearchFields(cfg.linkSearchFields || ['Nombre_Persona', 'Telefono', 'Correo_Corp', 'Nombre_Empresa']);
      setBdayDefaultMessage(cfg.bdayDefaultMessage || '¡Hola {Nombre_Persona}! 🎉 Hoy es tu día especial. De parte de todo el equipo, te deseamos un feliz cumpleaños. ¡Que lo disfrutes mucho!');
      setDefaultTheme(cfg.defaultTheme || 'galaxia');
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
      camposPersonalizados: campos,
      enableDlp: enableDlp,
      censoredFields: censoredFields,
      view360Fields: view360Fields,
      funnelCardFields: funnelCardFields,
      linkSearchFields: linkSearchFields,
      wa_predefs: waPredefs.filter(p => p.text?.trim() || p.title?.trim()),
      bdayDefaultMessage: bdayDefaultMessage.trim() || '¡Hola {Nombre_Persona}! 🎉 Hoy es tu día especial. ¡Feliz cumpleaños!',
      defaultTheme: defaultTheme
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
    setFunnel([...funnel, { stage: 'Nueva Etapa', limit: 0, type: 'activa' }]);
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

  async function doDeleteUser(uid, uname) {
    if (uid === user.id) return Swal.fire('Acción denegada', 'No puedes eliminar tu propio usuario', 'error');
    const { isConfirmed } = await Swal.fire({
      title: `¿Eliminar a ${uname}?`,
      text: 'No podrá volver a iniciar sesión.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!isConfirmed) return;
    try {
      await api('deleteUser', { userId: uid });
      Swal.fire('✅ Eliminado', '', 'success');
      loadUsers();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar el usuario', 'error');
    }
  }

  async function doEditUser(u) {
    const { value: formVals } = await Swal.fire({
      title: `Editar a ${u.nombre}`,
      html: `
        <div style="display:flex; flex-direction:column; gap:10px; text-align:left;">
          <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Nombre</label>
          <input id="eu_name" class="swal2-input" style="margin:0" value="${u.nombre}" />
          <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Correo</label>
          <input id="eu_email" class="swal2-input" style="margin:0" value="${u.correo}" />
          <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Teléfono</label>
          <input id="eu_tel" class="swal2-input" style="margin:0" value="${u.telefono || ''}" />
          <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Rol</label>
          <select id="eu_rol" class="swal2-select" style="margin:0">
            <option value="Agente" ${u.rol === 'Agente' ? 'selected' : ''}>Agente</option>
            <option value="Gerente" ${u.rol === 'Gerente' ? 'selected' : ''}>Gerente</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      preConfirm: () => {
        return {
          nombre: document.getElementById('eu_name').value,
          correo: document.getElementById('eu_email').value,
          telefono: document.getElementById('eu_tel').value,
          rol: document.getElementById('eu_rol').value,
        };
      }
    });

    if (formVals && formVals.nombre && formVals.correo) {
      if (u.id === user.id && formVals.rol !== 'Gerente') {
        return Swal.fire('Error', 'No puedes quitarte el rol de Gerente a ti mismo', 'error');
      }
      try {
        await api('updateUser', { userId: u.id, ...formVals });
        Swal.fire('✅ Actualizado', '', 'success');
        loadUsers();
      } catch {
        Swal.fire('Error', 'No se pudo actualizar', 'error');
      }
    }
  }

  return (
    <div className="view on" id="vadmin" style={{ maxWidth: '900px', margin: '0 auto' }}>

      {/* ── Tab Bar ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderBottom: '2px solid var(--brd)', marginBottom: '24px', paddingBottom: '2px' }}>
        {[['usuarios','👥 Usuarios'],['pipeline','🔀 Pipeline'],['whatsapp','💬 WhatsApp'],['privacidad','🔒 Privacidad'],['apariencia','🎨 Apariencia']].map(([id, label]) => (
          <button key={id} onClick={() => setAdminTab(id)} style={{ padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer', fontWeight: adminTab===id?700:500, fontSize: '0.82rem', background: adminTab===id?'var(--navy)':'var(--s2)', color: adminTab===id?'#fff':'var(--muted)', transition: 'all .15s' }}>{label}</button>
        ))}
      </div>

      {/* ══ WHATSAPP ════════════════════════════════════ */}
      {adminTab === 'whatsapp' && (
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

      )} {/* end whatsapp acard */}

      {/* ══ PRIVACIDAD ═════════════════════════════════ */}
      {adminTab === 'privacidad' && (
      <div className="acard" style={{ borderLeft: '4px solid var(--blue)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

        <div style={{ borderTop: '1px solid var(--brd)', paddingTop: '15px' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem' }}>Censura de Campos (Ocultar a Agentes)</h4>
          <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '15px' }}>Los campos seleccionados se mostrarán como •••••••••• para los asesores una vez que el contacto ha sido creado, evitando fugas de base de datos.</p>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
            {[
              { key: 'Telefono', label: 'Teléfono' },
              { key: 'Correo_Corp', label: 'Correo' },
              { key: 'Nombre_Persona', label: 'Nombre' },
              { key: 'Nombre_Empresa', label: 'Empresa' },
              ...(campos || []).map(c => ({ key: c.key, label: c.label }))
            ].map(f => (
              <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text)', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={censoredFields.includes(f.key)}
                  onChange={(e) => {
                    if (e.target.checked) setCensoredFields([...censoredFields, f.key]);
                    else setCensoredFields(censoredFields.filter(k => k !== f.key));
                  }}
                  style={{ accentColor: 'var(--navy)', transform: 'scale(1.1)' }}
                />
                {f.label}
              </label>
            ))}
          </div>
        </div>
      </div>
      )} {/* end privacidad */}

      {/* ══ USUARIOS ═════════════════════════════════ */}
      {adminTab === 'usuarios' && (
      <div className="acard">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ margin: 0 }}>Gestión de Usuarios</h3>
          <button
            className="btn btngh"
            style={{ fontSize: '0.72rem', padding: '4px 10px' }}
            onClick={async () => {
              try {
                const res = await api('getUsuarios');
                Swal.fire({
                  title: '🔍 Estructura de Usuarios (API)',
                  html: `<pre style="text-align:left;font-size:0.7rem;overflow:auto;max-height:300px">${JSON.stringify(res?.slice?.(0,3), null, 2)}</pre>`,
                  width: 700
                });
              } catch(e) {
                Swal.fire('Error', String(e), 'error');
              }
            }}
          >🔍 Ver estructura API</button>
        </div>
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
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button className="btn btngh" style={{padding:'4px 8px', fontSize: '0.75rem'}} onClick={() => doEditUser(u)}>✏️ Editar</button>
                      <button className="btn btnda" style={{padding:'4px 8px', fontSize: '0.75rem'}} onClick={() => doResetPass(u.id, u.nombre)}>🔑 Clave</button>
                      <button className="btn btndel" style={{padding:'4px 8px', fontSize: '0.75rem'}} onClick={() => doDeleteUser(u.id, u.nombre)}>✕ Borrar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )} {/* end usuarios acard */}

      {/* ══ PIPELINE ═════════════════════════════════════ */}
      {adminTab === 'pipeline' && <>

      {/* Pipeline sub-tabs */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '20px', background: 'var(--s2)', padding: '6px', borderRadius: '10px', border: '1px solid var(--brd)' }}>
        {[['etapas','🔀 Etapas'],['campos','📋 Campos'],['vista360','👁 Vista 360°'],['tarjetas','🃏 Tarjetas Kanban'],['vinculacion','🔗 Vinculación']].map(([id, label]) => (
          <button key={id} onClick={() => setPipelineTab(id)} style={{ padding: '7px 14px', borderRadius: '7px', border: 'none', cursor: 'pointer', fontWeight: pipelineTab===id?700:500, fontSize: '0.8rem', background: pipelineTab===id?'var(--navy)':'transparent', color: pipelineTab===id?'#fff':'var(--muted)', transition: 'all .15s', flex: '0 0 auto' }}>{label}</button>
        ))}
      </div>

      {pipelineTab === 'etapas' && (
      <div className="acard">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
          <h3 style={{margin:0}}>Etapas del Funnel</h3>
          <button className="btn btnda" onClick={addStage}>+ Etapa</button>
        </div>
        <div style={{display:'grid', gridTemplateColumns:'28px 2fr 1.2fr 38px', gap:'10px', marginBottom:'8px'}}>
          <div></div>
          <label style={{fontSize:'.67rem', color:'var(--muted)', fontWeight:700}}>Etapa (Nombre)</label>
          <label style={{fontSize:'.67rem', color:'var(--muted)', fontWeight:700}}>Tipo de Etapa</label>
        </div>
        {funnel.map((f, i) => (
          <div className="strow" key={i} style={{ display: 'grid', gridTemplateColumns: '28px 2fr 1.2fr 38px', gap: '10px', marginBottom: '6px', alignItems: 'center' }}>
            {/* Reorder handle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button
                onClick={() => {
                  if (i > 0) {
                    const next = [...funnel];
                    [next[i], next[i-1]] = [next[i-1], next[i]];
                    setFunnel(next);
                  }
                }}
                disabled={i === 0}
                title="Subir"
                style={{ padding: '1px 5px', fontSize: '0.6rem', lineHeight: 1, border: '1px solid var(--brd)', borderRadius: '3px', background: 'var(--s1)', color: 'var(--text)', cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.3 : 1 }}
              >▲</button>
              <button
                onClick={() => {
                  if (i < funnel.length - 1) {
                    const next = [...funnel];
                    [next[i], next[i+1]] = [next[i+1], next[i]];
                    setFunnel(next);
                  }
                }}
                disabled={i === funnel.length - 1}
                title="Bajar"
                style={{ padding: '1px 5px', fontSize: '0.6rem', lineHeight: 1, border: '1px solid var(--brd)', borderRadius: '3px', background: 'var(--s1)', color: 'var(--text)', cursor: i === funnel.length - 1 ? 'not-allowed' : 'pointer', opacity: i === funnel.length - 1 ? 0.3 : 1 }}
              >▼</button>
            </div>
            <input type="text" style={{width: '100%'}} value={f.stage} onChange={e => updateStage(i, 'stage', e.target.value)} />
            <select 
              value={f.type || 'activa'} 
              onChange={e => updateStage(i, 'type', e.target.value)}
              style={{
                background: 'var(--s2)', color: 'var(--text)', border: '1px solid var(--brd)',
                borderRadius: '6px', padding: '4px 8px', fontSize: '0.8rem', cursor: 'pointer', outline: 'none'
              }}
            >
              <option value="activa">⚙️ Activa / Seguimiento</option>
              <option value="ganada">🎉 Ganadora (Cierre)</option>
              <option value="perdida">❌ Perdida (Descartado)</option>
            </select>
            <button className="btn btndel" onClick={() => rmStage(i)}>✕</button>
          </div>
        ))}
      </div>
      )}

      {pipelineTab === 'campos' && (
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
      )}

      {pipelineTab === 'vista360' && (
      <div className="acard">
        <h3>Vista 360° (Pestaña Interacción)</h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '15px' }}>Selecciona los campos que deseas que aparezcan fijos en la parte superior del historial/interacción de un contacto para dar contexto rápido al asesor.</p>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', paddingBottom: '16px', borderBottom: '1px solid var(--brd)' }}>
          {[
            { key: 'Telefono', label: 'Teléfono' },
            { key: 'Correo_Corp', label: 'Correo' },
            { key: 'Nombre_Persona', label: 'Nombre' },
            { key: 'Nombre_Empresa', label: 'Empresa' },
            ...(campos || []).map(c => ({ key: c.key, label: c.label }))
          ].map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={view360Fields.includes(f.key)}
                onChange={(e) => {
                  if (e.target.checked) setView360Fields([...view360Fields, f.key]);
                  else setView360Fields(view360Fields.filter(k => k !== f.key));
                }}
                style={{ accentColor: 'var(--navy)', transform: 'scale(1.1)' }}
              />
              {f.label}
            </label>
          ))}
        </div>

        {view360Fields.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text)' }}>
              ↕️ Ordenar Campos de Visualización
            </h4>
            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '12px' }}>
              Utiliza las flechas para reordenar la posición en la que aparecerán los campos dentro de la Vista 360°.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '400px' }}>
              {view360Fields.map((fieldKey, idx) => {
                const allOpts = [
                  { key: 'Telefono', label: 'Teléfono' },
                  { key: 'Correo_Corp', label: 'Correo' },
                  { key: 'Nombre_Persona', label: 'Nombre' },
                  { key: 'Nombre_Empresa', label: 'Empresa' },
                  ...(campos || []).map(c => ({ key: c.key, label: c.label }))
                ];
                const label = allOpts.find(o => o.key === fieldKey)?.label || fieldKey;

                return (
                  <div key={fieldKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--brd)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => {
                          if (idx > 0) {
                            const newFields = [...view360Fields];
                            const tmp = newFields[idx];
                            newFields[idx] = newFields[idx - 1];
                            newFields[idx - 1] = tmp;
                            setView360Fields(newFields);
                          }
                        }}
                        disabled={idx === 0}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}
                        title="Subir"
                      >
                        ▲
                      </button>
                      <button 
                        onClick={() => {
                          if (idx < view360Fields.length - 1) {
                            const newFields = [...view360Fields];
                            const tmp = newFields[idx];
                            newFields[idx] = newFields[idx + 1];
                            newFields[idx + 1] = tmp;
                            setView360Fields(newFields);
                          }
                        }}
                        disabled={idx === view360Fields.length - 1}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', cursor: idx === view360Fields.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === view360Fields.length - 1 ? 0.4 : 1 }}
                        title="Bajar"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )}

      {pipelineTab === 'tarjetas' && (
      <div className="acard">
        <h3>🃏 Campos en Tarjetas del Kanban</h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '15px' }}>Selecciona los campos secundarios que deseas que aparezcan visibles directamente dentro de las tarjetas de leads del Funnel (tablero Kanban).</p>
        
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', paddingBottom: '16px', borderBottom: '1px solid var(--brd)' }}>
          {[
            { key: 'Telefono', label: 'Teléfono' },
            { key: 'Correo_Corp', label: 'Correo' },
            { key: 'Nombre_Empresa', label: 'Empresa' },
            { key: 'Cumpleanos', label: 'Cumpleaños' },
            { key: 'LID', label: 'LID (WhatsApp ID)' },
            ...(campos || []).map(c => ({ key: c.key, label: c.label }))
          ].map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text)', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={funnelCardFields.includes(f.key)}
                onChange={(e) => {
                  if (e.target.checked) setFunnelCardFields([...funnelCardFields, f.key]);
                  else setFunnelCardFields(funnelCardFields.filter(k => k !== f.key));
                }}
                style={{ accentColor: 'var(--navy)', transform: 'scale(1.1)' }}
              />
              {f.label}
            </label>
          ))}
        </div>

        {funnelCardFields.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text)' }}>
              ↕️ Ordenar Campos de las Tarjetas
            </h4>
            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '12px' }}>
              Utiliza las flechas para reordenar el orden de aparición de los datos en las tarjetas del tablero.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '400px' }}>
              {funnelCardFields.map((fieldKey, idx) => {
                const allOpts = [
                  { key: 'Telefono', label: 'Teléfono' },
                  { key: 'Correo_Corp', label: 'Correo' },
                  { key: 'Nombre_Empresa', label: 'Empresa' },
                  { key: 'Cumpleanos', label: 'Cumpleaños' },
                  { key: 'LID', label: 'LID (WhatsApp ID)' },
                  ...(campos || []).map(c => ({ key: c.key, label: c.label }))
                ];
                const label = allOpts.find(o => o.key === fieldKey)?.label || fieldKey;

                return (
                  <div key={fieldKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--brd)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => {
                          if (idx > 0) {
                            const newFields = [...funnelCardFields];
                            const tmp = newFields[idx];
                            newFields[idx] = newFields[idx - 1];
                            newFields[idx - 1] = tmp;
                            setFunnelCardFields(newFields);
                          }
                        }}
                        disabled={idx === 0}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }}
                        title="Subir"
                      >
                        ▲
                      </button>
                      <button 
                        onClick={() => {
                          if (idx < funnelCardFields.length - 1) {
                            const newFields = [...funnelCardFields];
                            const tmp = newFields[idx];
                            newFields[idx] = newFields[idx + 1];
                            newFields[idx + 1] = tmp;
                            setFunnelCardFields(newFields);
                          }
                        }}
                        disabled={idx === funnelCardFields.length - 1}
                        style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', cursor: idx === funnelCardFields.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === funnelCardFields.length - 1 ? 0.4 : 1 }}
                        title="Bajar"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )} {/* end tarjetas sub-tab */}

      {pipelineTab === 'vinculacion' && (
      <div className="acard">
        <h3>🔗 Campos en Buscador de Vinculación</h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '15px' }}>Selecciona qué campos aparecen como información secundaria al buscar un contacto para vincular con un desconocido de WhatsApp. Esto ayuda a identificar mejor al prospecto correcto.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px', paddingBottom: '16px' }}>
          {[
            { key: 'Nombre_Empresa', label: 'Empresa' },
            { key: 'Telefono', label: 'Teléfono' },
            { key: 'Correo_Corp', label: 'Correo' },
            { key: 'LID', label: 'LID (WhatsApp ID)' },
            { key: 'Estado_Funnel', label: 'Etapa del Funnel' },
            ...(campos || []).map(c => ({ key: c.key, label: c.label }))
          ].map(f => (
            <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={linkSearchFields.includes(f.key)}
                onChange={(e) => {
                  if (e.target.checked) setLinkSearchFields([...linkSearchFields, f.key]);
                  else setLinkSearchFields(linkSearchFields.filter(k => k !== f.key));
                }}
                style={{ accentColor: 'var(--navy)', transform: 'scale(1.1)' }}
              />
              {f.label}
            </label>
          ))}
        </div>

        {linkSearchFields.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text)' }}>↕️ Ordenar campos mostrados</h4>
            <p style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '12px' }}>El primer campo siempre es el nombre. Reordena los campos secundarios.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '400px' }}>
              {linkSearchFields.map((fieldKey, idx) => {
                const allOpts = [
                  { key: 'Nombre_Empresa', label: 'Empresa' },
                  { key: 'Telefono', label: 'Teléfono' },
                  { key: 'Correo_Corp', label: 'Correo' },
                  { key: 'LID', label: 'LID (WhatsApp ID)' },
                  { key: 'Estado_Funnel', label: 'Etapa del Funnel' },
                  ...(campos || []).map(c => ({ key: c.key, label: c.label }))
                ];
                const label = allOpts.find(o => o.key === fieldKey)?.label || fieldKey;
                return (
                  <div key={fieldKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s2)', padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--brd)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text)', fontWeight: 600 }}>{label}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => {
                          if (idx > 0) {
                            const f = [...linkSearchFields]; const t = f[idx]; f[idx] = f[idx-1]; f[idx-1] = t; setLinkSearchFields(f);
                          }
                        }} disabled={idx === 0} style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', cursor: idx === 0 ? 'not-allowed' : 'pointer', opacity: idx === 0 ? 0.4 : 1 }} title="Subir">▲</button>
                      <button onClick={() => {
                          if (idx < linkSearchFields.length - 1) {
                            const f = [...linkSearchFields]; const t = f[idx]; f[idx] = f[idx+1]; f[idx+1] = t; setLinkSearchFields(f);
                          }
                        }} disabled={idx === linkSearchFields.length - 1} style={{ padding: '2px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', cursor: idx === linkSearchFields.length - 1 ? 'not-allowed' : 'pointer', opacity: idx === linkSearchFields.length - 1 ? 0.4 : 1 }} title="Bajar">▼</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      )} {/* end vinculacion sub-tab */}
      </> /* end pipeline */}

      {/* ══ WHATSAPP PREDEFS + BDAY ═══════════════════════════ */}
      {adminTab === 'whatsapp' && <>

      <div className="acard">
        <h3>Respuestas Rápidas (WhatsApp)</h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '10px' }}>
          Cada recuadro es un mensaje predefinido. Puedes insertar <strong>variables</strong> e incluir una <strong>imagen</strong> adjunta.
        </p>

        {/* Variable legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', padding: '10px', background: 'var(--s2)', borderRadius: '8px', border: '1px solid var(--brd)' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontWeight: 700, width: '100%', marginBottom: '4px' }}>📌 Variables disponibles (click para copiar al portapapeles):</span>
          {[
            { key: 'Nombre_Persona', label: 'Nombre' },
            { key: 'Telefono', label: 'Teléfono' },
            { key: 'Correo_Corp', label: 'Correo' },
            { key: 'Nombre_Empresa', label: 'Empresa' },
            ...(campos || []).map(c => ({ key: c.key, label: c.label }))
          ].map(v => (
            <button
              key={v.key}
              onClick={() => navigator.clipboard?.writeText(`{${v.key}}`).catch(() => {})}
              title={`Copia: {${v.key}}`}
              style={{ padding: '3px 8px', fontSize: '0.7rem', borderRadius: '4px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--navy)', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 700 }}
            >
              {`{${v.key}}`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {waPredefs.map((obj, idx) => (
            <div key={idx} style={{ background: 'var(--s2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--brd)' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text"
                  value={obj.title || ''}
                  onChange={e => {
                    const np = [...waPredefs];
                    np[idx] = { ...np[idx], title: e.target.value };
                    setWaPredefs(np);
                  }}
                  placeholder="Título del botón (Ej: Saludo)"
                  style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--brd)', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600 }}
                />
                <button
                  className="btn btndel"
                  onClick={() => setWaPredefs(waPredefs.filter((_, i) => i !== idx))}
                  style={{ padding: '4px 12px', flexShrink: 0 }}
                >✕</button>
              </div>

              <textarea
                value={obj.text || ''}
                onChange={e => {
                  const np = [...waPredefs];
                  np[idx] = { ...np[idx], text: e.target.value };
                  setWaPredefs(np);
                }}
                placeholder="Escribe el mensaje. Usa {Nombre_Persona}, {Telefono}, {Nombre_Empresa}, etc."
                style={{ width: '100%', minHeight: '70px', padding: '8px', borderRadius: '4px', border: '1px solid var(--brd)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', fontSize: '0.82rem' }}
              />

              {/* Variable insertion buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--muted)', fontWeight: 600 }}>Insertar variable:</span>
                {[
                  { key: 'Nombre_Persona', label: 'Nombre' },
                  { key: 'Telefono', label: 'Teléfono' },
                  { key: 'Correo_Corp', label: 'Correo' },
                  { key: 'Nombre_Empresa', label: 'Empresa' },
                  ...(campos || []).map(c => ({ key: c.key, label: c.label }))
                ].map(v => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => {
                      const np = [...waPredefs];
                      const txt = np[idx].text || '';
                      np[idx] = { ...np[idx], text: txt + `{${v.key}}` };
                      setWaPredefs(np);
                    }}
                    style={{
                      padding: '2px 6px',
                      fontSize: '0.65rem',
                      borderRadius: '4px',
                      border: '1px solid var(--brd)',
                      background: 'var(--s1)',
                      color: 'var(--navy)',
                      cursor: 'pointer'
                    }}
                  >
                    +{v.label}
                  </button>
                ))}
              </div>

              {/* Image upload */}
              <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '5px', border: '1px solid var(--brd)', background: 'var(--s1)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)' }}>
                    📎 {obj.imageBase64 ? 'Cambiar imagen' : 'Adjuntar imagen'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) { alert('La imagen no debe superar 5 MB'); return; }
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const np = [...waPredefs];
                        np[idx] = { ...np[idx], imageBase64: ev.target.result };
                        setWaPredefs(np);
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {obj.imageBase64 && (
                  <>
                    <img src={obj.imageBase64} alt="preview" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--brd)' }} />
                    <button
                      onClick={() => {
                        const np = [...waPredefs];
                        np[idx] = { ...np[idx], imageBase64: null };
                        setWaPredefs(np);
                      }}
                      style={{ fontSize: '0.7rem', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >✕ Quitar</button>
                  </>
                )}
              </div>
            </div>
          ))}
          <button
            className="btn btnda"
            onClick={() => setWaPredefs([...waPredefs, { title: '', text: '', imageBase64: null }])}
            style={{ width: 'fit-content' }}
          >+ Agregar Respuesta</button>
        </div>
      </div>
      </> /* end whatsapp predefs */}

      {adminTab === 'whatsapp' && (
      <div className="acard">
        <h3>🎂 Mensaje por Defecto de Cumpleaños</h3>
        <p style={{ fontSize: '0.72rem', color: 'var(--muted)', marginBottom: '10px' }}>Este mensaje se pre-cargará automáticamente al programar una campaña de cumpleaños. Usa variables como <code>{'{Nombre_Persona}'}</code> para personalizar.</p>
        <textarea
          value={bdayDefaultMessage}
          onChange={e => setBdayDefaultMessage(e.target.value)}
          rows={4}
          style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--brd)', fontFamily: 'inherit', fontSize: '0.85rem', resize: 'vertical', background: 'var(--s2)', color: 'var(--text)' }}
          placeholder="¡Hola {Nombre_Persona}! 🎉 Hoy es tu día especial..."
        />
      </div>
      )} {/* end bday */}

      {adminTab === 'apariencia' && (
      <>
      <div className="acard" style={{ borderLeft: '4px solid var(--navy)' }}>
        <h3 style={{ marginBottom: '6px', fontSize: '0.86rem' }}>Mi Tema Personal</h3>
        <p style={{ fontSize: '0.73rem', color: 'var(--muted)', marginBottom: '16px' }}>Selecciona tu estilo visual. El cambio es instantáneo y se guarda únicamente en tu navegador.</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {Object.values(THEMES).map(t => (
            <button
              key={t.id}
              onClick={() => changeTheme(t.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 18px',
                borderRadius: '12px',
                border: currentTheme === t.id ? `2px solid ${t.preview}` : '2px solid var(--brd)',
                background: currentTheme === t.id ? `${t.preview}18` : 'var(--s2)',
                cursor: 'pointer',
                transition: 'all .2s',
                boxShadow: currentTheme === t.id ? `0 0 12px ${t.preview}44` : 'none',
                minWidth: '90px'
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.preview, boxShadow: `0 2px 8px ${t.preview}66` }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{t.name}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'center' }}>{t.description}</span>
              {currentTheme === t.id && <span style={{ fontSize: '0.65rem', color: t.preview, fontWeight: 800 }}>✓ Activo</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="acard" style={{ borderLeft: '4px solid var(--green)', marginTop: '20px' }}>
        <h3 style={{ marginBottom: '6px', fontSize: '0.86rem' }}>Tema por Defecto de la Plataforma (para todos)</h3>
        <p style={{ fontSize: '0.73rem', color: 'var(--muted)', marginBottom: '16px' }}>Establece el tema predeterminado para todos los usuarios que no tengan una preferencia personal guardada. <b>Nota:</b> Recuerda hacer clic en "Guardar Configuración" al final.</p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {Object.values(THEMES).map(t => (
            <button
              key={t.id}
              onClick={() => setDefaultTheme(t.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                padding: '14px 18px',
                borderRadius: '12px',
                border: defaultTheme === t.id ? `2px solid ${t.preview}` : '2px solid var(--brd)',
                background: defaultTheme === t.id ? `${t.preview}18` : 'var(--s2)',
                cursor: 'pointer',
                transition: 'all .2s',
                boxShadow: defaultTheme === t.id ? `0 0 12px ${t.preview}44` : 'none',
                minWidth: '90px'
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.preview, boxShadow: `0 2px 8px ${t.preview}66` }} />
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text)' }}>{t.name}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--muted)', textAlign: 'center' }}>{t.description}</span>
              {defaultTheme === t.id && <span style={{ fontSize: '0.65rem', color: t.preview, fontWeight: 800 }}>✓ Predeterminado</span>}
            </button>
          ))}
        </div>
      </div>
      </>
      )} {/* end apariencia */}

      {/* Save button: visible on pipeline, whatsapp, privacidad tabs */}
      {['pipeline','whatsapp','privacidad','apariencia'].includes(adminTab) && (
      <button className="btn btny btnw" style={{marginBottom:'40px', padding:'12px'}} onClick={doSaveConfig}>
        💾 Guardar Configuración
      </button>
      )}

    </div>
  );
}
