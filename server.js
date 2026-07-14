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

let currentCsvFile = null;

function appendOrderToExcel(order) {
  if (!currentCsvFile) return;
  let rows = "";
  
  const now = new Date(order.createdAt);
  const pad = (num) => String(num).padStart(2, '0');
  
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = now.toISOString().split('T')[0];
  
  order.items.forEach(it => {
    rows += `${it.name},${it.qty},${timeStr},${dateStr},${order.orderNumber},${it.status}\n`;
  });
  fs.appendFileSync(currentCsvFile, rows, 'utf8');
}

/* Dynamic Network Sniffer: Discovers your true Hotspot or local Wi-Fi IP */
function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const connections = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Isolate active, non-loopback IPv4 network addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        connections.push({ interfaceName: name, ip: iface.address });
      }
    }
  }
  return connections;
}

/* Root Route: Serves a beautiful, responsive Server Connection Dashboard */
app.get('/', (req, res) => {
  const networks = getNetworkInfo();
  const PORT = process.env.PORT || 3000;
  
  // Choose primary IP discovered, fallback to localhost if offline
  const primaryIP = networks.length > 0 ? networks[0].ip : '127.0.0.1';

  let networkCardsHtml = networks.map(net => `
    <div class="card mb-2 shadow-sm border-start border-primary border-4">
      <div class="card-body py-2 px-3 d-flex justify-content-between align-items-center">
        <span class="text-secondary font-monospace small">${net.interfaceName}</span>
        <strong class="text-dark fs-5">${net.ip}</strong>
      </div>
    </div>
  `).join('');

  if (networks.length === 0) {
    networkCardsHtml = `
      <div class="alert alert-warning py-2 small">
        ⚠️ No active Wi-Fi or Hotspot network detected. Connect devices to test terminal synchronization.
      </div>
    `;
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Summer Festival Server Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
      body { background-color: #f4f7f6; font-family: system-ui, -apple-system, sans-serif; }
      .dashboard-card { max-width: 650px; background: white; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.06); }
      .url-box { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; font-family: monospace; font-size: 1.05rem; }
    </style>
  </head>
  <body class="d-flex align-items-center justify-content-center min-vh-100 p-3">
    <div class="dashboard-card w-100 p-4 p-md-5">
      <div class="text-center mb-4">
        <h2 class="fw-bold text-dark m-0">Summer Festival 2026</h2>
        <p class="text-muted small uppercase tracking-wider mt-1">Stall Order Management Control Panel</p>
      </div>

      <h5 class="fw-bold mb-3 text-secondary">📡 Active Laptop IPs</h5>
      ${networkCardsHtml}

      <hr class="my-4 opacity-10">

      <h5 class="fw-bold mb-3 text-success">📱 Tablet Device URLs</h5>
      <p class="text-muted small">Connect your tablets to the laptop hotspot, open their web browsers, and enter these exact web directions:</p>
      
      <div class="mb-3">
        <label class="form-label font-monospace small fw-bold text-primary">FRONT DESK TABLET URL</label>
        <div class="p-3 url-box text-break select-all text-primary fw-bold">http://${primaryIP}:${PORT}/front.html</div>
      </div>

      <div class="mb-4">
        <label class="form-label font-monospace small fw-bold text-danger">KITCHEN MONITOR TABLET URL</label>
        <div class="p-3 url-box text-break select-all text-danger fw-bold">http://${primaryIP}:${PORT}/kitchen.html</div>
      </div>

      <div class="row g-2 pt-2">
        <div class="col-6">
          <a href="/front.html" target="_blank" class="btn btn-outline-primary w-100 py-2 font-weight-bold">Launch Front Desk Here</a>
        </div>
        <div class="col-6">
          <a href="/kitchen.html" target="_blank" class="btn btn-outline-danger w-100 py-2 font-weight-bold">Launch Kitchen Here</a>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

app.get('/state', (req, res) => {
  const data = loadData();
  const active = data.orders.filter(o => o.status !== 'completed');
  res.json({ orders: active });
});

app.get('/history', (req, res) => {
  const data = loadData();
  res.json({ orders: data.orders });
});

app.post('/order', (req, res) => {
  const { items } = req.body;
  if(!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'no items' });
  const data = loadData();
  const id = Date.now();
  const orderNumber = 'ORD' + String(id).slice(-6);
  
  const mappedItems = items.map((it, idx) => {
    const isDrink = it.name === 'Lassi' || it.name === 'Kokam Sherbet';
    return {
      id: `${id}-${idx}`,
      name: it.name,
      qty: it.qty || 1,
      status: isDrink ? 'ready' : 'placed'
    };
  });

  const allReady = mappedItems.every(i => i.status === 'ready');

  const order = {
    id,
    orderNumber,
    createdAt: new Date().toISOString(),
    status: allReady ? 'ready' : 'placed',
    items: mappedItems
  };
  
  data.orders.push(order);
  saveData(data);
  appendOrderToExcel(order);
  
  io.emit('order:new', order);
  res.json({ ok: true, order });
});

app.post('/item/update', (req, res) => {
  const { itemId, status } = req.body;
  if(!itemId || !status) return res.status(400).json({ error: 'missing' });
  const data = loadData();
  let changed = false;
  for(const order of data.orders){
    for(const item of order.items){
      if(item.id === itemId){
        item.status = status;
        changed = true;
      }
    }
    const anyInProgress = order.items.some(i => i.status === 'in_progress');
    const allReady = order.items.every(i => i.status === 'ready' || i.status === 'collected');
    const allCollected = order.items.every(i => i.status === 'collected');

    if (allCollected) {
      order.status = 'completed';
      order.completedAt = new Date().toISOString();
    } else if (allReady) {
      order.status = 'ready';
    } else if (anyInProgress) {
      order.status = 'in_progress';
    } else {
      order.status = 'placed';
    }
  }
  if(changed){
    saveData(data);
    io.emit('order:update');
    return res.json({ ok:true });
  } else {
    return res.status(404).json({ error: 'item not found' });
  }
});

app.post('/order/edit-item', (req, res) => {
  const { orderNumber, itemId, newName, newQty } = req.body;
  if(!orderNumber || !itemId) return res.status(400).json({ error: 'missing' });
  const data = loadData();
  let changed = false;
  for(const order of data.orders){
    if(order.orderNumber === orderNumber){
      for(const item of order.items){
        if(item.id === itemId){
          if(newName) item.name = newName;
          if(newQty !== null && newQty !== undefined) item.qty = parseInt(newQty) || item.qty;
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
  if(!orderNumber || !itemId) return res.status(400).json({ error: 'missing' });
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
  console.log(`Client tied to stall network: ${socket.id} (Role: ${role})`);

  if (role === 'front') {
    saveData({ orders: [] });
    io.emit('order:update'); 

    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/[:.]/g, '-').slice(0, 19);
    
    currentCsvFile = path.join(process.cwd(), `festival_orders_${timestamp}.csv`);
    
    const headers = "Item Name,Quantity,Time,Date,Order Number,Status\n";
    fs.writeFileSync(currentCsvFile, headers, 'utf8');
    console.log(`Generated spreadsheet logging track: ${currentCsvFile}`);
  }

  socket.on('disconnect', () => {
    if (role === 'front') {
      console.log(`Front Desk page closed. Log preserved on disk: ${currentCsvFile}`);
      currentCsvFile = null;
      saveData({ orders: [] });
      io.emit('order:update');
    }
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  
  // Cross-platform engine to auto-open the default browser upon server startup
  const localUrl = `http://localhost:${PORT}`;
  const startCommand = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  
  exec(`${startCommand} ${localUrl}`, (err) => {
    if (err) console.log(`Dashboard booted successfully at ${localUrl}`);
  });
});