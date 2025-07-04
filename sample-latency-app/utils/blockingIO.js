const fs = require('fs');
const path = require('path');

// Blocking synchronous file read (latency flaw)
function blockingRead() {
  const filePath = path.join(__dirname, 'config.json');
  try {
    // This will block the event loop
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return { message: 'No config file found.' };
  } catch (e) {
    return { error: e.message };
  }
}

module.exports = { blockingRead };
