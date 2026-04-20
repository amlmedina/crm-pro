'use client';

import { useState, useEffect } from 'react';
import { api, logoutApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Admin from '@/components/views/Admin';
import Directory from '@/components/views/Directory';
import Funnel from '@/components/views/Funnel';
import Tasks from '@/components/views/Tasks';
import Drawer from '@/components/ui/Drawer';

export default function DashboardLayout({ user }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dir'); // 'dir', 'funnel', 'admin'
  const [cfg, setCfg] = useState({});
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  // Global Drawer State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLead, setDrawerLead] = useState(null);
  const [drawerTab, setDrawerTab] = useState('perfil');

  function openDrawer(lead = null, tab = 'perfil') {
    setDrawerLead(lead);
    setDrawerTab(tab);
    setDrawerOpen(true);
  }
  function closeDrawer() {
    setDrawerOpen(false);
  }

  // Parse DLP config safely, default to true unless explicitly false in payload
  const enableDlp = cfg.enableDlp !== false;

  // DLP (Data Loss Prevention) Effect driven by config
  useEffect(() => {
    if (!enableDlp) return;

    const disableCopy = (e) => e.preventDefault();
    const disableKeys = (e) => {
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
  }, [enableDlp]);

  useEffect(() => {
    initApp();
  }, [user]);

  async function initApp() {
    try {
      setLoading(true);
      const [resCfg, resContacts] = await Promise.all([
        api('getConfig'),
        api('getContacts', { userId: user.id, userRole: user.rol })
      ]);
      setCfg(resCfg);
      setLeads(resContacts.data || []);
    } catch (e) {
      console.error("Hubo un error cargando datos", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logoutApi();
    router.refresh();
  }

  return (
    <div id="app" style={{ display: 'flex' }}>
      <nav id="nav">
        <div className="logo">CRM<span>Pro</span></div>
        <div className="tabs">
          <button className={`tab ${activeTab === 'dir' ? 'on' : ''}`} onClick={() => setActiveTab('dir')}>Directorio</button>
          <button className={`tab ${activeTab === 'unks' ? 'on' : ''}`} onClick={() => setActiveTab('unks')}>👽 Desconocidos</button>
          <button className={`tab ${activeTab === 'funnel' ? 'on' : ''}`} onClick={() => setActiveTab('funnel')}>Funnel SLA</button>
          <button className={`tab ${activeTab === 'tasks' ? 'on' : ''}`} onClick={() => setActiveTab('tasks')}>✅ Tareas</button>
          {user.rol === 'Gerente' && (
            <button className={`tab tadm ${activeTab === 'admin' ? 'on' : ''}`} onClick={() => setActiveTab('admin')}>Admin</button>
          )}
        </div>
        <div id="nuser">
          <span style={{ fontWeight: 700, color: 'var(--text)', marginRight: '4px' }}>{user.nombre}</span> · {user.rol}
          <button onClick={handleLogout} style={{ marginLeft: '12px', padding: '4px 8px', background: 'var(--s2)', border: '1px solid var(--brd)', borderRadius: '4px', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700 }}>
            SALIR
          </button>
        </div>
      </nav>

      {/* Marca de Agua Dinámica / DLP */}
      {enableDlp && (
        <div id="wm" style={{ display: 'block' }}>
           {(user.correo + '     ').repeat(300)}
        </div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
           <p className="mono">Cargando base de datos Segura...</p>
        </div>
      ) : (
        <>
          {/* VIEWS */}
          <div style={{ display: activeTab === 'dir' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            <Directory leads={leads} cfg={cfg} loading={loading} refreshLeads={initApp} user={user} openDrawer={openDrawer} hideUnknowns={true} />
          </div>

          <div style={{ display: activeTab === 'unks' ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
            <Directory leads={leads} cfg={cfg} loading={loading} refreshLeads={initApp} user={user} openDrawer={openDrawer} unknownsOnly={true} />
          </div>

          <div style={{ display: activeTab === 'funnel' ? 'block' : 'none', flex: 1, overflowY: 'auto' }}>
            <Funnel leads={leads} setLeads={setLeads} cfg={cfg} loading={loading} refreshLeads={initApp} openDrawer={openDrawer} user={user} />
          </div>

          <div style={{ display: activeTab === 'tasks' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <Tasks openDrawer={openDrawer} />
          </div>

          {user.rol === 'Gerente' && (
            <div style={{ display: activeTab === 'admin' ? 'flex' : 'none', flex: 1, overflowY: 'auto' }}>
              <Admin cfg={cfg} setCfg={setCfg} />
            </div>
          )}
        </>
      )}

      {/* Profile Drawer */}
      <Drawer 
        open={drawerOpen} 
        onClose={closeDrawer} 
        lead={drawerLead} 
        leads={leads}
        tab={drawerTab} 
        setTab={setDrawerTab}
        cfg={cfg}
        user={user}
        refreshLeads={initApp}
      />
    </div>
  );
}
