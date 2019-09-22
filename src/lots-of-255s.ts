const fs = require('fs');

const buffer = Buffer.alloc(44100 * 50, 255);
fs.writeFileSync('255s.raw', buffer);