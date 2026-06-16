'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

export default function Drawer({ open, onClose, lead, leads, setLeads, tab, setTab, cfg, user, refreshLeads, isCensored, drawerQueue = [], drawerQueueIdx = -1, onAdvanceQueue, drawerQueueStageName = '' }) {
  const [f, setF] = useState({});
  const [cfs, setCfs] = useState({});
  const [loading, setLoading] = useState(false);
  const [hist, setHist] = useState([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [notas, setNotas] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [toast, setToast] = useState(null); // { msg, type: 'ok'|'err' }
  const notasRef = useRef(null);
  const histContactRef = useRef(null); // Tracks the current contact to cancel stale history loads

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    if (user.rol === 'Gerente' || user.rol === 'Administrador') {
      api('getUsuarios').then(res => setUsersList(res)).catch(() => {});
    }
  }, [user]);

  // Handle ESC key to close drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) {
        if (!Swal.isVisible()) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ── WhatsApp State ──────────────────────────────────────
  const [waMessages, setWaMessages]   = useState([]);
  const [waLoadingHist, setWaLoadingHist] = useState(false);
  const [waMsg, setWaMsg]             = useState('');
  const [waSending, setWaSending]     = useState(false);
  const [waError, setWaError]         = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraOpen, setCameraOpen]     = useState(false);
  const [cameraMode, setCameraMode]     = useState('photo'); // 'photo' | 'video'
  const [camRecording, setCamRecording] = useState(false);
  const [camRecordTime, setCamRecordTime] = useState(0);
  const waChatRef = useRef(null);
  const mediaInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingIntervalRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const camRecorderRef = useRef(null);
  const camChunksRef = useRef([]);
  const camTimerRef = useRef(null);

  async function loadWaHistory(phone, lid) {
    if (!phone && !lid) return;
    setWaLoadingHist(true);
    setWaError('');
    try {
      const identifiers = [phone, lid].filter(Boolean).join(',');
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'history', to: identifiers })
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || 'Error al cargar historial');
        setWaMessages([]);
      } else {
        setWaMessages(Array.isArray(data) ? data : []);
      }
    } catch {
      setWaError('Error de conexión con MiBot');
      setWaMessages([]);
    }
    setWaLoadingHist(false);
  }

  async function sendWaText(txt) {
    if (!txt.trim()) return false;
    const target = lead?.LID || lead?.Telefono;
    if (!target) return false;
    
    setWaSending(true);
    setWaError('');
    let success = false;
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send', to: target, message: txt.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || 'No se pudo enviar el mensaje');
      } else {
        const newMsg = {
          id: Date.now(),
          to: target,
          message: txt.trim(),
          createdAt: new Date().toISOString(),
          status: 'sent',
          fromMe: true
        };
        setWaMessages(prev => [...prev, newMsg]);
        success = true;
      }
    } catch {
      setWaError('Error de conexión con MiBot');
    }
    setWaSending(false);
    return success;
  }

  async function sendWaMessage() {
    if (!waMsg.trim()) return;
    const ok = await sendWaText(waMsg);
    if (ok) {
      setWaMsg('');
    }
  }

  // Scroll al último mensaje cuando cambia la lista
  useEffect(() => {
    if (waChatRef.current) {
      waChatRef.current.scrollTop = waChatRef.current.scrollHeight;
    }
  }, [waMessages]);

  // Cargar historial WA cuando se cambia al tab whatsapp
  useEffect(() => {
    if (tab === 'wa' && (lead?.Telefono || lead?.LID)) {
      loadWaHistory(lead.Telefono, lead.LID);
      // Marcar como leídos
      const identifiers = [lead.Telefono, lead.LID].filter(Boolean).join(',');
      fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all', to: identifiers })
      }).catch(() => {});
    }
  }, [tab, lead]);

  // Auto-polling cada 8s cuando el tab WhatsApp está activo
  useEffect(() => {
    if (tab !== 'wa' || (!lead?.Telefono && !lead?.LID)) return;
    const interval = setInterval(() => {
      loadWaHistory(lead.Telefono, lead.LID);
      const identifiers = [lead.Telefono, lead.LID].filter(Boolean).join(',');
      fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all', to: identifiers })
      }).catch(() => {});
    }, 8000);
    return () => clearInterval(interval);
  }, [tab, lead]);
  // ─────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────
  async function mergeVirtualLead() {
    // Extract pushName from Nombre_Persona (format: "{name} [LID]" or "Desconocido (...)")
    const rawName = lead?.Nombre_Persona || '';
    const initialQuery = rawName
      .replace(/\s*\[LID\]$/i, '')
      .replace(/^Desconocido\s*\(.*\)$/i, '')
      .trim();

    const knownLeads = leads.filter(l =>
      l.Nombre_Persona && !l.Nombre_Persona.toLowerCase().startsWith('desconocido')
    );

    let selectedId = null;

    const renderSuggestions = (query) => {
      const q = (query || '').toLowerCase().trim();
      if (!q) return knownLeads.slice(0, 8);
      return knownLeads.filter(l =>
        (l.Nombre_Persona || '').toLowerCase().includes(q) ||
        String(l.Telefono || '').includes(q) ||
        (l.Correo_Corp || '').toLowerCase().includes(q) ||
        (l.Nombre_Empresa || '').toLowerCase().includes(q)
      ).slice(0, 10);
    };

    const buildResultItems = (container, label, input, query) => {
      container.innerHTML = '';
      selectedId = null;
      const results = renderSuggestions(query);

      if (results.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:14px;color:#888;font-size:0.82rem;text-align:center';
        empty.textContent = 'Sin resultados';
        container.appendChild(empty);
        return;
      }

      results.forEach(l => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid #eee;transition:background .15s';
        item.addEventListener('mouseenter', () => { item.style.background = '#f0f4ff'; });
        item.addEventListener('mouseleave', () => { item.style.background = ''; });

        const name = document.createElement('div');
        name.style.cssText = 'font-weight:700;font-size:0.88rem;color:#222';
        name.textContent = l.Nombre_Persona;

        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:0.74rem;color:#888';
        // Use configured fields from admin, excluding Nombre_Persona (already shown as title)
        const subFields = (cfg?.linkSearchFields || ['Nombre_Empresa', 'Telefono', 'Correo_Corp'])
          .filter(k => k !== 'Nombre_Persona');
        sub.textContent = subFields.map(k => l[k]).filter(Boolean).join(' · ');

        item.appendChild(name);
        item.appendChild(sub);

        item.addEventListener('click', () => {
          selectedId = String(l.ID_Contacto);
          input.value = l.Nombre_Persona;
          label.textContent = `✅ Seleccionado: ${l.Nombre_Persona}`;
          label.style.color = '#4f46e5';
          container.innerHTML = '';
        });

        container.appendChild(item);
      });
    };

    const result = await Swal.fire({
      title: '🔗 Vincular Contacto',
      html: `
        <div style="text-align:left">
          <p style="font-size:0.82rem;color:#666;margin:0 0 10px 0">Busca por nombre, teléfono, correo o empresa.</p>
          <input id="ac-input" type="text" placeholder="Nombre, teléfono o correo…"
            style="width:100%;box-sizing:border-box;padding:10px 14px;border:2px solid #ccc;border-radius:8px;font-size:0.9rem;outline:none;font-family:inherit;margin-bottom:6px" />
          <div id="ac-results" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;max-height:260px;overflow-y:auto;background:#fff"></div>
          <p id="ac-selected-label" style="font-size:0.78rem;color:#4f46e5;margin:8px 0 0 0;font-weight:600;min-height:18px"></p>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Vincular',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#4f46e5',
      width: 480,
      didOpen: () => {
        const input = document.getElementById('ac-input');
        const label = document.getElementById('ac-selected-label');
        const container = document.getElementById('ac-results');

        if (!input || !container || !label) return;

        // Pre-fill and show initial results
        input.value = initialQuery;
        input.style.borderColor = '#4f46e5';
        buildResultItems(container, label, input, initialQuery);

        input.addEventListener('focus', () => { input.style.borderColor = '#4f46e5'; });
        input.addEventListener('blur', () => { input.style.borderColor = '#ccc'; });
        input.addEventListener('input', (e) => {
          buildResultItems(container, label, input, e.target.value);
        });

        input.focus();
        input.select();
      },
      preConfirm: () => {
        if (!selectedId) {
          Swal.showValidationMessage('Por favor selecciona un contacto de la lista');
          return false;
        }
        return selectedId;
      }
    });

     if (result.isConfirmed && result.value) {
       const targetLead = leads.find(l => String(l.ID_Contacto) === String(result.value));
       if (targetLead) {
          const backupLid = targetLead.LID;
          const newLid = lead.LID || lead.Telefono;
          const updatedLead = { ...targetLead, LID: newLid };
          updatedLead.Notas = (updatedLead.Notas || '') + `\n[Sistema] Contacto vinculado con LID: ${newLid}${backupLid ? ` (LID anterior: ${backupLid})` : ''}`;

          setLoading(true);
          try {
             await api('saveProfile', { perfil: updatedLead, userId: user.id });
             if (backupLid) {
                await fetch('/api/whatsapp', {
                   method: 'POST',
                   headers: { 'Content-Type': 'application/json' },
                   body: JSON.stringify({ action: 'merge_chats', from_phone: backupLid, to_phone: newLid })
                }).catch(() => {});
             }
             await refreshLeads();
             onClose();
             Swal.fire('✅ Vinculado', `LID enlazado a <b>${targetLead.Nombre_Persona}</b> correctamente.`, 'success');
          } catch {
             Swal.fire('Error', 'No se pudo vincular en la base de datos.', 'error');
          }
          setLoading(false);
       }
    }
  }
  // ─────────────────────────────────────────────────────────
  // Quick Actions (Tasks & Status)
  
  async function promptTask() {
    Swal.fire({ title: 'Cargando equipo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    let usersList = [];
    try {
      usersList = await api('getUsuarios');
      Swal.close();
    } catch {
      Swal.close();
      return Swal.fire('Error', 'No se pudo cargar la lista de usuarios', 'error');
    }

    if (!usersList || usersList.length === 0) {
       return Swal.fire('Error', 'No hay usuarios disponibles', 'warning');
    }

    const un = usersList.map(u => `<option value="${u.nombre}">${u.nombre}</option>`).join('');
    
    const htmlForm = `
      <div style="text-align: left; font-size: 0.85rem;">
         <label style="display:block; margin-bottom: 5px; font-weight: 600; color: var(--muted);">Responsable</label>
         <select id="t_assignee" class="swal2-select" style="width: 100%; margin: 0 0 15px 0; font-size: 0.85rem;">
           ${un}
         </select>
         <label style="display:block; margin-bottom: 5px; font-weight: 600; color: var(--muted);">Fecha Límite (Opcional)</label>
         <input type="date" id="t_due" class="swal2-input" style="width: 100%; margin: 0 0 15px 0; font-size: 0.85rem;" />
         <label style="display:block; margin-bottom: 5px; font-weight: 600; color: var(--muted);">Notas / Descripción</label>
         <textarea id="t_notes" class="swal2-textarea" style="width: 100%; margin: 0; min-height: 80px; font-size: 0.85rem;" placeholder="Escribe los detalles de la tarea..."></textarea>
      </div>
    `;

    const result = await Swal.fire({
      title: 'Crear Tarea',
      html: htmlForm,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      preConfirm: () => {
        const assignee = document.getElementById('t_assignee').value;
        const dueDate = document.getElementById('t_due').value;
        const notes = document.getElementById('t_notes').value;
        if (!assignee || !notes.trim()) {
          Swal.showValidationMessage('Las notas son obligatorias');
          return false;
        }
        return { assignee, dueDate, notes };
      }
    });

    if (!result.isConfirmed) return;
    const { assignee, dueDate, notes: taskText } = result.value;

    setLoading(true);
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
           action: 'create', 
           text: taskText,
           assignee: assignee,
           dueDate: dueDate || null,
           leadId: lead?.ID_Contacto,
           leadName: lead?.Nombre_Persona || lead?.Nombre_Empresa || 'Contacto Desconocido'
        })
      });
      Swal.fire({ title: '✅ Tarea Asignada', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'No se pudo guardar la tarea', 'error');
    }
    setLoading(false);
  }

  async function handleWaStatusChange(nuevoE) {
     if (nuevoE === lead?.Estado_Funnel) return;
     setLoading(true);
     try {
       await api('saveInteraction', {
          idContacto: lead.ID_Contacto,
          nuevoEstado: nuevoE,
          notas: `🔄 Status actualizado desde WhatsApp a: ${nuevoE}`,
          nombreUsuario: user.nombre
       });
       await refreshLeads();
       setF({ ...f, Estado_Funnel: nuevoE });
       await loadHistorial(lead.ID_Contacto);
       Swal.fire({ title: 'Status Actualizado', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
     } catch {
       Swal.fire('Error', 'No se pudo actualizar', 'error');
     }
     setLoading(false);
  }

  const predefs = cfg.wa_predefs || [
    "Hola, ¿cómo estás?",
    "Me comunico para dar seguimiento",
    "Te comparto la información",
    "¿Tendrás disponibilidad para una llamada?",
    "¡Gracias por tu interés!"
  ];

  // Resolve {Variable} placeholders using lead + custom fields data
  function resolveVars(text) {
    if (!text || !lead) return text || '';
    const allData = { ...lead, ...Object.fromEntries((cfg.camposPersonalizados || []).map(c => [c.key, lead[c.key] || ''])) };
    return text.replace(/\{(\w+)\}/g, (_, key) => (allData[key] !== undefined && allData[key] !== '') ? allData[key] : `{${key}}`);
  }

  // Send image + caption via WhatsApp (Legacy)
  async function sendWaImage(imageBase64, captionText) {
    return sendWaMedia(imageBase64, captionText, false);
  }

  // Send generic media via WhatsApp
  async function sendWaMedia(mediaBase64, captionText, isVoiceNote = false) {
    const target = lead?.LID || lead?.Telefono;
    if (!target) return;
    setWaSending(true);
    setWaError('');
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_media', to: target, mediaBase64, caption: captionText, isVoiceNote })
      });
      const data = await res.json();
      if (!res.ok) {
        setWaError(data.error || 'No se pudo enviar el archivo');
      } else {
        let logText = isVoiceNote ? '[Nota de Voz]' : captionText ? `[Archivo] ${captionText}` : '[Archivo]';
        setWaMessages(prev => [...prev, {
          id: Date.now(), to: target,
          message: logText,
          createdAt: new Date().toISOString(), status: 'sent', fromMe: true
        }]);
      }
    } catch {
      setWaError('Error de conexión al enviar archivo');
    }
    setWaSending(false);
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const type = mediaRecorderRef.current.mimeType || '';
        const audioBlob = new Blob(audioChunksRef.current, { type });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64String = reader.result;
          sendWaMedia(base64String, '', true);
        };
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingIntervalRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo acceder al micrófono. Verifica los permisos.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      clearInterval(recordingIntervalRef.current);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      sendWaMedia(reader.result, waMsg);
      setWaMsg('');
    };
    e.target.value = '';
  };
  const openCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
      cameraStreamRef.current = stream;
      setCameraOpen(true);
      setCamRecording(false);
      setCamRecordTime(0);
      // attach stream after mount
      setTimeout(() => {
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play();
        }
      }, 100);
    } catch {
      Swal.fire('Error', 'No se pudo acceder a la cámara. Verifica los permisos.', 'error');
    }
  };

  const closeCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(t => t.stop());
      cameraStreamRef.current = null;
    }
    if (camTimerRef.current) clearInterval(camTimerRef.current);
    setCameraOpen(false);
    setCamRecording(false);
    setCamRecordTime(0);
  };

  const capturePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const base64 = canvas.toDataURL('image/jpeg', 0.9);
    closeCamera();
    sendWaMedia(base64, '', false);
  };

  const startVideoCapture = () => {
    const stream = cameraStreamRef.current;
    if (!stream) return;
    camChunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    camRecorderRef.current = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) camChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(camChunksRef.current, { type: recorder.mimeType || 'video/webm' });
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => { sendWaMedia(reader.result, '', false); };
    };
    recorder.start();
    setCamRecording(true);
    setCamRecordTime(0);
    camTimerRef.current = setInterval(() => setCamRecordTime(p => p + 1), 1000);
  };

  const stopVideoCapture = () => {
    if (camRecorderRef.current) camRecorderRef.current.stop();
    if (camTimerRef.current) clearInterval(camTimerRef.current);
    setCamRecording(false);
    closeCamera();
  };


  useEffect(() => {
    if (open) {
      if (lead) {
        setF({
          Nombre_Persona: lead.Nombre_Persona || '',
          Telefono: lead.Telefono || '',
          LID: lead.LID || '',
          Correo_Corp: lead.Correo_Corp || '',
          Cumpleanos: lead.Cumpleanos || '',
          Estado_Funnel: lead.Estado_Funnel || (cfg.funnel?.[0]?.stage || ''),
          Agente_Asignado: lead.Agente_Asignado || ''
        });
        
        const cfsData = {};
        (cfg.camposPersonalizados || []).forEach(c => {
          cfsData[c.key] = lead[c.key] || '';
        });
        setCfs(cfsData);
        
        setHist([]); // Clear old history to prevent mixup
        histContactRef.current = lead.ID_Contacto;
        loadHistorial(lead.ID_Contacto);
      } else {
        // Nuevo Lead
        setF({
          Nombre_Persona: '', Telefono: '', LID: '', Correo_Corp: '',
          Cumpleanos: '', Estado_Funnel: cfg.funnel?.[0]?.stage || '',
          Agente_Asignado: user.rol === 'Agente' ? user.nombre : ''
        });
        const cfsData = {};
        (cfg.camposPersonalizados || []).forEach(c => { cfsData[c.key] = ''; });
        setCfs(cfsData);
        setHist([]);
      }
      setNotas('');
    }
  }, [open, lead, cfg]);

  async function loadHistorial(id) {
    if (!id) return;
    setLoadingHist(true);
    try {
      const res = await api('getInteractions', { idContacto: id });
      // Only apply if this contact is still the active one (prevents race conditions)
      if (histContactRef.current === id) {
        setHist(res || []);
      }
    } catch {
      if (histContactRef.current === id) setHist([]);
    }
    if (histContactRef.current === id) setLoadingHist(false);
  }

  function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  async function doSavePerfil() {
    if (!f.Nombre_Persona) return Swal.fire('Requerido', 'El nombre es obligatorio', 'warning');
    setLoading(true);
    try {
      const cleanPhone = String(f.Telefono || '').replace(/[\s\-\+\(\)]/g, '');
      const titleName = toTitleCase(f.Nombre_Persona);
      
      const perfil = { 
        ID_Contacto: lead?.ID_Contacto, 
        ...f, 
        Nombre_Persona: titleName,
        Telefono: cleanPhone,
        ...cfs 
      };
      
      // Update local state to reflect UI changes immediately
      setF(prev => ({ ...prev, Nombre_Persona: titleName, Telefono: cleanPhone }));

      await api('saveProfile', { perfil, userId: user.id });

      if (lead?.ID_Contacto) {
        // Optimistic update for existing contacts to avoid backend cache delays
        if (setLeads) {
          setLeads(prev => prev.map(l => l.ID_Contacto === lead.ID_Contacto ? { ...l, ...perfil } : l));
        }
        Swal.fire({ title: '✅ Guardado', icon: 'success', timer: 1500, showConfirmButton: false });
      } else {
        // For new contacts, we must refresh to get the generated ID_Contacto
        await refreshLeads();
        Swal.fire({ title: '✅ Creado', icon: 'success', timer: 1500, showConfirmButton: false });
        onClose();
      }
    } catch {
      Swal.fire('Error', 'No se pudo guardar', 'error');
    }
    setLoading(false);
  }

  async function doSaveInt() {
    if (!lead?.ID_Contacto) { showToast('Guarda el perfil primero', 'err'); return; }
    if (!notas.trim()) { showToast('Escribe una nota primero', 'err'); return; }
    
    const nuevoE = f.Estado_Funnel;
    const savedNotas = notas;
    const savedLead = lead;

    // 1. Immediately update UI: clear notes, update local history, advance to next in queue
    setHist(prev => [{ Fecha_Hora: new Date().toISOString(), Estado_Momento: nuevoE, Notas: savedNotas, ID_Usuario: user.nombre }, ...prev]);
    setNotas('');

    // 2. Optimistic local update of leads state (no full reload)
    if (setLeads) {
      setLeads(prev => prev.map(l =>
        l.ID_Contacto === savedLead.ID_Contacto
          ? { ...l, Estado_Funnel: nuevoE, Ultima_Interaccion: new Date().toISOString() }
          : l
      ));
    }

    // 3. Auto-advance to next lead in queue (if in Funnel queue mode)
    if (drawerQueue.length > 0 && onAdvanceQueue) {
      const nextIdx = drawerQueueIdx + 1;
      const nextLead = drawerQueue[nextIdx];
      if (nextLead) {
        showToast(`✅ Guardado • Abriendo ${nextLead.Nombre_Persona || 'siguiente'}...`);
        setTimeout(() => {
          onAdvanceQueue(nextLead, nextIdx);
          if (notasRef.current) notasRef.current.focus();
        }, 120);
      } else {
        const colName = drawerQueueStageName ? ` la columna ${drawerQueueStageName}` : 'la lista';
        showToast(`✅ Último contacto de ${colName} registrado`);
      }
    } else {
      showToast('✅ Interacción registrada');
      if (notasRef.current) notasRef.current.focus();
    }

    // 4. Persist to backend in background (non-blocking)
    try {
      await api('saveInteraction', { idContacto: savedLead.ID_Contacto, nuevoEstado: nuevoE, notas: savedNotas, nombreUsuario: user.nombre });
      loadHistorial(savedLead.ID_Contacto);
    } catch {
      showToast('Error sincronizando con el servidor', 'err');
    }
  }

  async function copyEmail(ev) {
    ev.preventDefault();
    if (!f.Correo_Corp) return Swal.fire('Vacío', 'No hay correo para copiar', 'info');
    
    try {
      await navigator.clipboard.writeText(f.Correo_Corp);
      if (lead?.ID_Contacto) {
         await api('saveInteraction', {
             idContacto: lead.ID_Contacto, 
             nuevoEstado: lead.Estado_Funnel, 
             notas: '📋 [SEGURIDAD] El usuario copió el correo al portapapeles.', 
             nombreUsuario: user.nombre 
         });
         await loadHistorial(lead.ID_Contacto);
      }
      Swal.fire({ title: 'Copiado', icon: 'success', timer: 1200, showConfirmButton: false });
    } catch {
      Swal.fire('Error', 'No se pudo copiar', 'error');
    }
  }

  return (
    <>
      <div id="ov" style={{ display: open ? 'block' : 'none' }} onClick={onClose} />
      <div id="drawer" className={open ? 'open' : ''}>
        <div id="drhdr">
          <div>
            <div id="drtitle">{(isCensored && isCensored('Nombre_Persona') && lead) ? '••••••••••' : (lead?.Nombre_Persona || 'Nuevo Lead')}</div>
            <div id="drsub">{(isCensored && isCensored('Nombre_Empresa') && lead) ? '••••••••••' : (lead?.Nombre_Empresa || 'Completa el perfil')}</div>
          </div>
          <button className="btnx" onClick={onClose}>✕</button>
        </div>
        
        <div id="drbody">
          <div className="dtabs">
            <button className={`dtab ${tab === 'perfil' ? 'on' : ''}`} onClick={() => setTab('perfil')}>Perfil</button>
            <button className={`dtab ${tab === 'int' ? 'on' : ''}`} onClick={() => { setTab('int'); setTimeout(() => notasRef.current?.focus(), 80); }}>Interacción 360°</button>
            {(lead?.Telefono || lead?.LID) && (
              <button className={`dtab ${tab === 'wa' ? 'on' : ''}`} onClick={() => setTab('wa')} style={{ color: tab === 'wa' ? '#25d366' : undefined }}>
                💬 WhatsApp
              </button>
            )}
          </div>

          <div className={`dpanel ${tab === 'perfil' ? 'on' : ''}`}>
             
             {lead?.isUnknown && (
                <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--s2)', borderRadius: '8px', border: '1px dashed var(--brd)' }}>
                   <p className="stitle" style={{margin: '0 0 8px 0'}}>👤 Contacto Virtual (No guardado)</p>
                   <p style={{fontSize:'0.85rem', color:'var(--text2)', marginBottom:'16px'}}>Este usuario se comunicó por WhatsApp pero no está registrado en tu CRM.</p>
                   
                   <button className="btn bb" onClick={mergeVirtualLead} disabled={loading} style={{width:'100%', marginBottom: '10px'}}>
                     🔗 Enlazar a un prospecto o cliente existente
                   </button>
                   <div style={{textAlign:'center', fontSize:'0.75rem', color:'var(--text2)', marginBottom: '10px'}}>O registra sus datos aquí abajo y guarda los cambios para crearlo.</div>
                </div>
             )}

             <p className="stitle">Datos de Contacto</p>
             <div className="fgrid">
                <div className="fg full"><label>Nombre</label>
                  {(isCensored && isCensored('Nombre_Persona') && lead) ? <input type="text" className="inp" value="••••••••••" disabled /> : <input type="text" className="inp" value={f.Nombre_Persona || ''} onChange={e => setF({...f, Nombre_Persona: e.target.value})} />}
                </div>
                <div className="fg"><label>Teléfono</label>
                  {(isCensored && isCensored('Telefono') && lead) ? <input type="text" className="inp" value="••••••••••" disabled /> : <input type="tel" className="inp" value={f.Telefono || ''} onChange={e => setF({...f, Telefono: e.target.value})} />}
                </div>
                <div className="fg"><label>🎂 Cumpleaños (MM-DD)</label>
                  <input type="text" className="inp" placeholder="05-20" maxLength={5} value={f.Cumpleanos || ''} onChange={e => setF({...f, Cumpleanos: e.target.value})} />
                </div>
                <div className="fg"><label style={{color: '#2563eb', fontWeight: '800'}}>LID (WhatsApp ID) ✨ NUEVO </label>
                  <input type="text" className="inp" value={f.LID || ''} onChange={e => setF({...f, LID: e.target.value})} />
                </div>
                {(user.rol === 'Gerente' || user.rol === 'Administrador') && (
                  <div className="fg">
                    <label>Asignado A (Agente)</label>
                    <select className="inp" value={f.Agente_Asignado || ''} onChange={e => setF({...f, Agente_Asignado: e.target.value})}>
                      <option value="">Sin Asignar</option>
                      {usersList.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                    </select>
                  </div>
                )}
                <div className="fg full">
                   <label>Correo Electrónico</label>
                   <div style={{display:'flex', gap:'6px'}}>
                     {(isCensored && isCensored('Correo_Corp') && lead) ? <input type="text" className="inp" style={{flex:1}} value="••••••••••" disabled /> : <input type="email" className="inp" style={{flex:1}} value={f.Correo_Corp || ''} onChange={e => setF({...f, Correo_Corp: e.target.value})} />}
                     <button className="btn btnda" onClick={copyEmail} style={{padding:'0 12px', fontSize:'0.75rem'}} disabled={isCensored && isCensored('Correo_Corp') && lead}>📋 Copiar</button>
                   </div>
                </div>
             </div>

             {/* Campos extra */}
             {cfg.camposPersonalizados?.length > 0 && (
               <>
                 <p className="stitle" style={{marginTop:'18px'}}>Campos Adicionales</p>
                 <div className="fgrid">
                   {cfg.camposPersonalizados.map(c => (
                     <div className="fg" key={c.key}>
                        <label>{c.label}</label>
                        {c.tipo === 'select' ? (
                          <select className="inp" value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} disabled={isCensored && isCensored(c.key) && lead}>
                            <option value="">—</option>
                            {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : c.tipo === 'bool' ? (
                          <select className="inp" value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} disabled={isCensored && isCensored(c.key) && lead}>
                            <option value="">—</option><option value="Sí">Sí</option><option value="No">No</option>
                          </select>
                        ) : (
                          (isCensored && isCensored(c.key) && lead) ? <input type="text" className="inp" value="••••••••••" disabled /> : <input type={c.tipo==='numero'?'number':c.tipo==='fecha'?'date':'text'} className="inp" value={cfs[c.key] || ''} onChange={e => setCfs({...cfs, [c.key]: e.target.value})} />
                        )}
                     </div>
                   ))}
                 </div>
               </>
             )}

             <button className="btn btng btnw" style={{marginTop:'10px'}} onClick={doSavePerfil} disabled={loading}>
               {loading ? 'Guardando...' : '💾 Guardar Perfil'}
             </button>
          </div>

          <div className={`dpanel ${tab === 'int' ? 'on' : ''}`}>
            
            {/* 1. SECCIÓN SUPERIOR: Datos 360° */}
             {(() => {
                const viewFields = cfg.view360Fields || ['Nombre_Persona', 'Telefono', 'Correo_Corp', 'Nombre_Empresa'];
                const defaultLabels = { Telefono: 'Teléfono', Correo_Corp: 'Correo', Nombre_Persona: 'Nombre', Nombre_Empresa: 'Empresa', Cumpleanos: 'Cumpleaños', LID: 'LID (WhatsApp ID)' };
                const getLabel = k => defaultLabels[k] || cfg.camposPersonalizados?.find(c => c.key === k)?.label || k;
                
                const renderInput = (k) => {
                  const isCens = isCensored && isCensored(k) && lead;
                  if (isCens) {
                    return <input type="text" className="inp" value="••••••••••" disabled style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px' }} />;
                  }

                  // 1. Agente Asignado
                  if (k === 'Agente_Asignado') {
                    if (user.rol === 'Gerente' || user.rol === 'Administrador') {
                      return (
                        <select 
                          className="inp" 
                          value={f.Agente_Asignado || ''} 
                          onChange={e => setF({...f, Agente_Asignado: e.target.value})}
                          style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }}
                        >
                          <option value="">Sin Asignar</option>
                          {usersList.map(u => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                        </select>
                      );
                    } else {
                      return <input type="text" className="inp" value={f.Agente_Asignado || 'Sin Asignar'} disabled style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px' }} />;
                    }
                  }

                  // 2. Custom Fields in cfg
                  const customField = cfg.camposPersonalizados?.find(c => c.key === k);
                  if (customField) {
                    if (customField.tipo === 'select') {
                      return (
                        <select 
                          className="inp" 
                          value={cfs[k] || ''} 
                          onChange={e => setCfs({...cfs, [k]: e.target.value})}
                          style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }}
                        >
                          <option value="">—</option>
                          {customField.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      );
                    }
                    if (customField.tipo === 'bool') {
                      return (
                        <select 
                          className="inp" 
                          value={cfs[k] || ''} 
                          onChange={e => setCfs({...cfs, [k]: e.target.value})}
                          style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }}
                        >
                          <option value="">—</option>
                          <option value="Sí">Sí</option>
                          <option value="No">No</option>
                        </select>
                      );
                    }
                    return (
                      <input 
                        type={customField.tipo === 'numero' ? 'number' : customField.tipo === 'fecha' ? 'date' : 'text'} 
                        className="inp" 
                        value={cfs[k] || ''} 
                        onChange={e => setCfs({...cfs, [k]: e.target.value})}
                        style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }}
                      />
                    );
                  }

                  // 3. Standard Fields
                  if (k === 'Nombre_Persona') {
                    return <input type="text" className="inp" value={f.Nombre_Persona || ''} onChange={e => setF({...f, Nombre_Persona: e.target.value})} style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} />;
                  }
                  if (k === 'Telefono') {
                    return <input type="tel" className="inp" value={f.Telefono || ''} onChange={e => setF({...f, Telefono: e.target.value})} style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} />;
                  }
                  if (k === 'Correo_Corp') {
                    return <input type="email" className="inp" value={f.Correo_Corp || ''} onChange={e => setF({...f, Correo_Corp: e.target.value})} style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} />;
                  }
                  if (k === 'Nombre_Empresa' || k === 'Empresa') {
                    return <input type="text" className="inp" value={f.Nombre_Empresa || f.Empresa || ''} onChange={e => setF({...f, Nombre_Empresa: e.target.value})} style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} />;
                  }
                  if (k === 'LID') {
                    return <input type="text" className="inp" value={f.LID || ''} onChange={e => setF({...f, LID: e.target.value})} style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} />;
                  }
                  if (k === 'Cumpleanos') {
                    return <input type="text" className="inp" placeholder="05-20" maxLength={5} value={f.Cumpleanos || ''} onChange={e => setF({...f, Cumpleanos: e.target.value})} style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} />;
                  }

                  // Default Fallback
                  return (
                    <input 
                      type="text" 
                      className="inp" 
                      value={f[k] ?? cfs[k] ?? ''} 
                      onChange={e => {
                        if (f[k] !== undefined) setF({...f, [k]: e.target.value});
                        else setCfs({...cfs, [k]: e.target.value});
                      }} 
                      style={{ padding: '4px 8px', fontSize: '0.78rem', height: '28px', borderRadius: '6px', marginTop: '2px', background: 'var(--s1)', color: 'var(--text)', border: '1px solid var(--brd)' }} 
                    />
                  );
                };

                return (
                  <div style={{ background: 'var(--s2)', border: '1px solid var(--brd)', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <p className="stitle" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--navy)' }}>Vista 360° - Datos del Contacto</p>
                        <button 
                          onClick={doSavePerfil} 
                          disabled={loading}
                          className="btn btng"
                          style={{ padding: '4px 10px', fontSize: '0.7rem', fontWeight: 700, borderRadius: '6px', height: '24px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {loading ? 'Guardando...' : '💾 Guardar Datos'}
                        </button>
                      </div>
                      
                      {drawerQueue.length > 0 && onAdvanceQueue && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <button 
                            className="btn btnda"
                            disabled={drawerQueueIdx <= 0} 
                            onClick={() => onAdvanceQueue(drawerQueue[drawerQueueIdx - 1], drawerQueueIdx - 1)}
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            title="Contacto anterior"
                          >
                            ◀ Anterior
                          </button>
                          <span style={{ fontSize: '0.65rem', color: 'var(--muted)', fontWeight: 700 }}>
                            {drawerQueueIdx + 1} / {drawerQueue.length}
                          </span>
                          <button 
                            className="btn btnda"
                            disabled={drawerQueueIdx >= drawerQueue.length - 1} 
                            onClick={() => onAdvanceQueue(drawerQueue[drawerQueueIdx + 1], drawerQueueIdx + 1)}
                            style={{ padding: '2px 8px', fontSize: '0.65rem' }}
                            title="Siguiente contacto"
                          >
                            Siguiente ▶
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                      {viewFields.map(k => (
                        <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.5px' }}>{getLabel(k)}</span>
                          {renderInput(k)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
             })()}

            {/* 2. SECCIÓN CENTRAL: Acción */}
            <div style={{ background: 'var(--s1)', border: '1px solid var(--brd)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
              <p className="stitle" style={{ margin: '0 0 10px 0' }}>Registrar Interacción</p>
              <div className="fg" style={{ marginBottom: '10px' }}>
                <label style={{ marginBottom: '6px', display: 'block' }}>Estado</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {cfg.funnel?.map(x => (
                    <button
                      key={x.stage}
                      onClick={() => setF({ ...f, Estado_Funnel: x.stage })}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        border: `2px solid ${f.Estado_Funnel === x.stage ? 'var(--navy)' : 'var(--brd)'}`,
                        background: f.Estado_Funnel === x.stage ? 'var(--navy)' : 'var(--s2)',
                        color: f.Estado_Funnel === x.stage ? '#fff' : 'var(--text)',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: f.Estado_Funnel === x.stage ? 700 : 400,
                        transition: 'all 0.15s'
                      }}
                    >
                      {x.stage}
                    </button>
                  ))}
                  <button
                    onClick={() => setF({ ...f, Estado_Funnel: 'Congelado' })}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      border: `2px solid ${f.Estado_Funnel === 'Congelado' ? '#93c5fd' : 'var(--brd)'}`,
                      background: f.Estado_Funnel === 'Congelado' ? '#1d4ed8' : 'var(--s2)',
                      color: f.Estado_Funnel === 'Congelado' ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: f.Estado_Funnel === 'Congelado' ? 700 : 400,
                      transition: 'all 0.15s'
                    }}
                  >
                    ❄️ Congelado
                  </button>
                </div>
              </div>

              <div className="fg">
                <label style={{ marginBottom: '6px', display: 'block' }}>Notas <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: '0.75rem' }}>· Cmd/Ctrl+Enter para guardar</span></label>
                <textarea
                  ref={notasRef}
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  placeholder="¿Qué pasó en este contacto?"
                  style={{ minHeight: '100px', resize: 'vertical' }}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault();
                      doSaveInt();
                    }
                  }}
                />
              </div>

              <button
                className="btn btny btnw"
                style={{ marginTop: '10px', opacity: loading ? 0.6 : 1 }}
                onClick={doSaveInt}
                disabled={loading}
              >
                {loading ? 'Registrando...' : '⚡ Registrar'}
              </button>
            </div>

            {/* 3. SECCIÓN INFERIOR: Historial */}
            <div>
               <p className="stitle" style={{ marginBottom: '10px' }}>Historial de Interacciones</p>
               <div className="tl">
                  {loadingHist ? <p style={{color:'var(--muted)', fontSize:'.8rem'}}>Cargando historial...</p> : 
                   hist.length === 0 ? <p style={{color:'var(--muted)', fontSize:'.8rem'}}>Sin interacciones.</p> :
                   hist.map((h, i) => (
                     <div className="tli" key={i}>
                       <div className={`tldot ${h.Estado_Momento === 'Congelado' ? 'fz' : ''}`}></div>
                       <div className="tlmeta">{new Date(h.Fecha_Hora).toLocaleString()} · <strong style={{color:'var(--navy)'}}>{h.Estado_Momento}</strong> · {h.ID_Usuario}</div>
                       <div className="tlnote">{h.Notas}</div>
                     </div>
                   ))
                  }
               </div>
            </div>
          </div>

          {/* WhatsApp Chat Panel */}
          <div className={`dpanel ${tab === 'wa' ? 'on' : ''}`} style={{ display: tab === 'wa' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, padding: 0 }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--brd)', display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--s2)', flexWrap: 'wrap' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>💬</div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text)' }}>{lead?.Nombre_Persona || 'Contacto'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'monospace' }}>{lead?.LID || lead?.Telefono}</div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select 
                  value={f.Estado_Funnel || ''} 
                  onChange={e => handleWaStatusChange(e.target.value)}
                  style={{ padding: '5px 8px', fontSize: '0.75rem', borderRadius: '4px', border: '1px solid var(--brd)', outline: 'none', background: 'var(--s1)' }}
                >
                  <option value="">Status...</option>
                  {cfg.funnel?.map(x => <option key={x.stage} value={x.stage}>{x.stage}</option>)}
                </select>
                
                <button onClick={promptTask} style={{ background: 'var(--navy)', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                  + Tarea
                </button>
                
                <button
                  onClick={() => loadWaHistory(lead?.Telefono, lead?.LID)}
                  style={{ background: 'var(--s1)', border: '1px solid var(--brd)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)', padding: '4px 8px', borderRadius: '4px' }}
                  title="Recargar historial"
                >🔄</button>
              </div>
            </div>

            {/* Chat bubbles */}
            <div ref={waChatRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--bg)' }}>
              {waLoadingHist && (
                <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem' }}>Cargando historial…</p>
              )}
              {!waLoadingHist && waMessages.length === 0 && !waError && (
                <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '0.8rem', marginTop: '20px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '8px' }}>💬</div>
                  <p>Sin mensajes aún.</p>
                  <p style={{ fontSize: '0.72rem' }}>Envía el primer mensaje a {lead?.Nombre_Persona}.</p>
                </div>
              )}
              {waError && (
                <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: '8px', padding: '10px 14px', fontSize: '0.78rem', color: '#f87171', textAlign: 'center' }}>
                  ⚠️ {waError}
                </div>
              )}
              {waMessages.map((msg, i) => {
                const ts = msg.createdAt || msg.sentAt || msg.date || msg.timestamp;
                const text = msg.message || msg.body || msg.text || '';
                const isOut = msg.fromMe !== false; // treat sent msgs as outgoing
                return (
                  <div key={msg.id || i} style={{ display: 'flex', justifyContent: isOut ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '80%',
                      background: isOut ? '#005c4b' : 'var(--s2)',
                      color: isOut ? '#e9edef' : 'var(--text)',
                      padding: '8px 12px',
                      borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: '0.83rem',
                      lineHeight: '1.5',
                      wordBreak: 'break-word'
                    }}>
                      <div>{text}</div>
                      {ts && (
                        <div style={{ fontSize: '0.65rem', color: isOut ? 'rgba(233,237,239,.55)' : 'var(--muted)', textAlign: 'right', marginTop: '4px' }}>
                          {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions (Predefined msgs) */}
            <div style={{ padding: '8px 12px', background: 'var(--s1)', borderTop: '1px solid var(--brd)', display: 'flex', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
               {predefs.map((p, idx) => {
                 const isObj = typeof p === 'object' && p !== null;
                 const title = isObj ? p.title || p.text?.substring(0, 15) : p;
                 const text =  isObj ? p.text : p;
                 return (
                   <button 
                     key={idx} 
                     onClick={async () => {
                       const resolvedText = resolveVars(text);
                       if (isObj && p.imageBase64) {
                         await sendWaImage(p.imageBase64, resolvedText);
                       } else {
                         await sendWaText(resolvedText);
                       }
                     }}
                     title={text}
                     style={{ background: 'var(--s2)', border: '1px solid var(--brd)', borderRadius: '12px', padding: '5px 12px', fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                   >
                     {title}
                   </button>
                 );
               })}
            </div>

            {/* Input area */}
            <div style={{ padding: '12px', borderTop: '1px solid var(--brd)', background: 'var(--s2)', display: 'flex', gap: '8px', alignItems: 'flex-end', position: 'relative' }}>
              <input 
                type="file" 
                ref={mediaInputRef} 
                hidden 
                accept="image/*,video/*,audio/*"
                onChange={handleFileUpload}
              />
              {!isRecording ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => mediaInputRef.current?.click()}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--s1)', border: '1px solid var(--brd)', 
                      cursor: 'pointer', display: 'flex', alignItems: 'center', 
                      justifyContent: 'center', fontSize: '1.1rem'
                    }}
                    title="Adjuntar archivo (Imagen, Video, Audio)"
                  >
                    📎
                  </button>
                  <button
                    onClick={openCamera}
                    style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--s1)', border: '1px solid var(--brd)', 
                      cursor: 'pointer', display: 'flex', alignItems: 'center', 
                      justifyContent: 'center', fontSize: '1.1rem'
                    }}
                    title="Abrir cámara (Foto / Video)"
                  >
                    📷
                  </button>
                </div>
              ) : (
                <button
                  onClick={cancelRecording}
                  style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: '#fee2e2', border: '1px solid #fca5a5', color: '#ef4444',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', fontSize: '1.1rem'
                  }}
                  title="Cancelar grabación"
                >
                  🗑️
                </button>
              )}
              
              {isRecording ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', background: '#fee2e2', padding: '10px 16px', borderRadius: '20px', color: '#ef4444', fontWeight: 'bold' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                  Grabando nota de voz... {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
                </div>
              ) : (
                <textarea
                  value={waMsg}
                  onChange={e => setWaMsg(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWaMessage(); } }}
                  placeholder={`Mensaje para ${lead?.Nombre_Persona || 'contacto'}…`}
                  rows={1}
                  style={{
                    flex: 1,
                    resize: 'none',
                    background: '#ffffff',
                    border: '1px solid var(--brd)',
                    borderRadius: '20px',
                    padding: '10px 16px',
                    color: '#000000',
                    fontSize: '0.85rem',
                    outline: 'none',
                    lineHeight: '1.4',
                    maxHeight: '100px',
                    overflowY: 'auto',
                    fontFamily: 'inherit'
                  }}
                />
              )}

              {!isRecording && !waMsg.trim() ? (
                <button
                  onClick={startRecording}
                  style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    background: '#25d366',
                    border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', color: 'white'
                  }}
                  title="Grabar Nota de Voz"
                >
                  🎙️
                </button>
              ) : (
                <button
                  onClick={isRecording ? stopRecording : sendWaMessage}
                  disabled={waSending || (!isRecording && !waMsg.trim())}
                  style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    background: waSending || (!isRecording && !waMsg.trim()) ? 'var(--brd)' : '#25d366',
                    border: 'none', cursor: waSending || (!isRecording && !waMsg.trim()) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.1rem', transition: 'background .2s'
                  }}
                  title={isRecording ? "Enviar Nota de Voz" : "Enviar (Enter)"}
                >
                  {waSending ? '⏳' : '➤'}
                </button>
              )}
            </div>
            <style>{`
              @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
              @keyframes camPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.6); } 70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
            `}</style>

            {/* ── Camera Modal ── */}
            {cameraOpen && (
              <div style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.95)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '16px'
              }}>
                {/* Video Preview */}
                <video
                  ref={cameraVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', maxWidth: 480, maxHeight: '60vh', borderRadius: 16, objectFit: 'cover', background: '#000' }}
                />

                {/* Mode Switcher */}
                {!camRecording && (
                  <div style={{ display: 'flex', gap: 0, borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                    {['photo', 'video'].map(m => (
                      <button key={m} onClick={() => setCameraMode(m)} style={{
                        padding: '8px 24px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                        background: cameraMode === m ? '#25d366' : 'transparent',
                        color: cameraMode === m ? '#fff' : 'rgba(255,255,255,0.6)',
                        transition: 'all .2s'
                      }}>
                        {m === 'photo' ? '📷 Foto' : '🎬 Video'}
                      </button>
                    ))}
                  </div>
                )}

                {/* Recording Timer */}
                {camRecording && (
                  <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'camPulse 1.2s infinite' }} />
                    {Math.floor(camRecordTime / 60)}:{(camRecordTime % 60).toString().padStart(2, '0')}
                  </div>
                )}

                {/* Controls */}
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  {/* Cancel */}
                  <button onClick={closeCamera} style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.4)',
                    color: '#fff', fontSize: '1.3rem', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }} title="Cancelar">✕</button>

                  {/* Main capture button */}
                  {cameraMode === 'photo' ? (
                    <button onClick={capturePhoto} style={{
                      width: 72, height: 72, borderRadius: '50%',
                      background: '#fff', border: '4px solid rgba(255,255,255,0.5)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.8rem', boxShadow: '0 0 0 6px rgba(255,255,255,0.15)'
                    }} title="Tomar foto">📷</button>
                  ) : camRecording ? (
                    <button onClick={stopVideoCapture} style={{
                      width: 72, height: 72, borderRadius: '50%',
                      background: '#ef4444', border: '4px solid rgba(255,255,255,0.5)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.5rem', animation: 'camPulse 1.2s infinite'
                    }} title="Detener y enviar">⏹</button>
                  ) : (
                    <button onClick={startVideoCapture} style={{
                      width: 72, height: 72, borderRadius: '50%',
                      background: '#ef4444', border: '4px solid rgba(255,255,255,0.5)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.8rem', boxShadow: '0 0 0 6px rgba(239,68,68,0.3)'
                    }} title="Iniciar grabación">🎬</button>
                  )}

                  {/* Flip camera placeholder (decorative spacing) */}
                  <div style={{ width: 48 }} />
                </div>

                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                  {cameraMode === 'photo' ? 'Presiona el botón para tomar una foto' : camRecording ? 'Presiona ⏹ para detener y enviar' : 'Presiona el botón rojo para grabar'}
                </p>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* iPhone-style Toast */}
      <div style={{
        position: 'fixed',
        bottom: '32px',
        right: '24px',
        zIndex: 99999,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '8px'
      }}>
        {toast && (
          <div style={{
            background: toast.type === 'err' ? 'rgba(239,68,68,0.92)' : 'rgba(17,24,39,0.88)',
            backdropFilter: 'blur(12px)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '14px',
            fontSize: '0.88rem',
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)',
            animation: 'toastIn 0.25s ease',
            whiteSpace: 'nowrap'
          }}>
            {toast.msg}
          </div>
        )}
      </div>

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(12px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
