const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.join(__dirname, 'API');

function listTree(dir, maxDepth=5, base=PROJECT_ROOT) {
    const res = [];
    function walk(current, depth) {
        if (depth > maxDepth) return;
        let entries = [];
        try {
        entries = fs.readdirSync(current, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name));
        } catch(e) { return; }
        for (const e of entries) {
        const rel = path.relative(base, path.join(current, e.name));
        if (e.isDirectory()) {
            res.push({ type: 'dir', name: e.name, path: rel });
            walk(path.join(current, e.name), depth+1);
        } else {
            res.push({ type: 'file', name: e.name, path: rel, size: fs.statSync(path.join(current, e.name)).size });
        }
        }
    }
    walk(dir, 0);
    return res;
}

app.get('/api/tree', (req, res) => {
    try {
        const t = listTree(PROJECT_ROOT, 4);
        res.json({ ok: true, tree: t });
    } catch (err) {
        res.status(500).json({ ok:false, error: err.message });
    }
});

app.get('/api/read', (req, res) => {
    const p = req.query.path || '';
    // Prevent path traversal
    const safePath = path.normalize(p).replace(/^(\.\.(\/|\\|$))+/, '');
    const full = path.join(PROJECT_ROOT, safePath);
    if (!full.startsWith(PROJECT_ROOT)) return res.status(400).json({ ok:false, error: 'Invalid path' });
    if (!fs.existsSync(full)) return res.status(404).json({ ok:false, error: 'Not found' });
    if (fs.statSync(full).isDirectory()) return res.status(400).json({ ok:false, error: 'Is a directory' });
    try {
        const content = fs.readFileSync(full, 'utf8');
        res.json({ ok:true, path: safePath, content });
    } catch(err){
        res.status(500).json({ ok:false, error: err.message });
    }
});

// Run a node file or npm script. Streams output via SSE.
app.get('/api/run', (req, res) => {
    const target = req.query.target || '';
    if (!target) return res.status(400).json({ ok:false, error:'missing target' });

    res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    res.flushHeaders();

    let child;
    try {
        if (target.startsWith('npm:')) {
            const script = target.replace(/^npm:/, '');
            // npm run HARUS di root project (bukan folder API)
            child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm',
                ['run', script],
                { cwd: __dirname, env: process.env });
        } else if (target.endsWith('.js')) {
            // jalankan file JS dari folder API
            child = spawn(process.execPath,
                [path.join(PROJECT_ROOT, target)],
                { cwd: PROJECT_ROOT, env: process.env });
        } else {
            return res.write(`event: error\ndata: ${JSON.stringify({error:"Unsupported target"})}\n\n`);
        }
    } catch (err) {
        res.write(`event: error\ndata: ${JSON.stringify({error:err.message})}\n\n`);
        return res.end();
    }

    child.stdout.on('data', (d) => {
        res.write(`data: ${d.toString()}\n\n`);
    });
    child.stderr.on('data', (d) => {
        res.write(`data: ${d.toString()}\n\n`);
    });
    child.on('close', (code) => {
        res.write(`event: done\ndata: ${JSON.stringify({code})}\n\n`);
        res.end();
    });
    req.on('close', ()=> {
        try { child.kill(); } catch(e) {}
    });
});


app.use('/', express.static(path.join(__dirname, 'public')));
app.listen(PORT, ()=>console.log('Interactive server listening on http://localhost:'+PORT));
