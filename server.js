import express from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import stripAnsi from 'strip-ansi';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

const scriptMap = {
    "deposit:prod": ["cross-env", "NODE_ENV=production", "node", "API/S88/trx-deposit/deposit.js"],
    "deposit:stag": ["cross-env", "NODE_ENV=staging", "node", "API/S88/trx-deposit/deposit.js"],
    "v2:prod": ["cross-env", "NODE_ENV=production", "node", "API/S88/trx-deposit/depositV2.js"],
    "v2:stag": ["cross-env", "NODE_ENV=staging", "node", "API/S88/trx-deposit/depositV2.js"],
    "payout:prod": ["cross-env", "NODE_ENV=production", "node", "API/S88/trx-payout/payout.js"],
    "payout:stag": ["cross-env", "NODE_ENV=staging", "node", "API/S88/trx-payout/payout.js"],
    "pbodp:stag": ["cross-env", "NODE_ENV=PayBO_staging", "node", "API/PayBO/trx-deposit/paybo-deposit.js"],
    "pbov2:stag": ["cross-env", "NODE_ENV=PayBO_staging", "node", "API/PayBO/trx-deposit/paybo-depositV2.js"],
    "pbov4:stag": ["cross-env", "NODE_ENV=PayBO_staging", "node", "API/PayBO/trx-deposit/paybo-depositV4.js"],
    "pbodp:prod": ["cross-env", "NODE_ENV=production", "node", "API/PayBO/trx-deposit/paybo-deposit.js"],
    "pbov2:prod": ["cross-env", "NODE_ENV=production", "node", "API/PayBO/trx-deposit/paybo-depositV2.js"],
    "pbov4:prod": ["cross-env", "NODE_ENV=production", "node", "API/PayBO/trx-deposit/paybo-depositV4.js"],
    "pbowd:stag": ["cross-env", "NODE_ENV=PayBO_staging", "node", "API/PayBO/trx-payout/paybo-payout.js"],
    "pbowd:prod": ["cross-env", "NODE_ENV=PayBO_production", "node", "API/PayBO/trx-payout/paybo-payout.js"],
};

const allowedScripts = new Set(Object.keys(scriptMap));

function formatLog(raw) {
  const clean = stripAnsi(raw.toString());
  return clean
    .replace(/\binfo\b:/gi, 'Info:')
    .replace(/\bwarn\b:/gi, 'Warning:')
    .replace(/\berror\b:/gi, 'Error:');
}

wss.on('connection', ws => {
  let child = null;

  ws.on('message', message => {
    try {
      const msg = JSON.parse(message);
      console.log('Received msg:', msg);

      if (msg.type === 'run-script') {
        if (!allowedScripts.has(msg.script)) {
          ws.send(JSON.stringify({ type: 'error', data: 'Script not allowed.' }));
          return;
        }

        if (child) {
          child.kill();
          child = null;
        }

        const command = scriptMap[msg.script];

        if (!command) {
          ws.send(JSON.stringify({ type: 'error', data: 'Script tidak ditemukan.' }));
          return;
        }

        child = spawn('npx', command, {
          cwd: process.cwd(),
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        console.log(`▶️ Spawned: npx ${command.join(' ')}`);

        child.stdout.on('data', data => {
          const output = formatLog(data);
          ws.send(JSON.stringify({ type: 'stdout', data: output }));
        });

        child.stderr.on('data', data => {
          const output = formatLog(data);
          ws.send(JSON.stringify({ type: 'stderr', data: output }));
        });

        child.on('close', code => {
          ws.send(JSON.stringify({ type: 'close', code }));
          child = null;
        });

      } else if (msg.type === 'stdin' && child) {
        child.stdin.write(msg.data);
      }

    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', data: 'Format pesan tidak valid.' }));
    }
  });

  ws.on('close', () => {
    if (child) {
      child.kill();
      child = null;
    }
  });
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`✅ Server listening on http://localhost:${PORT}`);
});
