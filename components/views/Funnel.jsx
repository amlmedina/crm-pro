'use client';

import { useState, useMemo } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Funnel({ leads, cfg, user, openDrawer, setLeads, unreads, usersMap = {} }) {
  const [draggedId, setDraggedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [agentFilter, setAgentFilter] = useState('todos');

  const isManager = user.rol === 'Gerente' || user.rol === 'Administrador';

  // Resolve an Agente_Asignado value (which might be an ID or already a name) to a display name
  function resolveName(val) {
    if (!val) return '';
    return usersMap[val] || val; // fallback to raw value if not in map
  }

  // Generates a consistent vibrant color based on agent's name
  function getAgentColor(name) {
    if (!name || name === 'Sin Asignar') return 'var(--muted)';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 55%)`;
  }

  // All unique resolved agent names from leads
  const agentOptions = useMemo(() => {
    const names = new Set();
    leads.forEach(l => { if (l.Agente_Asignado) names.add(resolveName(l.Agente_Asignado)); });
    return Array.from(names).sort();
  }, [leads, usersMap]);

  // SLA Strikes function
  function getStrikeCount(l, stage) {
    if (l.Estado_Funnel !== stage || !l.Historial || !l.Historial.length) return 0;
    let st = 0;
    for (const h of l.Historial) {
      if (h.Estado_Momento === stage) st++;
      else break;
    }
    return st - 1;
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

    const oldLeads = [...leads];
    setLeads(leads.map(l => l.ID_Contacto === id ? { ...l, Estado_Funnel: destStage } : l));

    try {
      await api('saveInteraction', {
        idContacto: id,
        nuevoEstado: destStage,
        notas: `Movido vía Kanban a ${destStage}`,
        nombreUsuario: user.nombre
      });
    } catch {
      Swal.fire({ title: 'Error de Red', text: 'No se pudo mover la tarjeta', icon: 'error' });
      setLeads(oldLeads);
    }
  };

  const activeStages = cfg.funnel || [];

  // Filtering: agents only see their own leads; managers can filter by agent
  const filteredLeads = leads.filter(l => {
    const s = searchTerm.toLowerCase();
    const matchSearch =
      (l.Nombre_Persona || '').toLowerCase().includes(s) ||
      (l.Telefono || '').includes(s);

    let matchAgent = true;
    if (!isManager) {
      // Agents always see only their own
      matchAgent = resolveName(l.Agente_Asignado) === user.nombre;
    } else if (agentFilter === '__sin_asignar__') {
      matchAgent = !l.Agente_Asignado;
    } else if (agentFilter !== 'todos') {
      matchAgent = resolveName(l.Agente_Asignado) === agentFilter;
    }

    return matchSearch && matchAgent;
  });

  const frozenLeads = filteredLeads.filter(l => l.Estado_Funnel === 'Congelado');

  const activeLabel = isManager
    ? (agentFilter === 'todos' ? 'Todo el equipo' : agentFilter === '__sin_asignar__' ? 'Sin Asignar' : agentFilter)
    : user.nombre;

  return (
    <div className="view on" id="vfunnel" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Search */}
        <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', background: 'var(--s1)', padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--brd)', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <span style={{ marginRight: '10px', fontSize: '1.1rem' }}>🔍</span>
          <input
            type="text"
            placeholder="Buscar contacto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text)' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem' }}>✕</button>
          )}
        </div>

        {/* Agent filter — Managers only */}
        {isManager && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--s1)', padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--brd)', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', flexShrink: 0 }}>
            <span style={{ fontSize: '1rem' }}>👤</span>
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer', minWidth: '150px' }}
            >
              <option value="todos">Todo el equipo</option>
              {agentOptions.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
              <option value="__sin_asignar__">Sin Asignar</option>
            </select>
          </div>
        )}

        {/* Summary badge */}
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', padding: '6px 12px', background: 'var(--s2)', borderRadius: '20px', border: '1px solid var(--brd)', whiteSpace: 'nowrap' }}>
          {filteredLeads.length} contactos · <strong style={{ color: 'var(--text)' }}>{activeLabel}</strong>
        </div>
      </div>

      {/* Kanban Board */}
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
                  const phoneSuffix = String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '').slice(-10);
                  const u = (unreads[phoneSuffix] || 0) + (unreads[l.LID] || 0);
                  return (
                    <div
                      className={`kcard ${isOver ? 'over' : ''}`}
                      key={l.ID_Contacto}
                      draggable
                      onDragStart={(e) => handleDragStart(e, l.ID_Contacto)}
                      onClick={() => openDrawer(l)}
                      style={{ 
                        borderLeftColor: getAgentColor(resolveName(l.Agente_Asignado)),
                        borderRight: isOver ? '3px solid var(--danger)' : 'none'
                      }}
                    >
                      <div className="kname" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {isOver && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} title="SLA Vencido"></span>}
                          {l.Nombre_Persona}
                        </div>
                        {u > 0 && (
                          <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                            {u}
                          </span>
                        )}
                      </div>
                      
                      <div className="kmeta">
                        {l.Ultima_Interaccion && <span>🕒 {l.Ultima_Interaccion}</span>}
                        {l.Estado_Funnel === 'Congelado' && <span className="ct">❄️ Congelado</span>}
                      </div>
                      
                      {/* Show assigned agent on card when manager views "todos" */}
                      {isManager && agentFilter === 'todos' && l.Agente_Asignado && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span>👤</span> {resolveName(l.Agente_Asignado)}
                        </div>
                      )}
                      {isOver && (
                        <div style={{ fontSize: '10px', color: 'var(--danger)', marginTop: '6px' }}>
                          ⚠️ {strikes}/{f.limit} Interacciones
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Frozen column */}
        {frozenLeads.length > 0 && (
          <div className="kcol" style={{ opacity: 0.8 }}>
            <div className="khdr" style={{ background: '#e2e8f0' }}>
              <div><div className="ktitle" style={{ color: 'var(--muted)' }}>Congelados</div></div>
              <div className="kcnt" style={{ color: 'var(--muted)' }}>{frozenLeads.length}</div>
            </div>
            <div className="kcards">
              {frozenLeads.map(l => (
                <div 
                  className="kcard fz" 
                  key={l.ID_Contacto} 
                  onClick={() => openDrawer(l)}
                  style={{ borderLeftColor: getAgentColor(resolveName(l.Agente_Asignado)) }}
                >
                  <div className="kname" style={{ color: 'var(--muted)' }}>{l.Nombre_Persona}</div>
                  {isManager && agentFilter === 'todos' && l.Agente_Asignado && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '2px' }}>👤 {resolveName(l.Agente_Asignado)}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
