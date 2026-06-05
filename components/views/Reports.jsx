import React, { useState, useMemo } from 'react';

export default function Reports({ leads, cfg }) {
  const [period, setPeriod] = useState('este_mes'); // hoy, ayer, esta_semana, este_mes, todo
  const [agent, setAgent] = useState('todos');

  // Extract unique agents from leads
  const allAgents = useMemo(() => {
    const s = new Set();
    leads.forEach(l => {
      if (l.Agente_Asignado) s.add(l.Agente_Asignado);
    });
    return Array.from(s).sort();
  }, [leads]);

  // Main calculations
  const { currentMetrics, previousMetrics, chartData } = useMemo(() => {
    const now = new Date();
    // Normalize today to start of day
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let currentStart = new Date(0);
    let currentEnd = new Date('2099-01-01');
    let prevStart = new Date(0);
    let prevEnd = new Date(0);
    let groupByKey = 'day'; // day, month, hour

    if (period === 'hoy') {
      currentStart = startOfToday;
      prevStart = new Date(startOfToday.getTime() - 86400000);
      prevEnd = startOfToday;
      groupByKey = 'hour';
    } else if (period === 'ayer') {
      currentStart = new Date(startOfToday.getTime() - 86400000);
      currentEnd = startOfToday;
      prevStart = new Date(currentStart.getTime() - 86400000);
      prevEnd = currentStart;
      groupByKey = 'hour';
    } else if (period === 'esta_semana') {
      const day = now.getDay() || 7; // 1-7
      currentStart = new Date(startOfToday.getTime() - (day - 1) * 86400000);
      prevStart = new Date(currentStart.getTime() - 7 * 86400000);
      prevEnd = currentStart;
    } else if (period === 'este_mes') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = currentStart;
    }

    // Agent filter
    const targetLeads = agent === 'todos' ? leads : leads.filter(l => l.Agente_Asignado === agent);

    const getLeadDate = (l) => {
      const dStr = l.Fecha_Registro || l.Timestamp || l.Fecha || l.Fecha_Creacion || l.CreatedAt;
      if (!dStr) return null; // Default to old/null if no date
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const isWon = (l) => {
      // Assuming last stage of funnel is "Ganado" or similar.
      const lastStage = cfg.funnel ? cfg.funnel[cfg.funnel.length - 1].stage : 'Cierre';
      return l.Estado_Funnel === lastStage || String(l.Estado_Funnel).toLowerCase().includes('ganado');
    };

    const isLost = (l) => {
      const state = String(l.Estado_Funnel || '').toLowerCase();
      return state.includes('perdido') || state.includes('congelado') || state.includes('descartado');
    };

    let currNuevos = 0, currGanados = 0, currPerdidos = 0;
    let prevNuevos = 0, prevGanados = 0, prevPerdidos = 0;

    const chartBuckets = {};

    targetLeads.forEach(l => {
      const d = getLeadDate(l);
      if (!d) return;

      const t = d.getTime();
      
      // Current Period
      if (t >= currentStart.getTime() && t < currentEnd.getTime()) {
        currNuevos++;
        if (isWon(l)) currGanados++;
        if (isLost(l)) currPerdidos++;

        // Chart grouping
        let key = '';
        if (groupByKey === 'hour') {
          key = d.getHours() + ':00';
        } else if (groupByKey === 'month') {
          key = d.toLocaleString('default', { month: 'short' });
        } else {
          key = d.getDate() + '/' + (d.getMonth()+1);
        }
        if (!chartBuckets[key]) chartBuckets[key] = { nuevos: 0, ganados: 0 };
        chartBuckets[key].nuevos++;
        if (isWon(l)) chartBuckets[key].ganados++;
      }
      
      // Previous Period
      else if (t >= prevStart.getTime() && t < prevEnd.getTime()) {
        prevNuevos++;
        if (isWon(l)) prevGanados++;
        if (isLost(l)) prevPerdidos++;
      }
    });

    const formatChart = Object.keys(chartBuckets).map(k => ({
      name: k,
      nuevos: chartBuckets[k].nuevos,
      ganados: chartBuckets[k].ganados
    }));

    return {
      currentMetrics: { nuevos: currNuevos, ganados: currGanados, perdidos: currPerdidos },
      previousMetrics: { nuevos: prevNuevos, ganados: prevGanados, perdidos: prevPerdidos },
      chartData: formatChart
    };
  }, [leads, cfg, period, agent]);

  const calcGrowth = (curr, prev) => {
    if (prev === 0) return curr > 0 ? '+100%' : '0%';
    const pct = ((curr - prev) / prev) * 100;
    return (pct > 0 ? '+' : '') + pct.toFixed(1) + '%';
  };

  const getGrowthColor = (curr, prev) => {
    if (curr > prev) return '#10b981'; // green
    if (curr < prev) return '#ef4444'; // red
    return 'var(--muted)';
  };

  const currWinRate = currentMetrics.nuevos ? ((currentMetrics.ganados / currentMetrics.nuevos) * 100).toFixed(1) : 0;
  const prevWinRate = previousMetrics.nuevos ? ((previousMetrics.ganados / previousMetrics.nuevos) * 100).toFixed(1) : 0;

  // Render simple bar chart
  const maxBarValue = Math.max(1, ...chartData.map(d => d.nuevos));

  return (
    <div className="view on" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      
      {/* Header & Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text)' }}>📊 Reportes Analíticos</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Métricas basadas en las fechas de registro de los prospectos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <select 
            value={agent} 
            onChange={e => setAgent(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', outline: 'none' }}
          >
            <option value="todos">Todo el Equipo</option>
            {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select 
            value={period} 
            onChange={e => setPeriod(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', outline: 'none' }}
          >
            <option value="hoy">Hoy</option>
            <option value="ayer">Ayer</option>
            <option value="esta_semana">Esta Semana</option>
            <option value="este_mes">Este Mes</option>
            <option value="todo">Todo el Tiempo</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        
        {/* Card 1: Nuevos Leads */}
        <div style={{ background: 'var(--s1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--brd)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Nuevos Contactos</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)' }}>{currentMetrics.nuevos}</div>
          {period !== 'todo' && (
            <div style={{ fontSize: '0.8rem', color: getGrowthColor(currentMetrics.nuevos, previousMetrics.nuevos), marginTop: '8px', fontWeight: 600 }}>
              {calcGrowth(currentMetrics.nuevos, previousMetrics.nuevos)} <span style={{color: 'var(--muted)', fontWeight: 400}}>vs periodo anterior</span>
            </div>
          )}
        </div>

        {/* Card 2: Win Rate */}
        <div style={{ background: 'var(--s1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--brd)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Tasa de Cierre (Win Rate)</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)' }}>{currWinRate}%</div>
          {period !== 'todo' && (
            <div style={{ fontSize: '0.8rem', color: getGrowthColor(currWinRate, prevWinRate), marginTop: '8px', fontWeight: 600 }}>
              {prevWinRate}% <span style={{color: 'var(--muted)', fontWeight: 400}}>en el periodo anterior</span>
            </div>
          )}
        </div>

        {/* Card 3: Leads Perdidos */}
        <div style={{ background: 'var(--s1)', padding: '20px', borderRadius: '12px', border: '1px solid var(--brd)', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', textTransform: 'uppercase' }}>Descartados / Congelados</div>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text)' }}>{currentMetrics.perdidos}</div>
          {period !== 'todo' && (
            <div style={{ fontSize: '0.8rem', color: getGrowthColor(previousMetrics.perdidos, currentMetrics.perdidos), marginTop: '8px', fontWeight: 600 }}>
              {calcGrowth(currentMetrics.perdidos, previousMetrics.perdidos)} <span style={{color: 'var(--muted)', fontWeight: 400}}>vs periodo anterior</span>
            </div>
          )}
        </div>

      </div>

      {/* Chart Section */}
      <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '12px', border: '1px solid var(--brd)' }}>
        <h3 style={{ margin: '0 0 24px 0', fontSize: '1.2rem', color: 'var(--text)' }}>
          Volumen de Contactos ({period.replace('_', ' ')})
        </h3>
        
        {chartData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)' }}>
            No hay suficientes datos con fecha en este periodo.
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', height: '250px', gap: '12px', overflowX: 'auto', paddingBottom: '10px' }}>
            {chartData.map((d, i) => {
              const heightPct = Math.max((d.nuevos / maxBarValue) * 100, 2); // min 2% to show at least a bump
              return (
                <div key={i} style={{ flex: '1', minWidth: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <div style={{ 
                    width: '100%', 
                    height: `${heightPct}%`, 
                    background: 'var(--accent)', 
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease',
                    position: 'relative',
                    opacity: 0.85
                  }} title={`${d.nuevos} Nuevos, ${d.ganados} Ganados`}>
                    {d.nuevos > 0 && (
                      <div style={{ position: 'absolute', top: '-22px', width: '100%', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text)' }}>
                        {d.nuevos}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {d.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
