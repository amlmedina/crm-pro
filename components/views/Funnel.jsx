'use client';

import { useState, useMemo } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Funnel({ leads, cfg, user, openDrawer, setLeads, unreads, usersMap = {}, refreshLeads }) {
  const [draggedId, setDraggedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('todos');
  const [activeFilters, setActiveFilters] = useState([]);
  const [agentFilter, setAgentFilter] = useState('todos');

  const filterOptions = useMemo(() => {
    return [
      { key: 'todos', label: 'Todos los campos' },
      { key: 'Nombre_Persona', label: 'Nombre' },
      { key: 'Telefono', label: 'Teléfono' },
      { key: 'Correo_Corp', label: 'Correo' },
      ...(cfg.camposPersonalizados || []).map(c => ({ key: c.key, label: c.label, tipo: c.tipo, opciones: c.opciones }))
    ];
  }, [cfg]);
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [bulkDestStage, setBulkDestStage] = useState('');
  const [lastSelectedId, setLastSelectedId] = useState(null);

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

  // SLA function removed per user request

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

  const handleBulkMove = async () => {
    if (selectedLeads.size === 0 || !bulkDestStage) return;

    Swal.fire({ 
      title: `Moviendo ${selectedLeads.size} contactos...`, 
      allowOutsideClick: false, 
      didOpen: () => Swal.showLoading() 
    });

    const oldLeads = [...leads];
    
    // Optimistic UI Update
    setLeads(leads.map(l => 
      selectedLeads.has(l.ID_Contacto) ? { ...l, Estado_Funnel: bulkDestStage } : l
    ));

    try {
      const selectedIds = Array.from(selectedLeads);
      
      // Sequentially process to respect GAS limits
      for (const id of selectedIds) {
        await api('saveInteraction', {
          idContacto: id,
          nuevoEstado: bulkDestStage,
          notas: `[Bulk] Movido masivamente a ${bulkDestStage}`,
          nombreUsuario: user.nombre
        });
      }

      Swal.fire({ title: '✅ Movimiento Completado', icon: 'success', timer: 1500, showConfirmButton: false });
      setSelectedLeads(new Set()); // Clear selection
      setBulkDestStage('');
    } catch (err) {
      console.error(err);
      Swal.fire({ title: 'Error', text: 'Ocurrió un problema moviendo algunas tarjetas. Se revertirán los cambios.', icon: 'error' });
      setLeads(oldLeads);
    }
  };

  const activeStages = cfg.funnel || [];

  // Filtering: agents only see their own leads; managers can filter by agent
  const filteredLeads = leads.filter(l => {
    let matchSearch = true;

    // Evaluate accumulated filters
    for (const f of activeFilters) {
      const s = f.value.toLowerCase();
      if (f.field === 'todos') {
        const match = Object.values(l).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(s));
        if (!match) { matchSearch = false; break; }
      } else {
        const val = l[f.field];
        const match = val !== null && val !== undefined && String(val).toLowerCase().includes(s);
        if (!match) { matchSearch = false; break; }
      }
    }

    // Evaluate pending search term
    if (matchSearch && searchTerm.trim()) {
      const s = searchTerm.trim().toLowerCase();
      if (searchField === 'todos') {
        const match = Object.values(l).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(s));
        if (!match) matchSearch = false;
      } else {
        const val = l[searchField];
        const match = val !== null && val !== undefined && String(val).toLowerCase().includes(s);
        if (!match) matchSearch = false;
      }
    }

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

  const orderedVisibleIds = useMemo(() => {
    const ids = [];
    activeStages.forEach(f => {
      filteredLeads.filter(l => l.Estado_Funnel === f.stage).forEach(l => ids.push(l.ID_Contacto));
    });
    return ids;
  }, [filteredLeads, activeStages]);

  const activeLabel = isManager
    ? (agentFilter === 'todos' ? 'Todo el equipo' : agentFilter === '__sin_asignar__' ? 'Sin Asignar' : agentFilter)
    : user.nombre;

  return (
    <div className="view on" id="vfunnel" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>

        {/* Search */}
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', alignItems: 'center', background: 'var(--s1)', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--brd)', boxShadow: '0 2px 6px rgba(0,0,0,0.05)' }}>
          <span style={{ marginRight: '10px', fontSize: '1.1rem' }}>🔍</span>
          
          <select 
            value={searchField}
            onChange={e => {
              setSearchField(e.target.value);
              setSearchTerm('');
            }}
            style={{ 
              background: 'var(--s2)', border: '1px solid var(--brd)', outline: 'none', 
              fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer',
              padding: '4px 8px', borderRadius: '6px', marginRight: '10px'
            }}
          >
            {filterOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          {(() => {
            const selectedOpt = filterOptions.find(o => o.key === searchField);
            if (selectedOpt?.tipo === 'select') {
              return (
                <select
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text)', padding: '4px 0' }}
                >
                  <option value="">(Cualquiera)</option>
                  {selectedOpt.opciones?.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              );
            }
            if (selectedOpt?.tipo === 'bool') {
              return (
                <select
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text)', padding: '4px 0' }}
                >
                  <option value="">(Cualquiera)</option>
                  <option value="Sí">Sí</option>
                  <option value="No">No</option>
                </select>
              );
            }
            return (
              <input
                type="text"
                placeholder="Buscar contacto..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && searchTerm.trim()) {
                    e.preventDefault();
                    const selectedOpt = filterOptions.find(o => o.key === searchField);
                    setActiveFilters([...activeFilters, {
                      id: Date.now(),
                      field: searchField,
                      label: selectedOpt ? selectedOpt.label : 'Filtro',
                      value: searchTerm.trim()
                    }]);
                    setSearchTerm('');
                  }
                }}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text)', padding: '4px 0' }}
              />
            );
          })()}
          
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem', marginRight: '6px' }} title="Limpiar">✕</button>
          )}

          <button 
            onClick={() => {
              if (!searchTerm.trim()) return;
              const selectedOpt = filterOptions.find(o => o.key === searchField);
              setActiveFilters([...activeFilters, {
                id: Date.now(),
                field: searchField,
                label: selectedOpt ? selectedOpt.label : 'Filtro',
                value: searchTerm.trim()
              }]);
              setSearchTerm('');
            }} 
            disabled={!searchTerm.trim()}
            style={{ 
              background: searchTerm.trim() ? 'var(--accent)' : 'var(--brd)', 
              border: 'none', cursor: searchTerm.trim() ? 'pointer' : 'not-allowed', 
              color: '#fff', fontSize: '1.2rem', padding: '0 10px', borderRadius: '6px', 
              height: '28px', display: 'flex', alignItems: 'center' 
            }}
            title="Añadir Filtro"
          >
            +
          </button>
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

        {/* Summary badge & Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', padding: '6px 12px', background: 'var(--s2)', borderRadius: '20px', border: '1px solid var(--brd)', whiteSpace: 'nowrap' }}>
            {filteredLeads.length} contactos · <strong style={{ color: 'var(--text)' }}>{activeLabel}</strong>
          </div>
          
          {refreshLeads && (
            <button 
              className="btn btngh" 
              onClick={refreshLeads} 
              style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '20px' }}
              title="Actualizar Datos"
            >
              🔄 Actualizar
            </button>
          )}
        </div>
      </div>

      {/* Active Filters Badges */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 4px' }}>
          {activeFilters.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', background: 'var(--s1)', 
              border: '1px solid var(--accent)', borderRadius: '20px', 
              padding: '4px 12px', fontSize: '0.8rem', color: 'var(--text)'
            }}>
              <span style={{ fontWeight: 600, marginRight: '4px' }}>{f.label}:</span>
              <span>{f.value}</span>
              <button 
                onClick={() => setActiveFilters(activeFilters.filter(af => af.id !== f.id))}
                style={{ 
                  background: 'none', border: 'none', color: 'var(--muted)', 
                  cursor: 'pointer', marginLeft: '6px', fontSize: '0.75rem', padding: '0 2px' 
                }}
              >✕</button>
            </div>
          ))}
          <button 
            onClick={() => setActiveFilters([])}
            style={{ 
              background: 'none', border: 'none', color: 'var(--danger)', 
              fontSize: '0.8rem', cursor: 'pointer', marginLeft: '4px', textDecoration: 'underline'
            }}
          >
            Limpiar todos
          </button>
        </div>
      )}

      {/* Floating Action Bar for Bulk Selection */}
      {selectedLeads.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--s1)',
          padding: '12px 24px',
          borderRadius: '30px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          border: '1px solid var(--accent)',
          display: 'flex',
          alignItems: 'center',
          gap: '15px',
          zIndex: 1000
        }}>
          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
            {selectedLeads.size} seleccionado(s)
          </span>
          
          <select 
            value={bulkDestStage} 
            onChange={e => setBulkDestStage(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              background: 'var(--s2)',
              border: '1px solid var(--brd)',
              color: 'var(--text)',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="">-- Seleccionar Etapa --</option>
            {activeStages.map(stage => (
              <option key={stage.stage} value={stage.stage}>{stage.stage}</option>
            ))}
          </select>

          <button 
            className="btn btnsm" 
            onClick={handleBulkMove}
            disabled={!bulkDestStage}
            style={{ 
              opacity: bulkDestStage ? 1 : 0.5, 
              cursor: bulkDestStage ? 'pointer' : 'not-allowed'
            }}
          >
            🚀 Mover
          </button>
          
          <button 
            onClick={() => setSelectedLeads(new Set())}
            style={{
              background: 'none', border: 'none', color: 'var(--danger)', fontSize: '1.2rem', cursor: 'pointer', padding: '0 5px'
            }}
            title="Cancelar selección"
          >
            ✕
          </button>
        </div>
      )}

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
                </div>
                <div className="kcnt">{colLeads.length}</div>
              </div>
              <div className="kcards">
                {colLeads.map(l => {
                  const phoneSuffix = String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '').slice(-10);
                  const u = (unreads[phoneSuffix] || 0) + (unreads[l.LID] || 0);
                  return (
                    <div
                      className="kcard"
                      key={l.ID_Contacto}
                      draggable
                      onDragStart={(e) => handleDragStart(e, l.ID_Contacto)}
                      onClick={() => openDrawer(l)}
                      style={{ borderLeftColor: getAgentColor(resolveName(l.Agente_Asignado)), position: 'relative' }}
                    >
                      <input 
                        type="checkbox" 
                        checked={selectedLeads.has(l.ID_Contacto)}
                        onChange={(e) => {
                          const isChecked = e.target.checked;
                          const newSet = new Set(selectedLeads);
                          
                          if (isChecked) {
                            if (e.nativeEvent.shiftKey && lastSelectedId) {
                              const startIdx = orderedVisibleIds.indexOf(lastSelectedId);
                              const endIdx = orderedVisibleIds.indexOf(l.ID_Contacto);
                              if (startIdx !== -1 && endIdx !== -1) {
                                const start = Math.min(startIdx, endIdx);
                                const end = Math.max(startIdx, endIdx);
                                for (let i = start; i <= end; i++) {
                                  newSet.add(orderedVisibleIds[i]);
                                }
                              } else {
                                newSet.add(l.ID_Contacto);
                              }
                            } else {
                              newSet.add(l.ID_Contacto);
                            }
                            setLastSelectedId(l.ID_Contacto);
                          } else {
                            newSet.delete(l.ID_Contacto);
                            setLastSelectedId(null);
                          }
                          setSelectedLeads(newSet);
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{
                           position: 'absolute', top: '12px', right: '12px', width: '16px', height: '16px', cursor: 'pointer', zIndex: 2
                        }}
                      />
                      <div className="kname" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '25px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {l.Nombre_Persona}
                        </div>
                        {u > 0 && (
                          <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                            {u}
                          </span>
                        )}
                      </div>
                      
                      <div className="kmeta">
                        {l.Estado_Funnel === 'Congelado' && <span className="ct">❄️ Congelado</span>}
                      </div>
                      
                      {/* Show assigned agent on card when manager views "todos" */}
                      {isManager && agentFilter === 'todos' && l.Agente_Asignado && (
                        <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span>👤</span> {resolveName(l.Agente_Asignado)}
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
