'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Funnel({ leads, cfg, user, openDrawer, setLeads }) {
  const [draggedId, setDraggedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sincronización de unreads para la burbuja
  const [unreads, setUnreads] = useState({});

  useEffect(() => {
    const fetchUnreads = async () => {
      try {
        const res = await fetch('/api/whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unread' })
        });
        const data = await res.json();
        if (data && !data.error) setUnreads(data);
      } catch {}
    };
    fetchUnreads();
    const interval = setInterval(fetchUnreads, 8000);
    return () => clearInterval(interval);
  }, []);

  // SLA Strikes function
  function getStrikeCount(l, stage) {
    if (l.Estado_Funnel !== stage || !l.Historial || !l.Historial.length) return 0;
    let st = 0;
    for (const h of l.Historial) {
      if (h.Estado_Momento === stage) st++;
      else break;
    }
    return st - 1; // 1 interaction is the initial setup, next ones are strikes
  }

  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
  };

  const handleDragLeave = (e) => {
    e.currentTarget.classList.remove('dragover');
  };

  const handleDrop = async (e, destStage) => {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const id = e.dataTransfer.getData('text/plain');
    if (!id || !destStage) return;

    const lead = leads.find(l => l.ID_Contacto === id);
    if (!lead || lead.Estado_Funnel === destStage) return;
    
    // Save locally for instant UI update
    const oldLeads = [...leads];
    setLeads(leads.map(l => l.ID_Contacto === id ? { ...l, Estado_Funnel: destStage } : l));

    try {
      await api('saveInteraction', { 
        idContacto: id, 
        nuevoEstado: destStage, 
        notas: `Movido vía Kanban a ${destStage}`, 
        nombreUsuario: user.nombre 
      });
      // Optionally trigger global refreshLeads in DashboardLayout to fetch Historial
    } catch {
      Swal.fire({title: 'Error de Red', text: 'No se pudo mover la tarjeta', icon: 'error'});
      setLeads(oldLeads); // rollback
    }
  };

  const activeStages = cfg.funnel || [];
  
  // Apply Search Filtering
  const filteredLeads = leads.filter(l => {
    const s = searchTerm.toLowerCase();
    return (l.Nombre_Persona || '').toLowerCase().includes(s) || 
           (l.Nombre_Empresa || '').toLowerCase().includes(s);
  });

  const frozenLeads = filteredLeads.filter(l => l.Estado_Funnel === 'Congelado');

  return (
    <div className="view on" id="vfunnel" style={{display:'flex', flexDirection:'column', gap:'15px', padding:'20px'}}>
      
      {/* Search Bar Area */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', padding: '10px 20px', borderRadius: '12px', border: '1px solid var(--brd)', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <span style={{ marginRight: '10px', fontSize: '1.2rem' }}>🔍</span>
        <input 
          type="text" 
          placeholder="Buscar Prospecto o Empresa en el Funnel..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--navy)' }}
        />
        {searchTerm && (
          <button 
            onClick={() => setSearchTerm('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.8rem' }}
          >Limpiar</button>
        )}
      </div>

      <div id="kanban" style={{ flex: 1 }}>
        {activeStages.map(f => {
          const colLeads = filteredLeads.filter(l => l.Estado_Funnel === f.stage);
          return (
            <div 
              className="kcol" 
              key={f.stage}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, f.stage)}
            >
              <div className="khdr">
                <div>
                  <div className="ktitle">{f.stage}</div>
                  <div className="ksla">SLA: {f.limit} strikes</div>
                </div>
                <div className="kcnt">{colLeads.length}</div>
              </div>
              <div className="kcards">
                {colLeads.map(l => {
                  const strikes = getStrikeCount(l, f.stage);
                  const isOver = f.limit > 0 && strikes >= f.limit;
                  return (
                    <div 
                      className={`kcard ${isOver ? 'over' : ''}`} 
                      key={l.ID_Contacto}
                      draggable
                      onDragStart={(e) => handleDragStart(e, l.ID_Contacto)}
                      onClick={() => openDrawer(l)}
                      style={{ borderLeftColor: isOver ? 'var(--danger)' : 'var(--navy)' }}
                    >
                      <div className="kname" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                         {l.Nombre_Persona}
                         {unreads[String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '').slice(-10)] > 0 && (
                            <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                               {unreads[String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '').slice(-10)]}
                            </span>
                         )}
                      </div>
                      <div className="ksub" style={{marginTop:'4px'}}>{l.Nombre_Empresa || 'Sin empresa'}</div>
                      <div className="ksub">{(l.Presupuesto && !isNaN(Number(l.Presupuesto))) ? `$${Number(l.Presupuesto).toLocaleString()}` : ''}</div>
                      {isOver && <div style={{fontSize:'10px', color:'var(--danger)', marginTop:'6px'}}>⚠️ {strikes}/{f.limit} Interacciones</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Columna Congelados (Sólamente UI) */}
        {frozenLeads.length > 0 && (
          <div className="kcol" style={{ opacity: 0.8 }}>
            <div className="khdr" style={{ background: '#e2e8f0' }}>
              <div><div className="ktitle" style={{color:'var(--muted)'}}>Congelados (Fuera de SLA)</div></div>
              <div className="kcnt" style={{color:'var(--muted)'}}>{frozenLeads.length}</div>
            </div>
            <div className="kcards">
              {frozenLeads.map(l => (
                <div className="kcard fz" key={l.ID_Contacto} onClick={() => openDrawer(l)}>
                  <div className="kname" style={{color:'var(--muted)'}}>{l.Nombre_Persona}</div>
                  <div className="ksub">{l.Nombre_Empresa}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
