const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const DATA_DIR = '/data';
const DATA_FILE = path.join(DATA_DIR, 'notes.json');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify([]));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.get('/notes', (req, res) => {
  const notes = JSON.parse(fs.readFileSync(DATA_FILE));
  res.json(notes);
});

app.post('/notes', (req, res) => {
  const notes = JSON.parse(fs.readFileSync(DATA_FILE));
  const note = { id: Date.now(), text: req.body.text, created: new Date() };
  notes.push(note);
  fs.writeFileSync(DATA_FILE, JSON.stringify(notes, null, 2));
  res.status(201).json(note);
});

app.listen(3000, () => console.log('API running on port 3000'));