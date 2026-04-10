const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const assets = [
    'ui/app.js',
    'ui/styles.css',
    'services/pdfService.js',
    'services/batchService.js',
    'services/auditService.js',
    'services/pdfWorker.js',
    'sw-register.js',
    'assets/vendor/jszip.min.js',
    'assets/vendor/qpdf/qpdf.js',
    'assets/vendor/qpdf/qpdf.wasm'
];

function generateSri(filePath) {
    const fullPath = path.resolve(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) {
        console.warn(`Warning: File not found: ${filePath}`);
        return null;
    }
    const fileBuffer = fs.readFileSync(fullPath);
    const hash = crypto.createHash('sha384').update(fileBuffer).digest('base64');
    return `sha384-${hash}`;
}

const results = {};
assets.forEach(asset => {
    const sri = generateSri(asset);
    if (sri) {
        results[asset] = sri;
    }
});

console.log(JSON.stringify(results, null, 2));

// Also write to a file for verifySri.js to use
fs.writeFileSync(path.resolve(__dirname, 'sri-hashes.json'), JSON.stringify(results, null, 2));
console.log('\nHashes written to scripts/sri-hashes.json');
