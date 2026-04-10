const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.resolve(__dirname, 'sri-hashes.json');

/**
 * Recursively finds all files in a directory.
 * @param {string} dir - Directory to search.
 * @param {string[]} filelist - Accumulated list of files.
 * @returns {string[]}
 */
function walkSync(dir, filelist = []) {
    if (!fs.existsSync(dir)) return filelist;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            filelist = walkSync(filePath, filelist);
        } else {
            filelist.push(filePath);
        }
    });
    return filelist;
}

const targetDirs = ['ui', 'services', 'assets/vendor'];
const individualFiles = ['sw-register.js', 'sw.js'];
const extensions = ['.js', '.css', '.wasm'];

let allFiles = [];

// Discover files in target directories
targetDirs.forEach(dir => {
    const dirPath = path.join(ROOT_DIR, dir);
    allFiles = allFiles.concat(walkSync(dirPath));
});

// Add individual files from root
individualFiles.forEach(file => {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
        allFiles.push(filePath);
    }
});

// Filter by extension and normalize paths
const assets = allFiles
    .filter(file => {
        const ext = path.extname(file);
        const name = path.basename(file);
        return extensions.includes(ext) && !name.startsWith('.');
    })
    .map(file => path.relative(ROOT_DIR, file).replace(/\\/g, '/'))
    .sort();

/**
 * Generates SRI hash for a file.
 * @param {string} filePath - Path relative to root.
 * @returns {string|null}
 */
function generateSri(filePath) {
    const fullPath = path.resolve(ROOT_DIR, filePath);
    try {
        const fileBuffer = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha384').update(fileBuffer).digest('base64');
        return `sha384-${hash}`;
    } catch (error) {
        console.warn(`Warning: Could not process ${filePath}: ${error.message}`);
        return null;
    }
}

const results = {};
assets.forEach(asset => {
    const sri = generateSri(asset);
    if (sri) {
        results[asset] = sri;
    }
});

// Write to scripts/sri-hashes.json
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

console.log(`Generated SRI hashes for ${Object.keys(results).length} assets.`);
console.log('Results written to scripts/sri-hashes.json');
