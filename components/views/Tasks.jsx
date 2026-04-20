'use client';

import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';

export default function Tasks({ openDrawer }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      });
      const data = await res.json();
      setTasks(data || []);
    } catch {
      Swal.fire({ title: 'Error', text: 'No se pudieron cargar las tareas', icon: 'error' });
    }
    setLoading(false);
  }

  useEffect(() => {
    loadTasks();
  }, []);

  async function updateStatus(taskId, newStatus) {
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', taskId, status: newStatus })
      });
      loadTasks();
    } catch {
      Swal.fire('Error', 'No se pudo actualizar la tarea', 'error');
    }
  }

  async function deleteTask(taskId) {
    const { isConfirmed } = await Swal.fire({
      title: '¿Eliminar tarea?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, borrar'
    });
    if (!isConfirmed) return;

    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', taskId })
      });
      loadTasks();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar la tarea', 'error');
    }
  }

  function renderColumn(statusId, title, badgeColorCls) {
    const colTasks = tasks
      .filter(t => t.status === statusId)
      .sort((a, b) => {
        // Sort by dueDate (ascending), items without date go last
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });

    return (
      <div className="kcol" style={{ width: '320px', background: 'var(--s1)', borderRadius: '8px', border: '1px solid var(--brd)', display: 'flex', flexDirection: 'column' }}>
        <div className="khdr" style={{ background: 'var(--s2)', padding: '12px', borderBottom: '1px solid var(--brd)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{title}</span>
          <span className="kcnt">{colTasks.length}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg)', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px' }}>
          {colTasks.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center', marginTop: '20px' }}>Sin tareas</p>}
          
          {colTasks.map(t => (
            <div key={t.id} style={{ background: 'var(--s1)', padding: '12px', borderRadius: '6px', border: '1px solid var(--brd)', borderLeft: `4px solid ${statusId === 'done' ? 'var(--green)' : statusId === 'doing' ? 'var(--blue)' : 'var(--yel)'}`, boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <span className={`badge ${badgeColorCls}`} style={{ fontSize: '0.65rem' }}>@{t.assignee}</span>
                <button 
                  onClick={() => deleteTask(t.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.7rem' }}
                  title="Eliminar"
                >✕</button>
              </div>
              
              <p style={{ fontSize: '0.82rem', color: 'var(--text)', margin: '0 0 10px 0', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                {t.text}
              </p>
              
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '12px', borderTop: '1px dashed var(--brd)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Lead:</strong> {t.leadName}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem' }}>
                   <span>📅 {new Date(t.createdAt).toLocaleDateString()}</span>
                   {t.dueDate && (
                     <span style={{ color: new Date(t.dueDate) < new Date() && statusId !== 'done' ? 'red' : 'inherit', fontWeight: 600 }}>
                       ⌛ Limite: {new Date(t.dueDate).toLocaleDateString()}
                     </span>
                   )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px' }}>
                {statusId !== 'pending' && (
                  <button className="btn" style={{ flex: 1, padding: '4px', fontSize: '0.7rem', background: 'var(--s2)', border: '1px solid var(--brd)', color: 'var(--text)' }} onClick={() => updateStatus(t.id, 'pending')}>
                    Pausar
                  </button>
                )}
                {statusId !== 'doing' && (
                  <button className="btn" style={{ flex: 1, padding: '4px', fontSize: '0.7rem', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--blue)' }} onClick={() => updateStatus(t.id, 'doing')}>
                    {statusId === 'done' ? 'Rehacer' : 'Iniciar'}
                  </button>
                )}
                {statusId !== 'done' && (
                  <button className="btn" style={{ flex: 1, padding: '4px', fontSize: '0.7rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--green)' }} onClick={() => updateStatus(t.id, 'done')}>
                    Completar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="view on" id="vtasks" style={{ padding: '20px', height: 'calc(100vh - 54px)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', color: 'var(--navy)', margin: 0 }}>Tablero Global de Tareas</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0 }}>Gestiona todas las asignaciones de tu equipo desde aquí.</p>
        </div>
        <button className="btn btngh" onClick={loadTasks} disabled={loading}>
          🔄 {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '16px', flex: 1, overflowX: 'auto', paddingBottom: '10px' }}>
        {renderColumn('pending', '⏳ Pendientes', 'by')}
        {renderColumn('doing', '⚙️ En Proceso', 'bb')}
        {renderColumn('done', '✅ Completadas', 'bg')}
      </div>
    </div>
  );
}
