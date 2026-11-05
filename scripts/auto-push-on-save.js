const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const workspaceRoot = path.resolve(__dirname, '..');
const pendingSaves = new Map();
const queuedFiles = [];
let processing = false;

function runGit(args) {
  return execFileSync('git', args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function isExcluded(relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  return normalizedPath.split('/').some((part) => part === '.git' || part === 'node_modules') ||
    /(^|\/)\.env(?:\.|$)|(^|\/)(?:secrets?|credentials?)(?:\/|\.|$)|\.(?:sqlite3?|db|pem|p12|pfx|key)$/i.test(normalizedPath);
}

function isTracked(relativePath) {
  try {
    runGit(['ls-files', '--error-unmatch', '--', relativePath]);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

function hasChanges(relativePath) {
  return Boolean(runGit(['status', '--porcelain', '--untracked-files=no', '--', relativePath]));
}

function processNextFile() {
  if (processing || queuedFiles.length === 0) return;
  processing = true;
  const relativePath = queuedFiles.shift();

  try {
    if (!isExcluded(relativePath) && isTracked(relativePath) && hasChanges(relativePath)) {
      runGit(['add', '-A', '--', relativePath]);
      runGit(['commit', '--only', '-m', `Auto-update ${relativePath}`, '--', relativePath]);
      console.log(`Committed saved file: ${relativePath}`);
      runGit(['push']);
      console.log(`Pushed saved file: ${relativePath}`);
    }
  } catch (error) {
    const details = error.stderr ? error.stderr.toString().trim() : error.message;
    console.error(`Auto-push failed for ${relativePath}: ${details}`);
  } finally {
    processing = false;
    processNextFile();
  }
}

function queueSavedFile(filename) {
  if (!filename) return;
  const relativePath = path.normalize(String(filename)).replace(/\\/g, '/');
  if (relativePath.startsWith('../') || path.isAbsolute(relativePath) || isExcluded(relativePath)) return;

  const existingTimer = pendingSaves.get(relativePath);
  if (existingTimer) clearTimeout(existingTimer);
  pendingSaves.set(relativePath, setTimeout(() => {
    pendingSaves.delete(relativePath);
    queuedFiles.push(relativePath);
    processNextFile();
  }, 1200));
}

const watcher = fs.watch(workspaceRoot, { recursive: true }, (_eventType, filename) => {
  queueSavedFile(filename);
});

watcher.on('error', (error) => {
  console.error('Auto-push file watcher failed:', error);
  process.exitCode = 1;
});

console.log(`Auto-push watcher started at ${workspaceRoot}; only tracked, non-sensitive files are pushed.`);
