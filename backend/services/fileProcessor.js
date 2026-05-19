const fs = require('fs');
const pdfParse = require('pdf-parse');

async function extractTextFromFile(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text || '';
  }

  return fs.readFileSync(filePath, 'utf8');
}

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function chunkText(text, chunkSize = 1200, overlap = 200) {
  const normalized = normalizeText(text);
  const parts = normalized.split(/\n+/).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const part of parts) {
    if ((current + ' ' + part).length > chunkSize) {
      if (current) {
        chunks.push(current.trim());
      }
      current = part;
    } else {
      current = `${current} ${part}`.trim();
    }
  }

  if (current) {
    chunks.push(current.trim());
  }

  const overlapped = [];
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    if (i > 0) {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-overlap);
      chunk = `${overlapText} ${chunk}`.trim();
    }
    overlapped.push(chunk);
  }

  return overlapped;
}

module.exports = {
  extractTextFromFile,
  chunkText,
  normalizeText
};