'use client';

import { useState, useEffect } from 'react';
import { api, logoutApi } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Admin from '@/components/views/Admin';
import Directory from '@/components/views/Directory';
import Funnel from '@/components/views/Funnel';
import Tasks from '@/components/views/Tasks';
import Campaigns from '@/components/views/Campaigns';
import Drawer from '@/components/ui/Drawer';
import { THEMES, applyTheme, loadSavedTheme, THEME_STORAGE_KEY } from '@/lib/themes';

export default function DashboardLayout({ user }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('dir'); // 'dir', 'unks', 'funnel', 'tasks', 'campaigns', 'admin'
  const [cfg, setCfg] = useState({});
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreads, setUnreads] = useState({});
  const [threads, setThreads] = useState([]);
  const [selectedForCampaign, setSelectedForCampaign] = useState([]);
  const [currentTheme, setCurrentTheme] = useState('galaxia');

  // Load saved theme on mount
  useEffect(() => {
    const saved = loadSavedTheme();
    setCurrentTheme(saved);
  }, []);

  function changeTheme(themeId) {
    applyTheme(themeId);
    setCurrentTheme(themeId);
  }

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

  // Masking Utility
  const isCensored = (key) => {
    if (user.rol === 'Administrador' || user.rol === 'Gerente') return false;
    return cfg?.censoredFields?.includes(key);
  };

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

  async function initApp(background = false) {
    try {
      if (!background) setLoading(true);
      const [resCfg, resContacts] = await Promise.all([
        api('getConfig'),
        api('getContacts', { userId: user.id, userRole: user.rol })
      ]);
      setCfg(resCfg);
      const newLeads = resContacts.data || [];
      setLeads(newLeads);
      
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
    } catch {}
  };

  // Periodic WA Polling
  useEffect(() => {
    const interval = setInterval(fetchWAData, 8000);
    return () => clearInterval(interval);
  }, []);

  async function autoLinkThreads(currentThreads) {
    if (!leads.length || !currentThreads.length) return;

    const cleanPhoneStr = (p) => String(p || '').replace(/[\s\-\+\(\)]/g, '');
    
    // 1. Create a map of suffixes to leads that DON'T have an LID yet
    const suffixMap = {};
    leads.forEach(l => {
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
        
        await api('saveProfile', { perfil: updatedLead, userId: user.id });
        
        // Update local state to prevent re-processing
        setLeads(prev => prev.map(l => l.ID_Contacto === lead.ID_Contacto ? updatedLead : l));
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
            <Directory 
              leads={leads} 
              cfg={cfg} 
              loading={loading} 
              refreshLeads={initApp} 
              user={user} 
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
              user={user} 
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
            <Funnel leads={leads} setLeads={setLeads} cfg={cfg} loading={loading} refreshLeads={initApp} openDrawer={openDrawer} user={user} unreads={unreads} isCensored={isCensored} />
          </div>

          <div style={{ display: activeTab === 'tasks' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <Tasks openDrawer={openDrawer} />
          </div>

          <div style={{ display: activeTab === 'campaigns' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
            <Campaigns leads={leads} cfg={cfg} user={user} openDrawer={openDrawer} isCensored={isCensored} initialSelection={selectedForCampaign} onClearSelection={() => setSelectedForCampaign([])} />
          </div>

          {user.rol === 'Gerente' && (
            <div style={{ display: activeTab === 'admin' ? 'flex' : 'none', flex: 1, overflowY: 'auto' }}>
              <Admin cfg={cfg} setCfg={setCfg} currentTheme={currentTheme} changeTheme={changeTheme} />
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
        isCensored={isCensored}
      />
    </div>
  );
}
