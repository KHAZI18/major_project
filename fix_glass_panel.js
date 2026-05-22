const fs = require('fs');

const file = 'src/pages/BalloonPopSequence.jsx';
let content = fs.readFileSync(file, 'utf8');

// Replace all occurrences of glass-panel
content = content.replace(/glass-panel/g, 'bg-white rounded-3xl');

fs.writeFileSync(file, content);
console.log('Complete');
