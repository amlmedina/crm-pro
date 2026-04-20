import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Define path to the local db file
const dataDir = path.join(process.cwd(), 'crm_data');
const tasksFile = path.join(dataDir, 'tasks.json');

// Ensure directory and file exist
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(tasksFile)) {
    fs.writeFileSync(tasksFile, JSON.stringify([]));
}

function getTasks() {
    try {
        const raw = fs.readFileSync(tasksFile, 'utf8');
        return JSON.parse(raw);
    } catch {
        return [];
    }
}

function saveTasks(tasks) {
    fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
}

export async function POST(req) {
    try {
        const payload = await req.json();
        const action = payload.action;

        // ── LIST TASKS ──
        if (action === 'list') {
            const all = getTasks();
            return NextResponse.json(all);
        }

        // ── CREATE TASK ──
        if (action === 'create') {
            const { text, assignee, leadId, leadName, dueDate } = payload;
            const tasks = getTasks();
            const newTask = {
                id: 'tsk_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
                text: text || 'Sin descripción',
                assignee: assignee || 'No asignado',
                leadId: leadId || null,
                leadName: leadName || 'Sin Lead',
                dueDate: dueDate || null,
                status: 'pending', // 'pending', 'doing', 'done'
                createdAt: new Date().toISOString()
            };
            tasks.push(newTask);
            saveTasks(tasks);
            return NextResponse.json({ ok: true, task: newTask });
        }

        // ── UPDATE TASK STATUS ──
        if (action === 'update_status') {
            const { taskId, status } = payload;
            const tasks = getTasks();
            const idx = tasks.findIndex(t => t.id === taskId);
            if (idx > -1) {
                tasks[idx].status = status;
                tasks[idx].updatedAt = new Date().toISOString();
                saveTasks(tasks);
                return NextResponse.json({ ok: true, task: tasks[idx] });
            }
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        // ── DELETE TASK ──
        if (action === 'delete') {
            const { taskId } = payload;
            let tasks = getTasks();
            const originalLength = tasks.length;
            tasks = tasks.filter(t => t.id !== taskId);
            
            if (tasks.length < originalLength) {
                saveTasks(tasks);
                return NextResponse.json({ ok: true });
            }
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error) {
        console.error('[/api/tasks] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
