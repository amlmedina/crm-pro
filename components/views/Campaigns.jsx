'use client';

import { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';

export default function Campaigns({ leads, cfg, user, openDrawer, initialSelection = [], onClearSelection }) {
    const [campaigns, setCampaigns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState(initialSelection.length > 0 ? 'create' : 'list'); // 'list', 'create', 'details', 'birthdays'
    const [selectedCampaign, setSelectedCampaign] = useState(null);

    // Birthday scheduling state
    const [bdayMonth, setBdayMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [bdayMessage, setBdayMessage] = useState(
        cfg?.bdayDefaultMessage || '¡Hola {Nombre_Persona}! 🎉 Hoy es tu día especial. De parte de todo el equipo, te deseamos un feliz cumpleaños. ¡Que lo disfrutes mucho!'
    );
    const [bdayHour, setBdayHour] = useState(10);

    // Form state
    const [name, setName] = useState('');
    const [message, setMessage] = useState('');
    const [image, setImage] = useState(null);
    const [selectedContacts, setSelectedContacts] = useState(initialSelection);
    const [scheduledAt, setScheduledAt] = useState('');
    const [q, setQ] = useState('');

    // Advanced Filters
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);
    const [newFilterKey, setNewFilterKey] = useState('');
    const [newFilterVal, setNewFilterVal] = useState('');

    const availableVariables = useMemo(() => {
        const vars = [
            { key: 'Nombre_Persona', label: 'Nombre' },
            { key: 'Telefono', label: 'Teléfono' },
            { key: 'Correo_Corp', label: 'Correo' },
            { key: 'Cumpleanos', label: 'Cumpleaños' },
            { key: 'Agente_Asignado', label: 'Agente' }
        ];
        if (cfg?.camposPersonalizados) {
            cfg.camposPersonalizados.forEach(c => vars.push({ key: c.key, label: c.label }));
        }
        return vars;
    }, [cfg]);

    const allCols = useMemo(() => {
        const base = [
            // Estado_Funnel: options come from cfg.funnel
            { key: 'Estado_Funnel', label: 'Etapa Funnel', options: (cfg?.funnel || []).map(f => f.stage).filter(Boolean) },
            { key: 'Nombre_Persona', label: 'Nombre', options: null },
        ];
        if (cfg?.camposPersonalizados) {
            cfg.camposPersonalizados.forEach(c => base.push({
                key: c.key,
                label: c.label,
                // For select-type custom fields, expose their options
                options: (c.tipo === 'select' || c.tipo === 'bool')
                    ? (c.tipo === 'bool' ? ['Sí', 'No'] : (c.opciones || []))
                    : null
            }));
        }
        return base;
    }, [cfg]);

    function addFilter() {
        if (!newFilterKey || !newFilterVal.trim()) return;
        setActiveFilters([...activeFilters, { key: newFilterKey, value: newFilterVal.trim() }]);
        setNewFilterKey('');
        setNewFilterVal('');
    }

    function extractMMDD(val) {
        if (!val) return null;
        const s = String(val).trim();
        const ymd = s.match(/\d{4}-(\d{2})-(\d{2})/);
        if (ymd) return `${ymd[1]}-${ymd[2]}`;
        const md = s.match(/^(\d{2})-(\d{2})$/);
        if (md) return `${md[1]}-${md[2]}`;
        return s;
    }

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
        let list = leads;

        if (q.trim()) {
            const qs = q.toLowerCase();
            list = list.filter(l => {
                if (!l) return false;
                const name = String(l.Nombre_Persona || '').toLowerCase();
                const phone = String(l.Telefono || '');
                const company = String(l.Nombre_Empresa || '').toLowerCase();
                return name.includes(qs) || phone.includes(qs) || company.includes(qs);
            });
        }

        if (activeFilters.length > 0) {
            list = list.filter(l => {
                return activeFilters.every(f => {
                    const lVal = String(l[f.key] || '').toLowerCase();
                    return lVal.includes(String(f.value).toLowerCase());
                });
            });
        }

        return list.slice(0, 100);
    }, [leads, q, activeFilters]);

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
                ...l,
                phone
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

    async function handleScheduleBirthdays() {
        const bdayLeads = leads.filter(l => {
            const md = extractMMDD(l.Cumpleanos);
            if (!md) return false;
            return md.startsWith(bdayMonth + '-');
        });

        if (bdayLeads.length === 0) {
            return Swal.fire('Sin cumpleañeros', 'No hay contactos con cumpleaños registrado en el mes seleccionado.', 'info');
        }

        const res = await Swal.fire({
            title: `¿Programar ${bdayLeads.length} cumpleaños?`,
            text: `Se crearán ${bdayLeads.length} campañas individuales, programadas automáticamente para el día de su cumpleaños a las ${String(bdayHour).padStart(2, '0')}:00 UTC.`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, programar',
            cancelButtonText: 'Cancelar'
        });

        if (!res.isConfirmed) return;

        let success = 0;
        let errors = 0;
        const currentYear = new Date().getFullYear();

        Swal.fire({ title: 'Programando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        for (const lead of bdayLeads) {
            const day = String(lead.Cumpleanos).split('-')[1];
            // Format: YYYY-MM-DDTHH:00
            const scheduledDateStr = `${currentYear}-${bdayMonth}-${day}T${String(bdayHour).padStart(2, '0')}:00`;
            
            const payload = {
                action: 'create',
                campaign: {
                    name: `🎂 Cumpleaños - ${lead.Nombre_Persona || 'Contacto'}`,
                    message: bdayMessage,
                    image: null,
                    scheduledAt: scheduledDateStr,
                    contacts: [{
                        phone: lead.Telefono || lead.ID_Contacto,
                        nombre: lead.Nombre_Persona,
                        empresa: lead.Nombre_Empresa
                    }]
                }
            };

            try {
                const req = await fetch('/api/campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await req.json();
                if (data.ok) success++; else errors++;
            } catch {
                errors++;
            }
        }

        fetchCampaigns();
        Swal.fire('¡Listo!', `Se programaron ${success} campañas exitosamente.${errors > 0 ? ` Hubo ${errors} errores.` : ''}`, 'success');
        setView('list');
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
            if (selectedCampaign?.id === id) setView('list');
        } catch {}
    }

    function handleRecycle(c) {
        setName(`Copia de ${c.name}`);
        setMessage(c.message);
        setImage(c.image || null);
        setSelectedContacts(c.contacts || []);
        setScheduledAt('');
        setView('create');
    }

    function handleViewChat(contactPhone) {
        if (!openDrawer) return Swal.fire('Error', 'Función de chat no disponible en esta vista', 'error');
        // Limpiar el teléfono para buscar
        const cleanP = String(contactPhone).replace(/[\s\-\+\(\)]/g, '');
        // Buscar el lead en la lista global
        const lead = leads.find(l => {
            const lPhone = String(l.Telefono || '').replace(/[\s\-\+\(\)]/g, '');
            const lId = String(l.ID_Contacto || '').replace(/[\s\-\+\(\)]/g, '');
            const lLid = String(l.LID || '').replace(/[\s\-\+\(\)]/g, '');
            return lPhone.includes(cleanP) || lId.includes(cleanP) || lLid.includes(cleanP);
        });

        if (lead) {
            openDrawer(lead, 'wa');
        } else {
            Swal.fire('No encontrado', 'No se encontró a este contacto en la base de datos actual (pudo haber sido borrado).', 'info');
        }
    }

    return (
        <div className="view on" style={{ display: 'flex', flexDirection: 'column', padding: '20px', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>📣 Gestión de Campañas</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btng" onClick={() => setView('birthdays')} style={{ background: 'var(--yel)', color: '#000' }}>
                        🎂 Programar Cumpleaños
                    </button>
                    <button className="btn btng" onClick={() => setView(view === 'list' ? 'create' : 'list')}>
                        {view === 'list' ? '+ Nueva Campaña' : 'Volver al Historial'}
                    </button>
                </div>
            </div>

            {view === 'birthdays' ? (
                <div className="card" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                    <h2 style={{ margin: '0 0 5px 0' }}>🎂 Programación Mensual de Cumpleaños</h2>
                    <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                        Selecciona un mes. El sistema encontrará a todos los contactos que cumplen años ese mes y creará una campaña programada individual para cada uno, justo en su día.
                    </p>

                    <div className="fgrid">
                        <div className="fg">
                            <label>Mes</label>
                            <select className="inp" value={bdayMonth} onChange={e => setBdayMonth(e.target.value)}>
                                <option value="01">Enero</option><option value="02">Febrero</option>
                                <option value="03">Marzo</option><option value="04">Abril</option>
                                <option value="05">Mayo</option><option value="06">Junio</option>
                                <option value="07">Julio</option><option value="08">Agosto</option>
                                <option value="09">Septiembre</option><option value="10">Octubre</option>
                                <option value="11">Noviembre</option><option value="12">Diciembre</option>
                            </select>
                        </div>
                        <div className="fg">
                            <label>Hora de Envío (UTC)</label>
                            <select className="inp" value={bdayHour} onChange={e => setBdayHour(parseInt(e.target.value))}>
                                {Array.from({ length: 24 }, (_, i) => (
                                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="fg" style={{ marginTop: '15px' }}>
                        <label>Mensaje Base</label>
                        <textarea 
                            className="inp" 
                            style={{ minHeight: '100px', resize: 'vertical' }}
                            value={bdayMessage}
                            onChange={e => setBdayMessage(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                            {availableVariables.map(v => (
                                <button key={v.key} className="btn btngh" style={{ fontSize: '0.7rem' }} onClick={() => setBdayMessage(bdayMessage + ` {${v.key}}`)}>+ { `{${v.key}}` }</button>
                            ))}
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', padding: '15px', background: 'var(--s2)', borderRadius: '8px', border: '1px solid var(--brd)' }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>Contactos que cumplen en el mes seleccionado:</h4>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {leads.filter(l => {
                                const md = extractMMDD(l.Cumpleanos);
                                return md && md.startsWith(bdayMonth + '-');
                            }).length > 0 ? (
                                leads.filter(l => {
                                    const md = extractMMDD(l.Cumpleanos);
                                    return md && md.startsWith(bdayMonth + '-');
                                }).map(l => (
                                    <div key={l.ID_Contacto} style={{ fontSize: '0.8rem', padding: '4px 0', borderBottom: '1px solid var(--brd)' }}>
                                        <strong>{l.Nombre_Persona}</strong> — Cumple el: {extractMMDD(l.Cumpleanos)}
                                    </div>
                                ))
                            ) : (
                                <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>No hay cumpleaños registrados para este mes.</div>
                            )}
                        </div>
                    </div>

                    <button 
                        className="btn btny" 
                        style={{ width: '100%', marginTop: '20px', padding: '12px' }}
                        onClick={handleScheduleBirthdays}
                        disabled={leads.filter(l => {
                            const md = extractMMDD(l.Cumpleanos);
                            return md && md.startsWith(bdayMonth + '-');
                        }).length === 0}
                    >
                        🚀 Programar Cumpleaños del Mes
                    </button>
                </div>
            ) : view === 'list' ? (
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
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            <button className="btn btngh" style={{ padding: '4px 8px' }} onClick={() => { setSelectedCampaign(c); setView('details'); }}>Ver Detalles</button>
                                            <button className="btn btny" style={{ padding: '4px 8px' }} onClick={() => handleRecycle(c)}>Reciclar</button>
                                            <button className="btn btnr" style={{ padding: '4px 8px' }} onClick={() => deleteCampaign(c.id)}>Eliminar</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {campaigns.length === 0 && !loading && (
                                <tr><td colSpan="6" style={{textAlign:'center', padding: '40px', color:'var(--muted)'}}>No hay campañas registradas.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : view === 'details' && selectedCampaign ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '20px', flex: 1, overflow: 'hidden' }}>
                    {/* Left: Campaign Info */}
                    <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                        <div>
                            <h3 style={{ margin: '0 0 10px 0' }}>{selectedCampaign.name}</h3>
                            <span className={`badge ${selectedCampaign.status === 'completed' ? 'bg' : selectedCampaign.status === 'processing' ? 'bb' : 'by'}`}>
                                {selectedCampaign.status.toUpperCase()}
                            </span>
                        </div>
                        
                        <div>
                            <label className="lbl">Mensaje Original</label>
                            <div style={{ padding: '12px', background: 'var(--s2)', borderRadius: '4px', whiteSpace: 'pre-wrap', fontSize: '0.9rem', border: '1px solid var(--brd)' }}>
                                {selectedCampaign.message}
                            </div>
                        </div>

                        {selectedCampaign.image && (
                            <div>
                                <label className="lbl">Imagen Adjunta</label>
                                <img src={selectedCampaign.image} style={{ maxWidth: '200px', borderRadius: '8px', border: '1px solid var(--brd)' }} />
                            </div>
                        )}

                        <div style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', gap: '10px' }}>
                            <button className="btn btny" style={{ padding: '12px', flex: 1 }} onClick={() => handleRecycle(selectedCampaign)}>
                                ♻️ Clonar / Reciclar esta Campaña
                            </button>
                        </div>
                    </div>

                    {/* Right: Contact List */}
                    <div className="card" style={{ padding: '15px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
                        <h3 style={{ margin: 0 }}>Contactos ({selectedCampaign.contacts.length})</h3>
                        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--brd)', borderRadius: '4px' }}>
                            {selectedCampaign.contacts.map((c, i) => (
                                <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid var(--brd)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</span>
                                            {c.status === 'sent' && <span style={{ fontSize: '0.7rem', color: '#25d366' }}>✅ Enviado</span>}
                                            {c.status === 'failed' && <span style={{ fontSize: '0.7rem', color: '#ef4444' }} title={c.errorMsg}>❌ Falló</span>}
                                            {(!c.status || c.status === 'pending') && selectedCampaign.status === 'processing' && <span style={{ fontSize: '0.7rem', color: '#eab308' }}>⏳ En proceso</span>}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{c.phone}</div>
                                    </div>
                                    <button className="btn btngh" style={{ fontSize: '0.7rem', padding: '4px 8px', whiteSpace: 'nowrap', marginLeft: '10px' }} onClick={() => handleViewChat(c.phone)}>
                                        💬 Ver Chat
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
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
                            <label className="lbl">Mensaje Personalizado</label>
                            <textarea 
                                className="inp" 
                                style={{ height: '150px', resize: 'none' }} 
                                value={message} 
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Hola {Nombre_Persona}, tenemos una oferta especial para ti..."
                            />
                            <div style={{ marginTop: '5px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                {availableVariables.map(v => (
                                    <button key={v.key} className="btn btngh" style={{ fontSize: '0.7rem' }} onClick={() => setMessage(message + ` {${v.key}}`)}>+ { `{${v.key}}` }</button>
                                ))}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0 }}>Contactos ({selectedContacts.length}/50)</h3>
                            <button className="btn btngh" style={{ fontSize: '0.75rem', padding: '4px 8px' }} onClick={() => setFiltersOpen(!filtersOpen)}>
                                Filtros {filtersOpen ? '▲' : '▼'}
                            </button>
                        </div>

                        {/* Bulk selection actions */}
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            <button
                                className="btn btngh"
                                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                                onClick={() => {
                                    const today = new Date();
                                    const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                                    const toAdd = filteredLeads
                                        .filter(l => {
                                            const md = extractMMDD(l.Cumpleanos);
                                            return md && md === monthDay;
                                        })
                                        .filter(l => !selectedContacts.some(c => c.phone === (l.Telefono || l.ID_Contacto)))
                                        .slice(0, 50 - selectedContacts.length);
                                    setSelectedContacts([...selectedContacts, ...toAdd.map(l => ({
                                        phone: l.Telefono || l.ID_Contacto,
                                        nombre: l.Nombre_Persona,
                                        empresa: l.Nombre_Empresa
                                    }))]);
                                }}
                            >🎂 Cumpleañeros Hoy</button>
                            <button
                                className="btn btngh"
                                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                                onClick={() => {
                                    const toAdd = filteredLeads
                                        .filter(l => !selectedContacts.some(c => c.phone === (l.Telefono || l.ID_Contacto)))
                                        .slice(0, 50 - selectedContacts.length);
                                    setSelectedContacts([...selectedContacts, ...toAdd.map(l => ({
                                        phone: l.Telefono || l.ID_Contacto,
                                        nombre: l.Nombre_Persona,
                                        empresa: l.Nombre_Empresa
                                    }))]);
                                }}
                            >☑ Seleccionar todos</button>
                            <button
                                className="btn btngh"
                                style={{ fontSize: '0.7rem', padding: '3px 8px' }}
                                onClick={() => {
                                    const inverted = filteredLeads
                                        .filter(l => !selectedContacts.some(c => c.phone === (l.Telefono || l.ID_Contacto)))
                                        .slice(0, 50)
                                        .map(l => ({ phone: l.Telefono || l.ID_Contacto, nombre: l.Nombre_Persona, empresa: l.Nombre_Empresa }));
                                    setSelectedContacts(inverted);
                                }}
                            >↕ Invertir</button>
                            <button
                                className="btn btngh"
                                style={{ fontSize: '0.7rem', padding: '3px 8px', color: 'var(--red)' }}
                                onClick={() => setSelectedContacts([])}
                            >✕ Limpiar</button>
                        </div>
                        
                        <input type="text" className="inp" placeholder="Filtrar por nombre, empresa, teléfono..." value={q} onChange={e => setQ(e.target.value)} />
                        
                        {filtersOpen && (
                            <div style={{ padding: '10px', background: 'var(--s2)', borderRadius: '6px', border: '1px solid var(--brd)' }}>
                                {activeFilters.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                                        {activeFilters.map((f, i) => (
                                            <span key={i} className="badge bb" style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {allCols.find(c => c.key === f.key)?.label || f.key}: {f.value}
                                                <button onClick={() => setActiveFilters(activeFilters.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>✕</button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '5px', flexDirection: 'column' }}>
                                    <select className="inp" style={{ fontSize: '0.8rem', padding: '4px 8px' }} value={newFilterKey} onChange={e => { setNewFilterKey(e.target.value); setNewFilterVal(''); }}>
                                        <option value="">Añadir filtro por...</option>
                                        {allCols.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                    </select>
                                    {newFilterKey && (() => {
                                        const col = allCols.find(c => c.key === newFilterKey);
                                        return (
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                {col?.options?.length > 0 ? (
                                                    <select className="inp" style={{ flex: 1, fontSize: '0.8rem', padding: '4px 8px' }} value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)}>
                                                        <option value="">Seleccionar...</option>
                                                        {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                ) : (
                                                    <input type="text" className="inp" style={{ flex: 1, fontSize: '0.8rem', padding: '4px 8px' }} placeholder="Valor..." value={newFilterVal} onChange={e => setNewFilterVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && addFilter()} />
                                                )}
                                                <button className="btn btng" style={{ fontSize: '0.8rem', padding: '4px 10px' }} onClick={addFilter}>Add</button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                        
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
