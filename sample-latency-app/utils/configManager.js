// configManager.js
// Handles configuration file access (with intentional blocking I/O for demo)

const fs = require('fs');
const path = require('path');

function loadConfig() {
  const filePath = path.join(__dirname, 'config.json');
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return { message: 'No config file found.' };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { loadConfig };
