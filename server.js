// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const DATA_FILE = path.join(process.cwd(), 'db.json');
function loadData(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE)); }
  catch(e){ return { orders: [] }; }
}
function saveData(data){ fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/images', express.static(path.join(process.cwd(), 'images')));

if(!fs.existsSync(DATA_FILE)) saveData({ orders: [] });

function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const connections = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        connections.push({ interfaceName: name, ip: iface.address });
      }
    }
  }
  return connections;
}

/* Updated Root Route: Serves the Dashboard with Station A and Station B links */
app.get('/', (req, res) => {
  const networks = getNetworkInfo();
  const PORT = process.env.PORT || 3000;
  
  let networkSectionsHtml = networks.map(net => `
    <div class="card mb-4 shadow-sm border-start border-primary border-4">
      <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
        <span class="text-secondary font-monospace small fw-bold">${net.interfaceName}</span>
        <span class="badge bg-primary px-2 py-1">${net.ip}</span>
      </div>
      <div class="card-body bg-white py-3">
        <p class="text-muted small mb-3">If your tablets are connected to this network, enter these exact web directions:</p>
        
        <div class="mb-3">
          <label class="form-label font-monospace xs-label fw-bold text-primary mb-1">FRONT DESK TABLET URL</label>
          <div class="p-2 bg-light border rounded font-monospace small text-break select-all text-primary fw-bold">
            http://${net.ip}:${PORT}/front.html
          </div>
        </div>

        <div class="mb-3">
          <label class="form-label font-monospace xs-label fw-bold text-danger mb-1">KITCHEN: STATION A (Bhel / Butter Chicken)</label>
          <div class="p-2 bg-light border rounded font-monospace small text-break select-all text-danger fw-bold">
            http://${net.ip}:${PORT}/kitchen.html?station=A
          </div>
        </div>

        <div class="mb-1">
          <label class="form-label font-monospace xs-label fw-bold text-warning mb-1">KITCHEN: STATION B (Pavs / Chole / Chat)</label>
          <div class="p-2 bg-light border rounded font-monospace small text-break select-all text-warning fw-bold">
            http://${net.ip}:${PORT}/kitchen.html?station=B
          </div>
        </div>
      </div>
    </div>
  `).join('');

  if (networks.length === 0) {
    networkSectionsHtml = `<div class="alert alert-warning py-3 text-center">⚠️ No active Wi-Fi or Hotspot network detected.</div>`;
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"><title>Summer Festival Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>body{background:#f4f7f6;font-family:system-ui;} .select-all{user-select:all; cursor:pointer;}</style>
  </head>
  <body class="d-flex align-items-center justify-content-center min-vh-100 p-3">
    <div class="w-100" style="max-width: 650px; background: white; border-radius: 16px; padding: 2rem; box-shadow: 0 12px 40px rgba(0,0,0,0.06);">
      <div class="text-center mb-4"><h2 class="fw-bold">Summer Festival 2026</h2><p class="text-muted small">Stall Control Panel</p></div>
      ${networkSectionsHtml}
      <hr class="my-4">
      <div class="row g-2">
        <div class="col-4"><a href="/front.html" target="_blank" class="btn btn-outline-primary w-100">Launch Front</a></div>
        <div class="col-4"><a href="/kitchen.html?station=A" target="_blank" class="btn btn-outline-danger w-100">Station A</a></div>
        <div class="col-4"><a href="/kitchen.html?station=B" target="_blank" class="btn btn-outline-warning w-100">Station B</a></div>
      </div>
    </div>
  </body></html>`;
  res.send(html);
});

/* NEW: Generates and downloads the Excel file on demand */
app.get('/export', (req, res) => {
  const data = loadData();
  let rows = "Item Name,Quantity,Time,Date,Order Number,Status\n";
  
  data.orders.forEach(order => {
    const now = new Date(order.createdAt);
    const pad = (num) => String(num).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const dateStr = now.toISOString().split('T')[0];
    
    order.items.forEach(it => {
      rows += `${it.name},${it.qty},${timeStr},${dateStr},${order.orderNumber},${it.status}\n`;
    });
  });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=festival_orders_${Date.now()}.csv`);
  res.status(200).send(rows);
});

app.get('/state', (req, res) => {
  const data = loadData();
  const active = data.orders.filter(o => o.status !== 'completed');
  res.json({ orders: active });
});

app.get('/history', (req, res) => {
  res.json({ orders: loadData().orders });
});

app.post('/order', (req, res) => {
  const { items } = req.body;
  if(!items || items.length === 0) return res.status(400).json({ error: 'no items' });
  const data = loadData();
  const id = Date.now();
  const orderNumber = 'ORD' + String(id).slice(-6);
  
  const mappedItems = items.map((it, idx) => {
    // ADDED: Kulfi is now recognized as a front desk instant item
    const isFrontDeskItem = ['Lassi', 'Kokam Sherbet', 'Kulfi'].includes(it.name);
    return {
      id: `${id}-${idx}`,
      name: it.name,
      qty: it.qty || 1,
      status: isFrontDeskItem ? 'ready' : 'placed'
    };
  });

  const allReady = mappedItems.every(i => i.status === 'ready');
  const order = { id, orderNumber, createdAt: new Date().toISOString(), status: allReady ? 'ready' : 'placed', items: mappedItems };
  
  data.orders.push(order);
  saveData(data);
  io.emit('order:new', order);
  res.json({ ok: true, order });
});

app.post('/item/update', (req, res) => {
  const { itemId, status } = req.body;
  const data = loadData();
  let changed = false;
  for(const order of data.orders){
    for(const item of order.items){
      if(item.id === itemId){ item.status = status; changed = true; }
    }
    const anyInProgress = order.items.some(i => i.status === 'in_progress');
    const allReady = order.items.every(i => i.status === 'ready' || i.status === 'collected');
    const allCollected = order.items.every(i => i.status === 'collected');

    if (allCollected) { order.status = 'completed'; order.completedAt = new Date().toISOString(); } 
    else if (allReady) { order.status = 'ready'; } 
    else if (anyInProgress) { order.status = 'in_progress'; } 
    else { order.status = 'placed'; }
  }
  if(changed){ saveData(data); io.emit('order:update'); return res.json({ ok:true }); }
  return res.status(404).json({ error: 'not found' });
});

app.post('/order/edit-item', (req, res) => {
  const { orderNumber, itemId, newName, newQty } = req.body;
  const data = loadData();
  let changed = false;
  for(const order of data.orders){
    if(order.orderNumber === orderNumber){
      for(const item of order.items){
        if(item.id === itemId){
          if(newName) item.name = newName;
          if(newQty) item.qty = parseInt(newQty) || item.qty;
          changed = true;
        }
      }
    }
  }
  if(changed){ saveData(data); io.emit('order:update'); return res.json({ ok:true }); }
  return res.status(404).json({ error:'not found' });
});

app.post('/order/delete-item', (req, res) => {
  const { orderNumber, itemId } = req.body;
  const data = loadData();
  let changed = false;
  for(const order of data.orders){
    if(order.orderNumber === orderNumber){
      const before = order.items.length;
      order.items = order.items.filter(it => it.id !== itemId);
      if(order.items.length !== before) changed = true;
    }
  }
  data.orders = data.orders.filter(o => o.items.length > 0);
  if(changed){ saveData(data); io.emit('order:update'); return res.json({ ok:true }); }
  return res.status(404).json({ error:'not found' });
});

io.on('connection', socket => {
  const role = socket.handshake.query.role;
  console.log(`Client connected: ${socket.id} (Role: ${role})`);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  const startCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${startCommand} http://localhost:${PORT}`, (err) => {});
});