const fs = require('fs');
const path = require('path');

const sriHashesPath = path.resolve(__dirname, 'sri-hashes.json');
if (!fs.existsSync(sriHashesPath)) {
    console.error('Error: sri-hashes.json not found. Run generateSri.js first.');
    process.exit(1);
}

const sriHashes = JSON.parse(fs.readFileSync(sriHashesPath, 'utf8'));
const indexPath = path.resolve(__dirname, '..', 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');

let errors = 0;

// Check index.html tags
const scriptRegex = /<script\s+[^>]*src="([^"]+)"[^>]*>/g;
const linkRegex = /<link\s+[^>]*href="([^"]+)"[^>]*>/g;

function checkTag(tag, src, type) {
    // Only check local assets that we have hashes for
    if (sriHashes[src]) {
        const expectedSri = sriHashes[src];
        const integrityMatch = tag.match(/integrity="([^"]+)"/);
        
        if (!integrityMatch) {
            console.error(`Error: Missing integrity attribute for ${type}: ${src}`);
            errors++;
        } else if (integrityMatch[1] !== expectedSri) {
            console.error(`Error: Mismatched integrity for ${src}. Expected ${expectedSri}, found ${integrityMatch[1]}`);
            errors++;
        }

        if (!tag.includes('crossorigin="anonymous"')) {
            console.error(`Error: Missing crossorigin="anonymous" for ${type}: ${src}`);
            errors++;
        }
    }
}

let match;
while ((match = scriptRegex.exec(indexContent)) !== null) {
    checkTag(match[0], match[1], 'script');
}

while ((match = linkRegex.exec(indexContent)) !== null) {
    // Skip external links like Google Fonts
    if (match[1].startsWith('http')) continue;
    checkTag(match[0], match[1], 'link');
}

// Also check pdfWorker.js for qpdf.wasm hash
const workerPath = path.resolve(__dirname, '..', 'services/pdfWorker.js');
const workerContent = fs.readFileSync(workerPath, 'utf8');
const wasmSriMatch = workerContent.match(/const wasmSri = '([^']+)'/);
if (wasmSriMatch) {
    const expectedSri = sriHashes['assets/vendor/qpdf/qpdf.wasm'];
    if (wasmSriMatch[1] !== expectedSri) {
        console.error(`Error: Mismatched integrity for qpdf.wasm in pdfWorker.js. Expected ${expectedSri}, found ${wasmSriMatch[1]}`);
        errors++;
    }
} else {
    console.warn('Warning: Could not find wasmSri in pdfWorker.js');
}

if (errors === 0) {
    console.log('All SRI checks passed!');
    process.exit(0);
} else {
    console.error(`Found ${errors} SRI errors.`);
    process.exit(1);
}
