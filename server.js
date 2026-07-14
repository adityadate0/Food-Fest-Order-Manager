// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

// FIX: Changed __dirname to process.cwd() so db.json writes natively to the host disk
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
// NOTE: express.static safely keeps __dirname because static assets are baked inside the binary snapshot
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
    
    // FIX: Changed __dirname to process.cwd() so spreadsheets generate cleanly next to the executable file
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
server.listen(PORT, HOST, () => console.log(`Server running on ${HOST}:${PORT}`));