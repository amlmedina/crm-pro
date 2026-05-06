'use client';

import { useState, useMemo, useEffect } from 'react';

export default function Directory({ 
  leads, cfg, user, openDrawer, hideUnknowns, unknownsOnly, unreads, threads,
  selectedForCampaign = [], setSelectedForCampaign, onGoToCampaign, isCensored
}) {
  const [q, setQ] = useState('');
  const [cpOpen, setCpOpen] = useState(false);
  const [sortCol, setSortCol] = useState('ID_Contacto');
  const [sortAsc, setSortAsc] = useState(true);

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

    if (q.trim()) {
      const qs = q.toLowerCase();
      fullList = fullList.filter(l => 
        Object.values(l).some(v => v && String(v).toLowerCase().includes(qs))
      );
    }
    
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

  // KPIs
  const totalActivos = leads.filter(l => l.Estado_Funnel && l.Estado_Funnel !== 'Congelado').length;
  const ganados = leads.filter(l => l.Estado_Funnel && l.Estado_Funnel.toLowerCase().includes('ganado')).length;
  const enProceso = leads.filter(l => l.Estado_Funnel && !l.Estado_Funnel.toLowerCase().includes('ganado') && l.Estado_Funnel !== 'Congelado').length;
  const congelados = leads.filter(l => l.Estado_Funnel === 'Congelado').length;

  return (
    <div className="view on" style={{ display: 'flex', flexDirection: 'column' }}>
      <div id="dash">
        <div className="dc cg"><div className="lbl">Base Activa</div><div className="val">{totalActivos}</div></div>
        <div className="dc cb"><div className="lbl">En Proceso</div><div className="val">{enProceso}</div></div>
        <div className="dc cg"><div className="lbl">Ganados</div><div className="val">{ganados}</div></div>
        <div className="dc cr"><div className="lbl">Congelados SLA</div><div className="val">{congelados}</div></div>
      </div>

      <div style={{ padding: '0 20px', display: selectedForCampaign.length > 0 ? 'block' : 'none' }}>
        <div style={{ background: 'var(--s1)', border: '1px solid var(--brd)', padding: '10px 15px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
           <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{selectedForCampaign.length} contactos seleccionados</span>
           <div style={{ display: 'flex', gap: '10px' }}>
             <button className="btn btnr" onClick={() => setSelectedForCampaign([])}>Descartar</button>
             <button className="btn btng" onClick={onGoToCampaign}>📣 Crear Campaña</button>
           </div>
        </div>
      </div>

      <div id="toolbar">
        <input type="text" id="q" placeholder="🔍 Buscar por nombre, empresa..." value={q} onChange={e => setQ(e.target.value)} />
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
                    phone, 
                    nombre: l.Nombre_Persona, 
                    empresa: l.Nombre_Empresa 
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
                    const phoneSuffix = String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '').slice(-10);
                    const lidId = l.LID;
                    const u = (unreads[phoneSuffix] || 0) + (unreads[lidId] || 0);
                    
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
