'use client';

import { useState, useMemo, useEffect } from 'react';

export default function Directory({ leads, cfg, user, openDrawer, hideUnknowns, unknownsOnly }) {
  const [q, setQ] = useState('');
  const [cpOpen, setCpOpen] = useState(false);
  const [sortCol, setSortCol] = useState('ID_Contacto');
  const [sortAsc, setSortAsc] = useState(true);

  // Unread WA messages & Active Threads
  const [unreads, setUnreads] = useState({});
  const [threads, setThreads] = useState([]);

  useEffect(() => {
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
        if (dataT && Array.isArray(dataT)) setThreads(dataT);
      } catch {}
    };
    fetchWAData();
    const interval = setInterval(fetchWAData, 8000);
    return () => clearInterval(interval);
  }, []);

  // Helper for cleaning phone (same as API)
  const cleanPhoneStr = (p) => String(p || '').replace(/[\s\-\+\(\)]/g, '');

  // Default cols + custom cols
  const baseCols = [
    { key: 'ID_Contacto', label: 'ID' },
    { key: 'Nombre_Persona', label: 'Nombre' },
    { key: 'Nombre_Empresa', label: 'Empresa' },
    { key: 'Puesto', label: 'Puesto' },
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
      .filter(tNum => {
        const suffix = tNum.slice(-10);
        return !leadPhones.has(suffix);
      })
      .map(tNum => ({
        ID_Contacto: `unk_${tNum}`,
        Nombre_Persona: `Desconocido (${tNum})`,
        Nombre_Empresa: 'No registrado',
        Telefono: tNum,
        Estado_Funnel: 'Desconocido',
        isUnknown: true
      }));

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
  }, [leads, unreads, q, sortCol, sortAsc]);

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
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={l.ID_Contacto} onClick={() => openDrawer(l)}>
                {allCols.filter(c => visCols.includes(c.key)).map(c => {
                  const val = l[c.key];
                  if (c.key === 'Estado_Funnel') return <td key={c.key}>{getBadge(val)}</td>;
                  if (c.key === 'Nombre_Persona') {
                    const phone = String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '').slice(-10);
                    const u = unreads[phone];
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
              </tr>
            ))}
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
