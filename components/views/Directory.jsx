'use client';

import { useState, useMemo, useEffect } from 'react';

export default function Directory({ 
  leads, cfg, user, openDrawer, hideUnknowns, unknownsOnly, unreads, threads,
  selectedForCampaign = [], setSelectedForCampaign, onGoToCampaign, isCensored
}) {
  const [q, setQ] = useState('');
  const [searchField, setSearchField] = useState('todos');
  const [activeFilters, setActiveFilters] = useState([]);
  const [selectedValues, setSelectedValues] = useState([]); // array, not Set — avoids React stale closure issues
  const [cpOpen, setCpOpen] = useState(false);
  const [sortCol, setSortCol] = useState('ID_Contacto');
  const [sortAsc, setSortAsc] = useState(true);

  const filterOptions = useMemo(() => {
    return [
      { key: 'todos', label: 'Todos los campos' },
      { key: 'Nombre_Persona', label: 'Nombre' },
      { key: 'Telefono', label: 'Teléfono' },
      { key: 'Correo_Corp', label: 'Correo' },
      ...(cfg.camposPersonalizados || []).map(c => ({ key: c.key, label: c.label, tipo: c.tipo, opciones: c.opciones }))
    ];
  }, [cfg]);


  // Helper for cleaning phone (same as API)
  const cleanPhoneStr = (p) => String(p || '').replace(/[\s\-\+\(\)]/g, '');

  // Default cols + custom cols
  const baseCols = [
    { key: 'ID_Contacto', label: 'ID' },
    { key: 'Nombre_Persona', label: 'Nombre' },
    { key: 'Telefono', label: 'Teléfono' },
    { key: 'Correo_Corp', label: 'Correo' },
    { key: 'Estado_Funnel', label: 'Etapa' }
  ];
  
  const allCols = [
    ...baseCols,
    ...(cfg.camposPersonalizados || []).map(c => ({ key: c.key, label: c.label }))
  ];

  const [visCols, setVisCols] = useState(baseCols.map(c => c.key));

  function toggleCol(key) {
    if (visCols.includes(key)) {
      if (visCols.length <= 2) return; // Mínimo 2 columnas
      setVisCols(visCols.filter(k => k !== key));
    } else {
      setVisCols([...visCols, key]);
    }
  }

  function doSort(key) {
    if (sortCol === key) setSortAsc(!sortAsc);
    else { setSortCol(key); setSortAsc(true); }
  }

  const filtered = useMemo(() => {
    // 1. Identify "Unknown" numbers that have an active thread but no lead
    const leadPhones = new Set(leads.map(l => cleanPhoneStr(l.Telefono).slice(-10)));
    
    const unknownLeads = threads
      .filter(t => {
        const suffix = t.id.slice(-10);
        return !leadPhones.has(suffix);
      })
      .map(t => {
         const dn = t.pushName ? `${t.pushName} [LID]` : `Desconocido (${t.id})`;
         return {
           ID_Contacto: `unk_${t.id}`,
           Nombre_Persona: dn,
           Nombre_Empresa: 'No registrado',
           Telefono: t.id,
           Estado_Funnel: 'Desconocido',
           isUnknown: true
         };
      });

    // 2. Merge actual leads + unknown leads based on props
    let fullList = [];
    if (unknownsOnly) {
       fullList = unknownLeads.filter(l => l.Estado_Funnel !== 'Congelado');
    } else if (hideUnknowns) {
       fullList = leads.filter(l => l.Estado_Funnel !== 'Congelado');
    } else {
       fullList = [...leads, ...unknownLeads].filter(l => l.Estado_Funnel !== 'Congelado');
    }

    // Filter by activeFilters and q
    fullList = fullList.filter(l => {
      let matchSearch = true;

      const filtersByField = {};
      activeFilters.forEach(f => {
        if (!filtersByField[f.field]) filtersByField[f.field] = [];
        filtersByField[f.field].push(f);
      });

      for (const field in filtersByField) {
        const groupFilters = filtersByField[field];
        let matchField = false;

        for (const f of groupFilters) {
          const s = f.value;
          if (field === 'todos') {
            const match = Object.values(l).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(s.toLowerCase()));
            if (match) { matchField = true; break; }
          } else {
            const val = l[field];
            // Exact match for select-type values, partial for text
            const match = val !== null && val !== undefined && String(val).toLowerCase() === s.toLowerCase();
            if (match) { matchField = true; break; }
          }
        }
        if (!matchField) { matchSearch = false; break; }
      }

      if (matchSearch && q.trim()) {
        const s = q.trim().toLowerCase();
        if (searchField === 'todos') {
          const match = Object.values(l).some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(s));
          if (!match) matchSearch = false;
        } else {
          const val = l[searchField];
          const match = val !== null && val !== undefined && String(val).toLowerCase().includes(s);
          if (!match) matchSearch = false;
        }
      }

      return matchSearch;
    });
    
    fullList.sort((a, b) => {
      let va = a[sortCol] || '';
      let vb = b[sortCol] || '';
      if (!isNaN(va) && !isNaN(vb)) { va = Number(va); vb = Number(vb); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return fullList;
  }, [leads, unreads, threads, q, sortCol, sortAsc]);

  function getBadge(status) {
    if (!status) return <span className="badge bm">-</span>;
    if (status.includes('Lead') || status.includes('Prospecto')) return <span className="badge bb">{status}</span>;
    if (status.includes('Ganado') || status.includes('Cierre')) return <span className="badge bg">{status}</span>;
    if (status.includes('Perdido') || status.includes('Cancelado')) return <span className="badge br">{status}</span>;
    return <span className="badge by">{status}</span>; // warning defaults
  }


  return (
    <div className="view on" style={{ display: 'flex', flexDirection: 'column' }}>

      <div style={{ padding: '0 20px', display: selectedForCampaign.length > 0 ? 'block' : 'none' }}>
        <div style={{ background: 'var(--s1)', border: '1px solid var(--brd)', padding: '10px 15px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
           <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedForCampaign.length} contactos seleccionados</span>
           <div style={{ display: 'flex', gap: '10px' }}>
             <button className="btn btnr" onClick={() => setSelectedForCampaign([])}>Descartar</button>
             <button className="btn btng" onClick={onGoToCampaign}>📣 Crear Campaña</button>
           </div>
        </div>
      </div>

      <div id="toolbar" style={{ flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: '300px', display: 'flex', alignItems: 'center', background: 'var(--s1)', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--brd)', boxShadow: '0 2px 6px rgba(0,0,0,0.05)', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '1.1rem' }}>🔍</span>
          
          <select 
            value={searchField}
            onChange={e => {
              setSearchField(e.target.value);
              setQ('');
              setSelectedValues([]);
            }}
            style={{ 
              background: 'var(--s2)', border: '1px solid var(--brd)', outline: 'none', 
              fontSize: '0.85rem', color: 'var(--text)', cursor: 'pointer',
              padding: '4px 8px', borderRadius: '6px'
            }}
          >
            {filterOptions.map(opt => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>

          {(() => {
            const selectedOpt = filterOptions.find(o => o.key === searchField);
            const chipOptions = selectedOpt?.tipo === 'select'
              ? (selectedOpt.opciones || [])
              : selectedOpt?.tipo === 'bool'
              ? ['Sí', 'No']
              : null;

            if (chipOptions) {
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', flex: 1 }}>
                  {chipOptions.map(o => {
                    const isSelected = selectedValues.includes(o);
                    return (
                      <button
                        key={o}
                        onClick={() => {
                          setSelectedValues(prev =>
                            prev.includes(o) ? prev.filter(v => v !== o) : [...prev, o]
                          );
                        }}
                        style={{
                          padding: '4px 12px', borderRadius: '14px', fontSize: '0.78rem',
                          border: `2px solid ${isSelected ? 'var(--navy)' : 'var(--brd)'}`,
                          background: isSelected ? 'var(--navy)' : 'transparent',
                          color: isSelected ? '#fff' : 'var(--text)',
                          cursor: 'pointer', fontWeight: isSelected ? 700 : 400,
                          transition: 'all 0.15s',
                          boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.18)' : 'none'
                        }}
                      >
                        {isSelected ? '✓ ' : ''}{o}
                      </button>
                    );
                  })}
                </div>
              );
            }

            return (
              <input
                type="text"
                placeholder="Buscar contacto..."
                value={q}
                onChange={e => setQ(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && q.trim()) {
                    e.preventDefault();
                    const selectedOpt = filterOptions.find(o => o.key === searchField);
                    setActiveFilters([...activeFilters, {
                      id: Date.now(), field: searchField,
                      label: selectedOpt?.label || 'Filtro', value: q.trim()
                    }]);
                    setQ('');
                  }
                }}
                style={{ flex: 1, minWidth: '120px', background: 'transparent', border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text)', padding: '4px 0' }}
              />
            );
          })()}
          
          {q && (
            <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.85rem' }} title="Limpiar">✕</button>
          )}

          <button 
            onClick={() => {
              const selectedOpt = filterOptions.find(o => o.key === searchField);
              if (selectedValues.length > 0) {
                const newPills = selectedValues.map(val => ({
                  id: Date.now() + Math.random(),
                  field: searchField,
                  label: selectedOpt?.label || 'Filtro',
                  value: val
                }));
                setActiveFilters([...activeFilters, ...newPills]);
                setSelectedValues([]);
              } else if (q.trim()) {
                setActiveFilters([...activeFilters, {
                  id: Date.now(), field: searchField,
                  label: selectedOpt?.label || 'Filtro', value: q.trim()
                }]);
                setQ('');
              }
            }} 
            style={{ 
              background: (selectedValues.length > 0 || q.trim()) ? 'var(--navy)' : 'var(--brd)', 
              border: 'none', cursor: (selectedValues.length > 0 || q.trim()) ? 'pointer' : 'not-allowed', 
              color: '#fff', fontSize: '1.2rem', padding: '0 10px', borderRadius: '6px', 
              height: '28px', display: 'flex', alignItems: 'center', flexShrink: 0,
              opacity: (selectedValues.length > 0 || q.trim()) ? 1 : 0.5
            }}
            title="Añadir Filtro"
          >
            +
          </button>
        </div>
        <div id="cpwrap">
          <button className="btn btngh" onClick={() => setCpOpen(!cpOpen)}>Columnas ▼</button>
          {cpOpen && (
            <div id="cpicker" style={{ display: 'block' }}>
              {allCols.map(c => (
                <label key={c.key}>
                  <input type="checkbox" checked={visCols.includes(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <button className="btn btng" onClick={() => openDrawer()}>+ Nuevo Prospecto</button>
      </div>

      {/* Active Filters Badges */}
      {activeFilters.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', padding: '0 20px', marginBottom: '15px' }}>
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

      <div id="twrap">
        <table id="tbl">
          <thead>
            <tr>
              {allCols.filter(c => visCols.includes(c.key)).map(c => (
                <th key={c.key} onClick={() => doSort(c.key)}>
                  {c.label} {sortCol === c.key ? (sortAsc ? '▲' : '▼') : ''}
                </th>
              ))}
              <th style={{ width: '40px' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => {
              const phone = l.Telefono || l.ID_Contacto;
              const isSelected = selectedForCampaign.some(c => c.phone === phone);
              
              const toggleS = (e) => {
                e.stopPropagation();
                if (isSelected) {
                  setSelectedForCampaign(selectedForCampaign.filter(c => c.phone !== phone));
                } else {
                  if (selectedForCampaign.length >= 50) return;
                  setSelectedForCampaign([...selectedForCampaign, { 
                    ...l, 
                    phone // Ensure phone is present as the key identifier
                  }]);
                }
              };

              return (
              <tr key={l.ID_Contacto} onClick={() => openDrawer(l)} style={{ background: isSelected ? 'rgba(var(--accent-rgb), 0.05)' : '' }}>
                {allCols.filter(c => visCols.includes(c.key)).map(c => {
                  let val = l[c.key];
                  if (isCensored && isCensored(c.key)) {
                    val = val ? '••••••••••' : '';
                  }

                  if (c.key === 'Estado_Funnel') return <td key={c.key}>{getBadge(val)}</td>;
                  if (c.key === 'Nombre_Persona') {
                    const phoneSuffix = cleanPhoneStr(l.Telefono).slice(-10);
                    const lidId = l.LID;
                    const unreadKey = Object.keys(unreads || {}).find(k => 
                      (lidId && k === lidId) || 
                      (phoneSuffix && phoneSuffix.length >= 10 && k.includes(phoneSuffix))
                    );
                    const u = unreadKey ? unreads[unreadKey] : 0;
                    
                    return (
                      <td key={c.key}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {val}
                          {u > 0 && (
                            <span style={{ background: '#ef4444', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                              {u}
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  }
                  return <td key={c.key}>{val}</td>;
                })}
                <td onClick={toggleS}>
                  <input type="checkbox" checked={isSelected} onChange={() => {}} />
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visCols.length} style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
                  Aún no hay registros en la vista.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
