'use client';

import { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';

export default function Campaigns({ leads, user, initialSelection = [], onClearSelection }) {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState(initialSelection.length > 0 ? 'create' : 'list'); // 'list', 'create'

    // Form state
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [image, setImage] = useState(null);
    const [selectedContacts, setSelectedContacts] = useState(initialSelection);
    const [scheduledAt, setScheduledAt] = useState('');
    const [q, setQ] = useState('');

    useEffect(() => {
        fetchCampaigns();
    }, []);

    async function fetchCampaigns() {
        try {
            const res = await fetch('/api/campaigns');
            const data = await res.json();
            if (data && !data.error) setCampaigns(data);
        } catch (e) {
            console.error("Error fetching campaigns", e);
        } finally {
            setLoading(false);
        }
    }

    // Auto-refresh processing campaigns
    useEffect(() => {
        const hasProcessing = campaigns.some(c => c.status === 'processing' || c.status === 'pending');
        if (hasProcessing) {
            const interval = setInterval(fetchCampaigns, 10000);
            return () => clearInterval(interval);
        }
    }, [campaigns]);

    const filteredLeads = useMemo(() => {
        if (!Array.isArray(leads)) return [];
        if (!q.trim()) return leads.slice(0, 100);
        const qs = q.toLowerCase();
        return leads.filter(l => {
            if (!l) return false;
            const name = String(l.Nombre_Persona || '').toLowerCase();
            const phone = String(l.Telefono || '');
            const company = String(l.Nombre_Empresa || '').toLowerCase();
            return name.includes(qs) || phone.includes(qs) || company.includes(qs);
        });
    }, [leads, q]);

    function toggleContact(l) {
        if (!l) return;
        const phone = l.Telefono || l.ID_Contacto;
        const exists = selectedContacts.find(c => c.phone === phone);
        if (exists) {
            setSelectedContacts(selectedContacts.filter(c => c.phone !== phone));
        } else {
            if (selectedContacts.length >= 50) {
                Swal.fire('Límite excedido', 'Máximo 50 contactos por campaña.', 'warning');
                return;
            }
            setSelectedContacts([...selectedContacts, { 
                phone, 
                nombre: l.Nombre_Persona || 'Sin Nombre', 
                empresa: l.Nombre_Empresa || 'Sin Empresa'
            }]);
        }
    }

    function handleImageChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setImage(reader.result);
        };
        reader.readAsDataURL(file);
    }

    async function handleSubmit() {
        if (selectedContacts.length === 0) return Swal.fire('Error', 'Selecciona al menos un contacto', 'error');
        if (!message.trim()) return Swal.fire('Error', 'Escribe un mensaje', 'error');

        const payload = {
            action: 'create',
            campaign: {
                name,
                message,
                image,
                contacts: selectedContacts,
                scheduledAt: scheduledAt || new Date().toISOString()
            }
        };

        try {
            const res = await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok) {
                Swal.fire('Éxito', 'Campaña programada correctamente', 'success');
                setView('list');
                fetchCampaigns();
                // Reset form
                setName('');
                setMessage('');
                setImage(null);
                setSelectedContacts([]);
                if (onClearSelection) onClearSelection();
                setScheduledAt('');
            } else {
                Swal.fire('Error', data.error || 'No se pudo crear la campaña', 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }

    async function deleteCampaign(id) {
        const res = await Swal.fire({
            title: '¿Eliminar campaña?',
            text: "Esta acción no se puede deshacer",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar'
        });
        if (!res.isConfirmed) return;

        try {
            await fetch('/api/campaigns', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', campaign: { id } })
            });
            fetchCampaigns();
        } catch {}
    }

    return (
        <div className="view on" style={{ display: 'flex', flexDirection: 'column', padding: '20px', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>📣 Gestión de Campañas</h2>
                <button className="btn btng" onClick={() => setView(view === 'list' ? 'create' : 'list')}>
                    {view === 'list' ? '+ Nueva Campaña' : 'Volver al Historial'}
                </button>
            </div>

            {view === 'list' ? (
                <div id="twrap" style={{ flex: 1 }}>
                    <table id="tbl">
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Contactos</th>
                                <th>Programada</th>
                                <th>Estado</th>
                                <th>Resultado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {campaigns.map(c => (
                                <tr key={c.id}>
                                    <td><strong>{c.name}</strong><br/><small style={{color:'var(--muted)'}}>{c.message.substring(0, 40)}...</small></td>
                                    <td>{c.contacts.length}</td>
                                    <td>{new Date(c.scheduledAt).toLocaleString()}</td>
                                    <td>
                                        <span className={`badge ${c.status === 'completed' ? 'bg' : c.status === 'processing' ? 'bb' : 'by'}`}>
                                            {c.status.toUpperCase()}
                                        </span>
                                    </td>
                                    <td>
                                        {c.results ? (
                                            <span style={{ fontSize: '0.8rem' }}>
                                                ✅ {c.results.success} | ❌ {c.results.failed}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td>
                                        <button className="btn btnr" style={{ padding: '4px 8px' }} onClick={() => deleteCampaign(c.id)}>Eliminar</button>
                                    </td>
                                </tr>
                            ))}
                            {campaigns.length === 0 && !loading && (
                                <tr><td colSpan="6" style={{textAlign:'center', padding: '40px', color:'var(--muted)'}}>No hay campañas registradas.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', flex: 1, overflow: 'hidden' }}>
                    {/* Left: Compose */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                        <div>
                            <label className="lbl">Nombre de la Campaña</label>
                            <input type="text" className="inp" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Promo Verano 2024" />
                        </div>

                        <div>
                            <label className="lbl">Mensaje (Usa {'{nombre}'} o {'{empresa}'} para personalizar)</label>
                            <textarea 
                                className="inp" 
                                style={{ height: '150px', resize: 'none' }} 
                                value={message} 
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Hola {nombre}, tenemos una oferta para ti en {empresa}..."
                            />
                            <div style={{ marginTop: '5px', display: 'flex', gap: '5px' }}>
                                <button className="btn btngh" style={{ fontSize: '0.7rem' }} onClick={() => setMessage(message + ' {nombre}')}>+ { '{nombre}' }</button>
                                <button className="btn btngh" style={{ fontSize: '0.7rem' }} onClick={() => setMessage(message + ' {empresa}')}>+ { '{empresa}' }</button>
                            </div>
                        </div>

                        <div>
                            <label className="lbl">Incluir Imagen (Opcional)</label>
                            <input type="file" accept="image/*" onChange={handleImageChange} />
                            {image && (
                                <div style={{ marginTop: '10px' }}>
                                    <img src={image} style={{ maxWidth: '200px', borderRadius: '8px', border: '1px solid var(--brd)' }} />
                                    <button className="btn btnr" style={{ display: 'block', marginTop: '5px' }} onClick={() => setImage(null)}>Quitar Imagen</button>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="lbl">Programar Envío (Vacio = Ahora)</label>
                            <input type="datetime-local" className="inp" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
                        </div>

                        <div style={{ marginTop: 'auto', paddingTop: '20px' }}>
                            <button className="btn btng" style={{ width: '100%', padding: '12px' }} onClick={handleSubmit}>
                                🚀 {scheduledAt ? 'Programar Campaña' : 'Iniciar Campaña Ahora'}
                            </button>
                        </div>
                    </div>

                    {/* Right: Contact Selector */}
                    <div className="card" style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
                        <h3 style={{ margin: 0 }}>Contactos ({selectedContacts.length}/50)</h3>
                        <input type="text" className="inp" placeholder="Filtrar contactos..." value={q} onChange={e => setQ(e.target.value)} />
                        
                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--brd)', borderRadius: '4px' }}>
                            {filteredLeads.map(l => {
                                const phone = l.Telefono || l.ID_Contacto;
                                const isSelected = selectedContacts.some(c => c.phone === phone);
                                return (
                                    <div 
                                        key={l.ID_Contacto} 
                                        onClick={() => toggleContact(l)}
                                        style={{ 
                                            padding: '8px 12px', 
                                            borderBottom: '1px solid var(--brd)', 
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            background: isSelected ? 'var(--s1)' : 'transparent'
                                        }}
                                    >
                                        <input type="checkbox" checked={isSelected} readOnly />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{l.Nombre_Persona}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{l.Nombre_Empresa || 'Sin Empresa'} · {phone}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
