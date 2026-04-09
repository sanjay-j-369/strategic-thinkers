const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf-8');
  content = content.replace(/rounded-\[28px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[24px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[22px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[20px\]/g, 'rounded-2xl');
  content = content.replace(/rounded-\[16px\]/g, 'rounded-2xl');
  
  if (filePath.endsWith('ui/dialog.tsx')) {
    content = content.replace(/bg-\[linear-gradient[^\]]*\]/g, 'bg-background');
    content = content.replace(/shadow-\[0_32px_120px_rgba[^\]]*\]/g, 'shadow-xl');
  }
  fs.writeFileSync(filePath, content);
}

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      replaceInFile(fullPath);
    }
  }
}

processDir('frontend/app');
processDir('frontend/components');
