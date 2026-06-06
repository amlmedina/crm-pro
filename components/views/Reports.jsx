import React, { useState, useMemo, useEffect } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Reports({ leads, cfg, setCfg }) {
  const [period, setPeriod] = useState('este_mes'); // hoy, ayer, esta_semana, este_mes, todo
  const [agent, setAgent] = useState('todos');

  // Form states for sales goals
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [targetNuevos, setTargetNuevos] = useState(50);
  const [targetCierres, setTargetCierres] = useState(10);
  const [targetWinRate, setTargetWinRate] = useState(20);
  const [savingGoals, setSavingGoals] = useState(false);

  // Sync state with global config
  useEffect(() => {
    if (cfg && cfg.objetivos) {
      setTargetNuevos(cfg.objetivos.nuevosLeads || 50);
      setTargetCierres(cfg.objetivos.cierresGanados || 10);
      setTargetWinRate(cfg.objetivos.winRate || 20);
    }
  }, [cfg]);

  // Extract unique agents from leads
  const allAgents = useMemo(() => {
    const s = new Set();
    leads.forEach(l => {
      if (l.Agente_Asignado) s.add(l.Agente_Asignado);
    });
    return Array.from(s).sort();
  }, [leads]);

  // Date bounds and calculations
  const { currentMetrics, previousMetrics, chartData } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    let currentStart = new Date(0);
    let currentEnd = new Date('2099-01-01');
    let prevStart = new Date(0);
    let prevEnd = new Date(0);
    let groupByKey = 'day'; // day, hour

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
      const day = now.getDay() || 7; // 1-7 (Mon-Sun)
      currentStart = new Date(startOfToday.getTime() - (day - 1) * 86400000);
      prevStart = new Date(currentStart.getTime() - 7 * 86400000);
      prevEnd = currentStart;
    } else if (period === 'este_mes') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      prevEnd = currentStart;
    }

    const targetLeads = agent === 'todos' ? leads : leads.filter(l => l.Agente_Asignado === agent);

    const getLeadDate = (l) => {
      const dStr = l.Fecha_Registro || l.Timestamp || l.Fecha || l.Fecha_Creacion || l.CreatedAt;
      if (!dStr) return null;
      const d = new Date(dStr);
      return isNaN(d.getTime()) ? null : d;
    };

    const isWon = (l) => {
      const stageCfg = cfg.funnel?.find(fs => fs.stage === l.Estado_Funnel);
      if (stageCfg && stageCfg.type) {
        return stageCfg.type === 'ganada';
      }
      const lastStage = cfg.funnel && cfg.funnel.length > 0 ? cfg.funnel[cfg.funnel.length - 1].stage : 'Cierre';
      return l.Estado_Funnel === lastStage || String(l.Estado_Funnel || '').toLowerCase().includes('ganado');
    };

    const isLost = (l) => {
      const stageCfg = cfg.funnel?.find(fs => fs.stage === l.Estado_Funnel);
      if (stageCfg && stageCfg.type) {
        return stageCfg.type === 'perdida';
      }
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

        let key = '';
        if (groupByKey === 'hour') {
          key = d.getHours() + ':00';
        } else if (groupByKey === 'month') {
          key = d.toLocaleString('default', { month: 'short' });
        } else {
          key = d.getDate() + '/' + (d.getMonth() + 1);
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

  // Goal calculations adapt to period length
  const getProportionalTarget = (monthlyTarget) => {
    if (period === 'hoy' || period === 'ayer') {
      return Math.max(1, Math.round(monthlyTarget / 30));
    }
    if (period === 'esta_semana') {
      return Math.max(1, Math.round((monthlyTarget / 30) * 7));
    }
    return monthlyTarget; // este_mes, todo
  };

  const goals = useMemo(() => {
    const rawNuevos = cfg.objetivos?.nuevosLeads || 50;
    const rawCierres = cfg.objetivos?.cierresGanados || 10;
    const rawWinRate = cfg.objetivos?.winRate || 20;

    return {
      nuevos: getProportionalTarget(rawNuevos),
      cierres: getProportionalTarget(rawCierres),
      winRate: rawWinRate
    };
  }, [cfg, period]);

  const saveGoalsHandler = async () => {
    setSavingGoals(true);
    try {
      const nuevosObjetivos = {
        nuevosLeads: Number(targetNuevos),
        cierresGanados: Number(targetCierres),
        winRate: Number(targetWinRate)
      };
      const newCfg = {
        ...cfg,
        objetivos: nuevosObjetivos
      };
      await api('saveConfig', { configData: newCfg });
      if (setCfg) setCfg(newCfg);
      setShowGoalForm(false);
      Swal.fire({
        title: '¡Objetivos Guardados!',
        text: 'Los objetivos comerciales se han guardado con éxito.',
        icon: 'success',
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err) {
      Swal.fire({
        title: 'Error al guardar',
        text: err.message || 'Ocurrió un error inesperado.',
        icon: 'error'
      });
    } finally {
      setSavingGoals(false);
    }
  };

  // Funnel Stage Metrics
  const funnelStages = cfg.funnel || [];
  const funnelData = useMemo(() => {
    const counts = {};
    funnelStages.forEach(fs => { counts[fs.stage] = 0; });
    
    const targetLeads = agent === 'todos' ? leads : leads.filter(l => l.Agente_Asignado === agent);
    targetLeads.forEach(l => {
      if (counts[l.Estado_Funnel] !== undefined) {
        counts[l.Estado_Funnel]++;
      }
    });

    const totalInFunnel = targetLeads.length;

    return funnelStages.map((fs, idx) => {
      const qty = counts[fs.stage] || 0;
      const pctOfTotal = totalInFunnel ? ((qty / totalInFunnel) * 100).toFixed(0) : 0;
      let conversionRate = 100;
      if (idx > 0) {
        const prevQty = counts[funnelStages[idx - 1].stage] || 0;
        conversionRate = prevQty ? ((qty / prevQty) * 100).toFixed(0) : 0;
      }
      return {
        stage: fs.stage,
        cantidad: qty,
        pctOfTotal,
        conversionRate
      };
    });
  }, [leads, funnelStages, agent]);

  // Agent performance metrics
  const agentPerformance = useMemo(() => {
    const performanceMap = {};

    leads.forEach(l => {
      const agName = l.Agente_Asignado || 'Sin Asignar';
      if (!performanceMap[agName]) {
        performanceMap[agName] = {
          name: agName,
          total: 0,
          ganados: 0,
          perdidos: 0,
          activos: 0
        };
      }
      performanceMap[agName].total++;
      
      const stageCfg = cfg.funnel?.find(fs => fs.stage === l.Estado_Funnel);
      let isWon = false;
      let isLost = false;

      if (stageCfg && stageCfg.type) {
        isWon = stageCfg.type === 'ganada';
        isLost = stageCfg.type === 'perdida';
      } else {
        const lastStage = cfg.funnel && cfg.funnel.length > 0 ? cfg.funnel[cfg.funnel.length - 1].stage : 'Cierre';
        isWon = l.Estado_Funnel === lastStage || String(l.Estado_Funnel || '').toLowerCase().includes('ganado');
        const state = String(l.Estado_Funnel || '').toLowerCase();
        isLost = state.includes('perdido') || state.includes('congelado') || state.includes('descartado');
      }
      
      if (isWon) {
        performanceMap[agName].ganados++;
      } else if (isLost) {
        performanceMap[agName].perdidos++;
      } else {
        performanceMap[agName].activos++;
      }
    });

    const rawList = Object.values(performanceMap);
    const totalCompanyWon = rawList.reduce((acc, curr) => acc + curr.ganados, 0);

    return rawList.map(item => {
      const winRate = item.total ? ((item.ganados / item.total) * 100).toFixed(1) : 0;
      const contribution = totalCompanyWon ? ((item.ganados / totalCompanyWon) * 100).toFixed(0) : 0;
      return {
        ...item,
        winRate,
        contribution
      };
    }).sort((a, b) => b.ganados - a.ganados);
  }, [leads, cfg]);

  // General KPI values
  const currWinRate = currentMetrics.nuevos ? ((currentMetrics.ganados / currentMetrics.nuevos) * 100).toFixed(1) : 0;
  const prevWinRate = previousMetrics.nuevos ? ((previousMetrics.ganados / previousMetrics.nuevos) * 100).toFixed(1) : 0;

  const calcGrowth = (curr, prev) => {
    if (prev === 0) return curr > 0 ? '+100%' : '0%';
    const pct = ((curr - prev) / prev) * 100;
    return (pct > 0 ? '▲ +' : '▼ ') + pct.toFixed(1) + '%';
  };

  const getGrowthColor = (curr, prev) => {
    if (curr > prev) return 'var(--green)';
    if (curr < prev) return 'var(--red)';
    return 'var(--muted)';
  };

  const maxBarValue = Math.max(1, ...chartData.map(d => d.nuevos));

  return (
    <div className="view on" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header section */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--brd)', paddingBottom: '16px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.7rem', fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            📈 Dashboard Comercial
          </h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>
            Rendimiento del pipeline de ventas, objetivos del equipo y agentes asignados.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select 
            value={agent} 
            onChange={e => setAgent(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', outline: 'none', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <option value="todos">👥 Todo el Equipo</option>
            {allAgents.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <select 
            value={period} 
            onChange={e => setPeriod(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s1)', color: 'var(--text)', outline: 'none', fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}
          >
            <option value="hoy">📅 Hoy</option>
            <option value="ayer">📅 Ayer</option>
            <option value="esta_semana">📅 Esta Semana</option>
            <option value="este_mes">📅 Este Mes</option>
            <option value="todo">📅 Todo el Tiempo</option>
          </select>

          <button 
            onClick={() => setShowGoalForm(!showGoalForm)}
            style={{
              padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--accent)',
              background: showGoalForm ? 'var(--accent)' : 'transparent',
              color: showGoalForm ? '#fff' : 'var(--text)',
              fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            🎯 {showGoalForm ? 'Cerrar Objetivos' : 'Fijar Objetivos'}
          </button>
        </div>
      </div>

      {/* Goal Edit Panel */}
      {showGoalForm && (
        <div className="acard" style={{ 
          background: 'var(--s1)', border: '1px solid var(--accent)', borderRadius: '12px', padding: '20px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.06)', animation: 'slideDown 0.3s ease', borderLeft: '5px solid var(--accent)'
        }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>🎯 Objetivos Mensuales de Ventas</h3>
          <p style={{ margin: '0 0 16px 0', color: 'var(--muted)', fontSize: '0.78rem' }}>Establece los objetivos comerciales mensuales globales. Se ajustarán automáticamente en los KPIs según el período visualizado.</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)' }}>Nuevos Leads (Mes):</label>
              <input 
                type="number" 
                value={targetNuevos} 
                onChange={e => setTargetNuevos(Number(e.target.value))} 
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)' }}>Ventas Ganadas (Mes):</label>
              <input 
                type="number" 
                value={targetCierres} 
                onChange={e => setTargetCierres(Number(e.target.value))} 
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)' }}>Tasa de Cierre / Win Rate (%):</label>
              <input 
                type="number" 
                value={targetWinRate} 
                onChange={e => setTargetWinRate(Number(e.target.value))} 
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'var(--s2)', color: 'var(--text)', outline: 'none' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button 
              onClick={() => setShowGoalForm(false)} 
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--brd)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: '0.82rem' }}
            >
              Cancelar
            </button>
            <button 
              onClick={saveGoalsHandler} 
              disabled={savingGoals}
              style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {savingGoals ? 'Guardando...' : '💾 Guardar Objetivos'}
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        {/* Card 1: Nuevos Leads */}
        <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '14px', border: '1px solid var(--brd)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', tracking: '0.05em' }}>Nuevos Leads</span>
              <span style={{ fontSize: '1.2rem' }}>📈</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{currentMetrics.nuevos}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>/ meta: {goals.nuevos}</span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            {/* Progress Bar */}
            <div style={{ height: '6px', background: 'var(--s2)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.min(100, (currentMetrics.nuevos / goals.nuevos) * 100)}%`, 
                background: 'var(--accent)', 
                borderRadius: '4px',
                transition: 'width 0.5s ease-out'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {goals.nuevos > 0 ? ((currentMetrics.nuevos / goals.nuevos) * 100).toFixed(0) : 0}% logrado
              </span>
              {period !== 'todo' && (
                <span style={{ color: getGrowthColor(currentMetrics.nuevos, previousMetrics.nuevos), fontWeight: 700 }}>
                  {calcGrowth(currentMetrics.nuevos, previousMetrics.nuevos)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Win Rate */}
        <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '14px', border: '1px solid var(--brd)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', tracking: '0.05em' }}>Tasa de Cierre</span>
              <span style={{ fontSize: '1.2rem' }}>🎯</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{currWinRate}%</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>/ meta: {goals.winRate}%</span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div style={{ height: '6px', background: 'var(--s2)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.min(100, (currWinRate / (goals.winRate || 1)) * 100)}%`, 
                background: 'var(--green)', 
                borderRadius: '4px',
                transition: 'width 0.5s ease-out'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--green)' }}>
                {(goals.winRate > 0 ? ((currWinRate / goals.winRate) * 100) : 0).toFixed(0)}% del objetivo
              </span>
              {period !== 'todo' && (
                <span style={{ color: getGrowthColor(Number(currWinRate), Number(prevWinRate)), fontWeight: 700 }}>
                  {Number(currWinRate) >= Number(prevWinRate) ? '▲ ' : '▼ '}{prevWinRate}% ant.
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 3: Ventas Ganadas */}
        <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '14px', border: '1px solid var(--brd)', boxShadow: '0 4px 12px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <span style={{ color: 'var(--muted)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', tracking: '0.05em' }}>Cierres Ganados</span>
              <span style={{ fontSize: '1.2rem' }}>💰</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{currentMetrics.ganados}</span>
              <span style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>/ meta: {goals.cierres}</span>
            </div>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div style={{ height: '6px', background: 'var(--s2)', borderRadius: '4px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ 
                height: '100%', 
                width: `${Math.min(100, (currentMetrics.ganados / (goals.cierres || 1)) * 100)}%`, 
                background: 'var(--accent)', 
                borderRadius: '4px',
                transition: 'width 0.5s ease-out'
              }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {goals.cierres > 0 ? ((currentMetrics.ganados / goals.cierres) * 100).toFixed(0) : 0}% logrado
              </span>
              {period !== 'todo' && (
                <span style={{ color: getGrowthColor(currentMetrics.ganados, previousMetrics.ganados), fontWeight: 700 }}>
                  {calcGrowth(currentMetrics.ganados, previousMetrics.ganados)}
                </span>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Main Charts & Funnel row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '24px' }}>
        
        {/* Chart 1: Bar Timeline */}
        <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '14px', border: '1px solid var(--brd)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
            📊 Histórico de Contactos Recibidos
          </h3>
          <p style={{ margin: '0 0 24px 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
            Número de prospectos que ingresaron por periodo y cuántos terminaron en cierre exitoso.
          </p>

          {chartData.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '260px', color: 'var(--muted)', fontSize: '0.85rem' }}>
              No hay datos registrados en este periodo.
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', height: '260px', gap: '14px', overflowX: 'auto', paddingBottom: '16px', paddingTop: '10px' }}>
              {chartData.map((d, i) => {
                const heightPct = Math.max((d.nuevos / maxBarValue) * 100, 3);
                const ganadosPct = d.nuevos > 0 ? (d.ganados / d.nuevos) * 100 : 0;
                
                return (
                  <div key={i} style={{ flex: '1', minWidth: '45px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ 
                      width: '26px', 
                      height: `${heightPct}%`, 
                      background: 'var(--s2)',
                      borderRadius: '6px',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      overflow: 'hidden',
                      transition: 'all 0.3s ease'
                    }} title={`${d.nuevos} Registrados (${d.ganados} Ganados)`}>
                      
                      {/* Bar fill (Total Nuevos) */}
                      <div style={{ 
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
                        background: 'var(--accent)', opacity: 0.25 
                      }} />

                      {/* Inner Bar fill (Ganados segment) */}
                      <div style={{ 
                        width: '100%', 
                        height: `${ganadosPct}%`, 
                        background: 'var(--accent)', 
                        borderRadius: '0 0 6px 6px',
                        transition: 'height 0.4s'
                      }} />
                      
                      {/* Floating tooltip label */}
                      <div className="bar-tooltip" style={{
                        position: 'absolute', top: '-28px', left: '50%', transform: 'translateX(-50%)',
                        fontSize: '0.72rem', fontWeight: 800, color: 'var(--text)'
                      }}>
                        {d.nuevos}
                      </div>

                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {d.name}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 2: Funnel Chart */}
        <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '14px', border: '1px solid var(--brd)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
            🌪️ Embudo de Conversión (Funnel)
          </h3>
          <p style={{ margin: '0 0 24px 0', color: 'var(--muted)', fontSize: '0.78rem' }}>
            Distribución actual de prospectos en el pipeline y la tasa de conversión respecto a la etapa anterior.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, justifyContent: 'center' }}>
            {funnelData.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.85rem' }}>No hay etapas del funnel configuradas.</div>
            ) : (
              funnelData.map((fd, idx) => {
                // Determine bar width
                const barWidth = 100 - (idx * 6); // visual tapering effect
                
                return (
                  <div key={fd.stage} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '110px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fd.stage}
                    </div>
                    
                    <div style={{ flex: 1, position: 'relative' }}>
                      <div style={{ 
                        height: '28px', 
                        width: `${barWidth}%`, 
                        background: 'var(--s2)', 
                        borderRadius: '6px', 
                        border: '1px solid var(--brd)',
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: '0 12px',
                        justifyContent: 'space-between',
                        overflow: 'hidden',
                        position: 'relative'
                      }}>
                        {/* Fill representing percentage inside stage */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, bottom: 0, 
                          width: `${fd.pctOfTotal}%`, 
                          background: 'var(--accent)', 
                          opacity: 0.15,
                          zIndex: 1
                        }} />

                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text)', zIndex: 2 }}>
                          {fd.cantidad} <span style={{ fontWeight: 400, color: 'var(--muted)' }}>({fd.pctOfTotal}%)</span>
                        </span>
                        
                        {idx > 0 && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--green)', background: 'var(--navy-light)', padding: '2px 6px', borderRadius: '4px', zIndex: 2 }} title="Conversión desde etapa anterior">
                            ↳ {fd.conversionRate}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* Agent Performance Table */}
      <div style={{ background: 'var(--s1)', padding: '24px', borderRadius: '14px', border: '1px solid var(--brd)', boxShadow: '0 4px 12px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text)' }}>
              🏆 Rendimiento por Agente
            </h3>
            <p style={{ margin: '0', color: 'var(--muted)', fontSize: '0.78rem' }}>
              Productividad, win rate e impacto general de cada vendedor asignado.
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--brd)', color: 'var(--muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>
                <th style={{ padding: '12px 8px' }}>Agente</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Total Asignados</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Activos</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Ganados (Cierres)</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Win Rate</th>
                <th style={{ padding: '12px 8px', textAlign: 'center' }}>Contribución</th>
              </tr>
            </thead>
            <tbody>
              {agentPerformance.map((item, idx) => {
                const isTop = idx === 0 && item.ganados > 0;
                
                return (
                  <tr key={item.name} className="agent-row" style={{ borderBottom: '1px solid var(--brd)', fontSize: '0.82rem', transition: 'background 0.2s' }}>
                    <td style={{ padding: '14px 8px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text)' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%', background: isTop ? 'var(--accent)' : 'var(--s2)',
                        color: isTop ? '#fff' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.75rem', fontWeight: 800
                      }}>
                        {isTop ? '🏆' : item.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        {item.name}
                        {isTop && <span style={{ marginLeft: '6px', fontSize: '0.65rem', background: 'var(--navy-light)', color: 'var(--accent)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>Top Performer</span>}
                      </div>
                    </td>
                    <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--text)' }}>{item.total}</td>
                    <td style={{ padding: '14px 8px', textAlign: 'center', color: 'var(--muted)' }}>{item.activos}</td>
                    <td style={{ padding: '14px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--text)' }}>{item.ganados}</td>
                    <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                        background: Number(item.winRate) >= goals.winRate ? 'rgba(16, 185, 129, 0.15)' : 'var(--s2)',
                        color: Number(item.winRate) >= goals.winRate ? 'var(--green)' : 'var(--text)'
                      }}>
                        {item.winRate}%
                      </span>
                    </td>
                    <td style={{ padding: '14px 8px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <div style={{ width: '40px', height: '5px', background: 'var(--s2)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${item.contribution}%`, background: 'var(--accent)' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>{item.contribution}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
