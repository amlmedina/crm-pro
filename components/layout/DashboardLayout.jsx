'use client';

import { useState, useEffect, useRef } from 'react';
import { api, logoutApi, loginApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Admin from '@/components/views/Admin';
import Directory from '@/components/views/Directory';
import Funnel from '@/components/views/Funnel';
import Tasks from '@/components/views/Tasks';
import Campaigns from '@/components/views/Campaigns';
import Reports from '@/components/views/Reports';
import Drawer from '@/components/ui/Drawer';
import { THEMES, applyTheme, loadSavedTheme, THEME_STORAGE_KEY } from '@/lib/themes';
import Swal from 'sweetalert2';

export default function DashboardLayout({ user }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(user);
  const [profilePhone, setProfilePhone] = useState(user?.telefono || '');
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileConfirmPassword, setProfileConfirmPassword] = useState('');
  const [updatingPhone, setUpdatingPhone] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  function isPasswordSecure(pwd) {
    if (pwd.length < 8) return false;
    const hasLetter = /[a-zA-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSymbol = /[^a-zA-Z0-9]/.test(pwd);
    return hasLetter && hasNumber && hasSymbol;
  }

  useEffect(() => {
    setCurrentUser(user);
    setProfilePhone(user?.telefono || '');
  }, [user]);

  useEffect(() => {
    if (currentUser?.needsPasswordChange) {
      forcePasswordChange();
    }
  }, [currentUser]);

  async function forcePasswordChange() {
    let completed = false;
    while (!completed) {
      const { value: formValues } = await Swal.fire({
        title: '🔑 Cambio de contraseña obligatorio',
        text: 'Por seguridad, debes cambiar la contraseña genérica de primer ingreso.',
        icon: 'warning',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showCancelButton: false,
        html: `
          <div style="display:flex; flex-direction:column; gap:10px; text-align:left;">
            <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Contraseña Actual</label>
            <input id="swal_curr_pass" type="password" class="swal2-input" style="margin:0" placeholder="Aurora123" />
            <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Nueva Contraseña</label>
            <input id="swal_new_pass" type="password" class="swal2-input" style="margin:0" placeholder="Mínimo 8 caract., letras, números y símbolos" />
            <label style="font-size:0.8rem;font-weight:bold;color:var(--muted)">Confirmar Nueva Contraseña</label>
            <input id="swal_conf_pass" type="password" class="swal2-input" style="margin:0" placeholder="Repita la nueva contraseña" />
          </div>
        `,
        preConfirm: () => {
          return {
            curr: document.getElementById('swal_curr_pass').value,
            newP: document.getElementById('swal_new_pass').value,
            conf: document.getElementById('swal_conf_pass').value
          };
        }
      });

      if (!formValues) continue;

      const { curr, newP, conf } = formValues;

      if (!curr || !newP || !conf) {
        await Swal.fire('Error', 'Todos los campos son obligatorios', 'error');
        continue;
      }

      if (newP !== conf) {
        await Swal.fire('Error', 'Las nuevas contraseñas no coinciden', 'error');
        continue;
      }

      if (!isPasswordSecure(newP)) {
        await Swal.fire('Contraseña Insegura', 'La nueva contraseña debe tener al menos 8 caracteres e incluir letras, números y símbolos.', 'error');
        continue;
      }

      Swal.showLoading();
      try {
        const verifyRes = await loginApi(currentUser.correo, curr);
        if (!verifyRes.success) {
          await Swal.fire('Error', 'La contraseña actual es incorrecta', 'error');
          continue;
        }

        await api('resetPassword', {
          userId: currentUser.id,
          newPassword: newP
        });

        const res = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ needsPasswordChange: false })
        });

        if (!res.ok) throw new Error('Error al actualizar la sesión');

        setCurrentUser(prev => ({ ...prev, needsPasswordChange: false }));
        await Swal.fire('✅ Éxito', 'Contraseña actualizada correctamente. ¡Bienvenido!', 'success');
        completed = true;
      } catch (err) {
        console.error(err);
        await Swal.fire('Error', 'No se pudo cambiar la contraseña. Intente nuevamente.', 'error');
      }
    }
  }

  const [activeTab, setActiveTab] = useState('dir'); // 'dir', 'unks', 'funnel', 'tasks', 'campaigns', 'admin', 'perfil'
  const [cfg, setCfg] = useState({});
  const [leads, setLeads] = useState([]);
  const leadsRef = useRef([]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);
  const [loading, setLoading] = useState(true);
  const [unreads, setUnreads] = useState({});
  const [threads, setThreads] = useState([]);
  const [selectedForCampaign, setSelectedForCampaign] = useState([]);
  const [currentTheme, setCurrentTheme] = useState('corporativo');
  const [usersMap, setUsersMap] = useState({});

  // Load saved theme on mount
  useEffect(() => {
    const saved = loadSavedTheme();
    setCurrentTheme(saved);
  }, []);

  async function handleUpdatePhone() {
    if (!profilePhone.trim()) {
      return Swal.fire('Incompleto', 'El teléfono no puede estar vacío', 'warning');
    }
    setUpdatingPhone(true);
    try {
      await api('updateUser', {
        userId: currentUser.id,
        nombre: currentUser.nombre,
        correo: currentUser.correo,
        rol: currentUser.rol,
        telefono: profilePhone
      });

      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefono: profilePhone })
      });

      if (!res.ok) throw new Error('Error al actualizar la cookie de sesión');

      setCurrentUser(prev => ({ ...prev, telefono: profilePhone }));
      Swal.fire('✅ Éxito', 'Teléfono actualizado correctamente', 'success');
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo actualizar el teléfono', 'error');
    } finally {
      setUpdatingPhone(false);
    }
  }

  async function handleUpdatePassword() {
    if (!profileCurrentPassword) {
      return Swal.fire('Incompleto', 'Debe ingresar su contraseña actual', 'warning');
    }
    if (!profilePassword) {
      return Swal.fire('Incompleto', 'La nueva contraseña no puede estar vacía', 'warning');
    }
    if (profilePassword !== profileConfirmPassword) {
      return Swal.fire('Error', 'Las contraseñas nuevas no coinciden', 'warning');
    }
    if (!isPasswordSecure(profilePassword)) {
      return Swal.fire('Contraseña Insegura', 'La nueva contraseña debe tener al menos 8 caracteres e incluir letras, números y símbolos.', 'error');
    }
    
    setUpdatingPassword(true);
    try {
      const verifyRes = await loginApi(currentUser.correo, profileCurrentPassword);
      if (!verifyRes.success) {
        return Swal.fire('Error', 'La contraseña actual es incorrecta', 'error');
      }

      await api('resetPassword', {
        userId: currentUser.id,
        newPassword: profilePassword
      });

      setProfileCurrentPassword('');
      setProfilePassword('');
      setProfileConfirmPassword('');
      Swal.fire('✅ Éxito', 'Contraseña actualizada correctamente', 'success');
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo actualizar la contraseña', 'error');
    } finally {
      setUpdatingPassword(false);
    }
  }

  function changeTheme(themeId) {
    applyTheme(themeId);
    setCurrentTheme(themeId);
  }

  // Global Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLead, setDrawerLead] = useState(null);
  const [drawerTab, setDrawerTab] = useState('perfil');
  const [drawerQueue, setDrawerQueue] = useState([]); // ordered list of leads for queue mode
  const [drawerQueueIdx, setDrawerQueueIdx] = useState(-1);
  const [drawerQueueStageName, setDrawerQueueStageName] = useState('');

  function openDrawer(lead = null, tab = 'perfil') {
    setDrawerLead(lead);
    setDrawerTab(lead?.isUnknown ? 'wa' : tab);
    setDrawerQueue([]);
    setDrawerQueueIdx(-1);
    setDrawerQueueStageName('');
    setDrawerOpen(true);
  }

  // Used by Funnel — enables queue/auto-advance mode
  function openDrawerInQueue(lead, orderedList, stageName = '') {
    const idx = orderedList.findIndex(l => l.ID_Contacto === lead.ID_Contacto);
    setDrawerLead(lead);
    setDrawerTab('int');
    setDrawerQueue(orderedList);
    setDrawerQueueIdx(idx);
    setDrawerQueueStageName(stageName);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  // Parse DLP config safely, default to true unless explicitly false in payload
  const enableDlp = cfg.enableDlp !== false;

  // Masking Utility
  const isCensored = (key) => {
    if (currentUser.rol === 'Administrador' || currentUser.rol === 'Gerente') return false;
    return cfg?.censoredFields?.includes(key);
  };

  // DLP (Data Loss Prevention) Effect driven by config
  useEffect(() => {
    if (!enableDlp) return;

    const isManager = currentUser.rol === 'Gerente' || currentUser.rol === 'Administrador';

    const disableCopy = (e) => { if (!isManager) e.preventDefault(); };
    const disableKeys = (e) => {
      if (isManager) return; // managers always have full access
      if (e.ctrlKey && 'cups'.includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
    };

    document.body.classList.add('dlp');
    document.addEventListener('contextmenu', disableCopy);
    document.addEventListener('copy', disableCopy);
    document.addEventListener('keydown', disableKeys);

    return () => {
      document.body.classList.remove('dlp');
      document.removeEventListener('contextmenu', disableCopy);
      document.removeEventListener('copy', disableCopy);
      document.removeEventListener('keydown', disableKeys);
    }
  }, [enableDlp, currentUser]);

  useEffect(() => {
    initApp();
  }, [currentUser]);

  async function initApp(background = false) {
    try {
      if (!background) setLoading(true);
      const [resCfg, resContacts] = await Promise.all([
        api('getConfig'),
        api('getContacts', { userId: currentUser.id, userRole: currentUser.rol })
      ]);
      setCfg(resCfg);
      if (typeof window !== 'undefined') {
        const hasSavedLocal = localStorage.getItem(THEME_STORAGE_KEY);
        if (!hasSavedLocal) {
          const platformDefault = resCfg.defaultTheme || 'corporativo';
          applyTheme(platformDefault);
          setCurrentTheme(platformDefault);
        }
      }
      const newLeads = resContacts.data || [];
      setLeads(newLeads);
      leadsRef.current = newLeads; // Update ref synchronously for fetchWAData

      // Build a map of every user identifier -> nombre for resolving Agente_Asignado
      try {
        const usersRes = await api('getUsuarios');
        console.log('[usersMap] raw:', JSON.stringify(usersRes?.slice?.(0,5)));
        const map = {};

        // Always seed with the current session user first
        if (currentUser?.id)     map[String(currentUser.id)]     = currentUser.nombre;
        if (currentUser?.nombre) map[currentUser.nombre]          = currentUser.nombre;

        (usersRes || []).forEach(u => {
          const id     = u.ID_Usuario ?? u.id_usuario ?? u.id;
          const nombre = u.Nombre     ?? u.nombre;
          const correo = u.Correo     ?? u.correo;

          if (id !== undefined && id !== null) map[String(id)] = nombre;
          if (nombre) map[nombre] = nombre;
          if (correo) {
            map[correo] = nombre;
            const prefix = correo.split('@')[0];
            if (prefix) map[prefix] = nombre;
            if (prefix) map[prefix.toUpperCase()] = nombre;
          }
        });
        console.log('[usersMap] keys:', Object.keys(map));
        setUsersMap(map);
      } catch (e) { console.error('[usersMap] error:', e); }
      // Initial WA load and auto-link trigger
      await fetchWAData();
    } catch (e) {
      console.error("Hubo un error cargando datos", e);
    } finally {
      if (!background) setLoading(false);
    }
  }

  const fetchWAData = async () => {
    try {
      const [resU, resT] = await Promise.all([
        fetch('/api/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unread' })
        }),
        fetch('/api/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'threads' })
        })
      ]);

      const dataU = await resU.json();
      const dataT = await resT.json();

      if (dataU && !dataU.error) setUnreads(dataU);
      if (dataT && Array.isArray(dataT)) {
        setThreads(dataT);
        autoLinkThreads(dataT);
      }
    } catch { }
  };

  // Periodic WA Polling
  useEffect(() => {
    const interval = setInterval(fetchWAData, 8000);
    return () => clearInterval(interval);
  }, []);

  async function autoLinkThreads(currentThreads) {
    const currentLeads = leadsRef.current;
    if (!currentLeads || !currentLeads.length || !currentThreads.length) return;

    const cleanPhoneStr = (p) => String(p || '').replace(/[\s\-\+\(\)]/g, '');

    // 1. Create a map of suffixes to leads that DON'T have an LID yet
    const suffixMap = {};
    currentLeads.forEach(l => {
      if (l.Telefono && !l.LID) {
        const suffix = cleanPhoneStr(l.Telefono).slice(-10);
        if (suffix.length >= 8) {
          suffixMap[suffix] = l;
        }
      }
    });

    // 2. Find threads that match a suffix
    const toLink = [];
    currentThreads.forEach(t => {
      const threadSuffix = t.id.split('@')[0].slice(-10);
      const matchingLead = suffixMap[threadSuffix];
      if (matchingLead) {
        toLink.push({ lead: matchingLead, lid: t.id });
      }
    });

    if (toLink.length === 0) return;

    console.log(`[Auto-Linker] Found ${toLink.length} potential matches.`);

    // 3. Link them (Sequentially to avoid GAS rate limiting / conflicts)
    for (const item of toLink) {
      const { lead, lid } = item;
      try {
        console.log(`[Auto-Linker] Linking ${lead.Nombre_Persona} to ${lid}`);
        const updatedLead = { ...lead, LID: lid };
        updatedLead.Notas = (updatedLead.Notas || '') + `\n[Sistema] Vinculado automáticamente por coincidencia de número WhatsApp: ${lid}`;

        await api('saveProfile', { perfil: updatedLead, userId: currentUser.id });

        // Update local state to prevent re-processing
        const updater = prev => prev.map(l => l.ID_Contacto === lead.ID_Contacto ? updatedLead : l);
        setLeads(updater);
        leadsRef.current = updater(leadsRef.current);
      } catch (err) {
        console.error(`[Auto-Linker] Error linking ${lead.Nombre_Persona}:`, err);
      }
    }
  }

  async function handleLogout() {
    await logoutApi();
    router.refresh();
  }

  return (
    <div id="app" style={{ display: 'flex' }}>
      <nav id="nav">
        {process.env.NEXT_PUBLIC_BRAND_LOGO ? (
          <img src={process.env.NEXT_PUBLIC_BRAND_LOGO} alt="Logo" style={{ height: '32px', objectFit: 'contain' }} />
        ) : (
          <div className="logo">{process.env.NEXT_PUBLIC_BRAND_NAME || 'Aurora'}</div>
        )}
        <div className="tabs">
          <button className={`tab ${activeTab === 'dir' ? 'on' : ''}`} onClick={() => setActiveTab('dir')}>Directorio</button>
          <button className={`tab ${activeTab === 'unks' ? 'on' : ''}`} onClick={() => setActiveTab('unks')}>👽 Desconocidos</button>
          <button className={`tab ${activeTab === 'funnel' ? 'on' : ''}`} onClick={() => setActiveTab('funnel')}>Funnel SLA</button>
          <button className={`tab ${activeTab === 'tasks' ? 'on' : ''}`} onClick={() => setActiveTab('tasks')}>✅ Tareas</button>
          <button className={`tab ${activeTab === 'campaigns' ? 'on' : ''}`} onClick={() => setActiveTab('campaigns')}>📣 Campañas</button>
          <button className={`tab ${activeTab === 'perfil' ? 'on' : ''}`} onClick={() => setActiveTab('perfil')}>👤 Mi Perfil</button>
          {currentUser.rol === 'Gerente' && (
            <>
              <button className={`tab ${activeTab === 'reports' ? 'on' : ''}`} onClick={() => setActiveTab('reports')}>📊 Reportes</button>
              <button className={`tab tadm ${activeTab === 'admin' ? 'on' : ''}`} onClick={() => setActiveTab('admin')}>⚙️ Admin</button>
            </>
          )}
        </div>
        <div id="nuser" style={{ cursor: 'pointer' }} onClick={() => setActiveTab('perfil')} title="Ver mi perfil">
          <span style={{ fontWeight: 700, color: activeTab === 'perfil' ? 'var(--navy)' : 'var(--text)', marginRight: '4px' }}>{currentUser.nombre}</span> · {currentUser.rol}
          <button onClick={(e) => { e.stopPropagation(); handleLogout(); }} style={{ marginLeft: '12px', padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--brd)', borderRadius: '4px', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
            SALIR
          </button>
        </div>
      </nav>

      {/* Marca de Agua Dinámica / DLP */}
      {enableDlp && (
        <div id="wm" style={{ display: 'block' }}>
          {(currentUser.correo + '     ').repeat(300)}
        </div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="mono">Cargando tus contactos...</p>
        </div>
      ) : (
        <>
          {/* VIEWS */}
          <div style={{ display: activeTab === 'dir' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            <Directory
              leads={leads}
              cfg={cfg}
              loading={loading}
              refreshLeads={initApp}
              user={currentUser}
              openDrawer={openDrawer}
              isCensored={isCensored}
              hideUnknowns={true}
              unreads={unreads}
              threads={threads}
              selectedForCampaign={selectedForCampaign}
              setSelectedForCampaign={setSelectedForCampaign}
              onGoToCampaign={() => setActiveTab('campaigns')}
            />
          </div>

          <div style={{ display: activeTab === 'unks' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            <Directory
              leads={leads}
              cfg={cfg}
              loading={loading}
              refreshLeads={initApp}
              user={currentUser}
              openDrawer={openDrawer}
              isCensored={isCensored}
              unknownsOnly={true}
              unreads={unreads}
              threads={threads}
              selectedForCampaign={selectedForCampaign}
              setSelectedForCampaign={setSelectedForCampaign}
              onGoToCampaign={() => setActiveTab('campaigns')}
            />
          </div>

          <div style={{ display: activeTab === 'funnel' ? 'block' : 'none', flex: 1, overflowY: 'auto' }}>
            <Funnel
              leads={leads}
              setLeads={setLeads}
              cfg={cfg}
              loading={loading}
              refreshLeads={initApp}
              openDrawer={openDrawer}
              openDrawerInQueue={openDrawerInQueue}
              user={currentUser}
              unreads={unreads}
              isCensored={isCensored}
              usersMap={usersMap}
            />
          </div>

          <div style={{ display: activeTab === 'tasks' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <Tasks openDrawer={openDrawer} />
          </div>

          <div style={{ display: activeTab === 'campaigns' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <Campaigns leads={leads} cfg={cfg} user={currentUser} openDrawer={openDrawer} isCensored={isCensored} initialSelection={selectedForCampaign} onClearSelection={() => setSelectedForCampaign([])} />
          </div>

          {currentUser.rol === 'Gerente' && (
            <>
              <div style={{ display: activeTab === 'reports' ? 'flex' : 'none', flex: 1, overflowY: 'auto' }}>
                <Reports leads={leads} cfg={cfg} setCfg={setCfg} />
              </div>
              <div style={{ display: activeTab === 'admin' ? 'flex' : 'none', flex: 1, overflowY: 'auto' }}>
                <Admin cfg={cfg} setCfg={setCfg} currentTheme={currentTheme} changeTheme={changeTheme} />
              </div>
            </>
          )}

          {/* PERFIL VIEW */}
          <div style={{ display: activeTab === 'perfil' ? 'flex' : 'none', flex: 1, overflowY: 'auto', padding: '30px 40px', justifyContent: 'center' }}>
            <div style={{ width: '100%', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="card" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--navy)', borderBottom: '1px solid var(--brd)', paddingBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👤 Mi Perfil
                </h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Nombre</label>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '4px' }}>{currentUser.nombre}</div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Correo Electrónico</label>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '4px' }}>{currentUser.correo}</div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Rol</label>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '4px' }}>
                      <span className="badge bm">{currentUser.rol}</span>
                    </div>
                  </div>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--brd)' }} />

                  <div className="fg">
                    <label>Teléfono</label>
                    <input 
                      type="text" 
                      placeholder="Ej. +521234567890" 
                      value={profilePhone} 
                      onChange={e => setProfilePhone(e.target.value)} 
                    />
                  </div>

                  <button 
                    className="btn btng" 
                    onClick={handleUpdatePhone}
                    disabled={updatingPhone}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {updatingPhone ? 'Guardando...' : 'Actualizar Teléfono'}
                  </button>

                  <hr style={{ border: 'none', borderTop: '1px solid var(--brd)' }} />

                  <div className="fg">
                    <label>Contraseña Actual</label>
                    <input 
                      type="password" 
                      placeholder="Ingrese contraseña actual" 
                      value={profileCurrentPassword} 
                      onChange={e => setProfileCurrentPassword(e.target.value)} 
                    />
                  </div>

                  <div className="fg">
                    <label>Nueva Contraseña</label>
                    <input 
                      type="password" 
                      placeholder="Mínimo 8 caract., letras, números y símbolos" 
                      value={profilePassword} 
                      onChange={e => setProfilePassword(e.target.value)} 
                    />
                  </div>

                  <div className="fg">
                    <label>Confirmar Contraseña</label>
                    <input 
                      type="password" 
                      placeholder="Repite la contraseña" 
                      value={profileConfirmPassword} 
                      onChange={e => setProfileConfirmPassword(e.target.value)} 
                    />
                  </div>

                  <button 
                    className="btn btng" 
                    onClick={handleUpdatePassword}
                    disabled={updatingPassword}
                    style={{ alignSelf: 'flex-start' }}
                  >
                    {updatingPassword ? 'Cambiando clave...' : 'Actualizar Contraseña'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Profile Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        lead={drawerLead}
        leads={leads}
        setLeads={setLeads}
        tab={drawerTab}
        setTab={setDrawerTab}
        cfg={cfg}
        user={currentUser}
        refreshLeads={initApp}
        isCensored={isCensored}
        drawerQueue={drawerQueue}
        drawerQueueIdx={drawerQueueIdx}
        drawerQueueStageName={drawerQueueStageName}
        onAdvanceQueue={(nextLead, nextIdx) => {
          setDrawerLead(nextLead);
          setDrawerQueueIdx(nextIdx);
          setDrawerTab('int');
        }}
      />
    </div>
  );
}
