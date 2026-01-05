const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDatabase } = require('./db');

const ASSETS_DIR = 'assets';

function getAssetsPath() {
  return path.join(app.getPath('userData'), ASSETS_DIR);
}

function storeAsset({ type, filename, data, metadata }) {
  const db = getDatabase();
  const assetsPath = getAssetsPath();
  fs.mkdirSync(assetsPath, { recursive: true });
  const filePath = path.join(assetsPath, filename);
  fs.writeFileSync(filePath, data);
  const result = db
    .prepare(
      `INSERT INTO assets (type, path, metadata, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    )
    .run(type, filePath, metadata ? JSON.stringify(metadata) : null);
  return {
    id: result.lastInsertRowid,
    path: filePath,
  };
}

module.exports = {
  getAssetsPath,
  storeAsset,
};
