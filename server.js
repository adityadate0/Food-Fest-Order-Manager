// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'db.json');
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

// ensure data file exists
if(!fs.existsSync(DATA_FILE)) saveData({ orders: [] });

// Return only active orders (hide completed)
app.get('/state', (req, res) => {
  const data = loadData();
  const active = data.orders.filter(o => o.status !== 'completed');
  res.json({ orders: active });
});

// Return full history including completed
app.get('/history', (req, res) => {
  const data = loadData();
  res.json({ orders: data.orders });
});

// Create order
app.post('/order', (req, res) => {
  const { items } = req.body;
  if(!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'no items' });
  const data = loadData();
  const id = Date.now();
  const orderNumber = 'ORD' + String(id).slice(-6);
  const order = {
    id,
    orderNumber,
    createdAt: new Date().toISOString(),
    status: 'placed',
    items: items.map((it, idx) => ({
      id: `${id}-${idx}`,
      name: it.name,
      qty: it.qty || 1,
      status: 'placed'
    }))
  };
  data.orders.push(order);
  saveData(data);
  io.emit('order:new', order);
  res.json({ ok: true, order });
});

// Update single item status (kitchen)
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
    // update order status based on items
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

// Edit an item inside a placed order (change name and/or qty)
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

// Delete an item from an order (or delete whole order if no items left)
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
  console.log('client connected', socket.id);
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => console.log(`Server running on ${HOST}:${PORT}`));
