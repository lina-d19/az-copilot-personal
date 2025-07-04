const express = require('express');
const latencyRoutes = require('./routes/latency');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/latency', latencyRoutes);

app.get('/', (req, res) => {
  res.send('Sample Latency App is running.');
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
