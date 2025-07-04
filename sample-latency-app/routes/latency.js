const express = require('express');
const router = express.Router();
const { calculateUserMetrics } = require('../utils/dataProcessor');
const { loadConfig } = require('../utils/configManager');

// Simulate latency endpoint with intentional flaws
router.get('/', (req, res) => {
  // Flaw 1: Blocking synchronous file read
  const config = loadConfig();

  // Flaw 2: Inefficient calculation
  const result = calculateUserMetrics(5000);

  // Flaw 3: Artificial delay
  setTimeout(() => {
    res.json({
      latency: Math.random() * 500 + 500, // Simulate high latency in ms
      config,
      result,
      timestamp: new Date().toISOString()
    });
  }, 1000); // 1 second artificial delay
});

module.exports = router;
