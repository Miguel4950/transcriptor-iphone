// Vercel Serverless Function — Motor iPhone Pro para Groq Whisper Large v3
// Soporta:
// 1. Web App iOS (WAV 16kHz / MP4 / WebM en tramos de 2 min < 22 MB)
// 2. Atajos Nativos de iPhone (iOS Shortcuts: M4A, MP4, CAF, WAV, tanto en modo "Archivo" como "Formulario")
// 3. Respuesta directa en texto plano (?format=text) para copiar directo al portapapeles de iOS
// CERO API KEYS HARDCODEADAS.

export const config = {
  api: {
    bodyParser: false
  },
  maxDuration: 60
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Si el usuario en iPhone Shortcuts configuró "Formulario" (multipart/form-data) en vez de "Archivo",
// extraemos automáticamente el binario de audio para que nunca falle.
function extractAudioIfMultipart(rawBuffer, contentTypeHeader) {
  const ct = (contentTypeHeader || '');
  if (!ct.toLowerCase().includes('multipart/form-data')) {
    return { buffer: rawBuffer, innerMime: ct };
  }

  const boundaryMatch = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return { buffer: rawBuffer, innerMime: ct };
  }

  const boundaryStr = '--' + (boundaryMatch[1] || boundaryMatch[2]).trim();
  const headerEndMarker = Buffer.from('\r\n\r\n');
  const headerEndIdx = rawBuffer.indexOf(headerEndMarker);
  if (headerEndIdx === -1) {
    return { buffer: rawBuffer, innerMime: ct };
  }

  const partHeaders = rawBuffer.slice(0, headerEndIdx).toString('utf-8');
  const mimeMatch = partHeaders.match(/Content-Type:\s*([^\r\n;]+)/i);
  const innerMime = mimeMatch ? mimeMatch[1].trim() : 'audio/m4a';

  const dataStart = headerEndIdx + 4;
  const closingBoundary = Buffer.from('\r\n' + boundaryStr);
  const closingIdx = rawBuffer.indexOf(closingBoundary, dataStart);

  if (closingIdx !== -1 && closingIdx > dataStart) {
    return {
      buffer: rawBuffer.slice(dataStart, closingIdx),
      innerMime
    };
  }

  return { buffer: rawBuffer.slice(dataStart), innerMime };
}

function detectAudioFormat(buffer, contentTypeHeader) {
  const ct = (contentTypeHeader || '').toLowerCase();

  if (buffer && buffer.length >= 12) {
    const magic4 = buffer.slice(0, 4).toString('ascii');
    const magic4to8 = buffer.slice(4, 8).toString('ascii');

    if (magic4 === 'RIFF') {
      return { ext: 'wav', mime: 'audio/wav' };
    }
    if (magic4to8 === 'ftyp') {
      // Formato nativo de iPhone / iOS Voice Memos / Atajos (M4A / MP4 AAC)
      return { ext: 'm4a', mime: 'audio/m4a' };
    }
    if (magic4 === 'OggS') {
      return { ext: 'ogg', mime: 'audio/ogg' };
    }
    if (magic4 === 'fLaC') {
      return { ext: 'flac', mime: 'audio/flac' };
    }
    if (buffer[0] === 0x1A && buffer[1] === 0x45 && buffer[2] === 0xDF && buffer[3] === 0xA3) {
      return { ext: 'webm', mime: 'audio/webm' };
    }
    if (magic4.startsWith('ID3') || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)) {
      return { ext: 'mp3', mime: 'audio/mpeg' };
    }
  }

  if (ct.includes('m4a') || ct.includes('x-m4a') || ct.includes('aac')) {
    return { ext: 'm4a', mime: 'audio/m4a' };
  }
  if (ct.includes('mp4')) {
    return { ext: 'mp4', mime: 'audio/mp4' };
  }
  if (ct.includes('webm')) {
    return { ext: 'webm', mime: 'audio/webm' };
  }
  if (ct.includes('ogg')) {
    return { ext: 'ogg', mime: 'audio/ogg' };
  }
  if (ct.includes('mpeg') || ct.includes('mp3')) {
    return { ext: 'mp3', mime: 'audio/mpeg' };
  }

  // En iOS por defecto si no trae cabecera estándar suele ser M4A o WAV
  return { ext: 'm4a', mime: 'audio/m4a' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-groq-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const wantPlainText = urlObj.searchParams.get('format') === 'text';
  const queryKey = (urlObj.searchParams.get('key') || '').trim();

  if (req.method === 'GET') {
    const hasServerKey = Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim().length > 10);
    return res.status(200).json({
      hasServerKey,
      model: 'whisper-large-v3',
      platform: 'iPhone Pro Native Engine'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const headerKey = (req.headers['x-groq-api-key'] || '').trim();
    const authHeader = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const envKey = (process.env.GROQ_API_KEY || '').trim();
    const apiKey = headerKey || authHeader || queryKey || envKey;

    if (!apiKey) {
      const msg = 'Configura GROQ_API_KEY en Vercel o pega tu clave gsk_... en la app de iPhone.';
      return wantPlainText ? res.status(401).send(msg) : res.status(401).json({ error: msg });
    }

    const rawBody = await readRawBody(req);
    if (!rawBody || rawBody.length < 100) {
      const msg = 'Audio vacío o demasiado corto.';
      return wantPlainText ? res.status(400).send(msg) : res.status(400).json({ error: msg });
    }

    if (rawBody.length > 24 * 1024 * 1024) {
      const msg = 'El tramo supera el límite seguro de 24 MB.';
      return wantPlainText ? res.status(413).send(msg) : res.status(413).json({ error: msg });
    }

    const { buffer: audioBuffer, innerMime } = extractAudioIfMultipart(rawBody, req.headers['content-type']);
    const { ext, mime } = detectAudioFormat(audioBuffer, innerMime);

    const boundary = '----TranscriptorIPhoneBoundary' + Date.now().toString(16);
    const crlf = '\r\n';

    const partFileHeader = Buffer.from(
      `--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="file"; filename="iphone_audio.${ext}"${crlf}` +
      `Content-Type: ${mime}${crlf}${crlf}`,
      'utf-8'
    );

    const partFields = Buffer.from(
      `${crlf}--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="model"${crlf}${crlf}` +
      `whisper-large-v3` +
      `${crlf}--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="temperature"${crlf}${crlf}` +
      `0` +
      `${crlf}--${boundary}${crlf}` +
      `Content-Disposition: form-data; name="response_format"${crlf}${crlf}` +
      `json` +
      `${crlf}--${boundary}--${crlf}`,
      'utf-8'
    );

    const multipartBody = Buffer.concat([partFileHeader, audioBuffer, partFields]);

    let lastStatus = 500;
    let lastError = 'Error conectando con Groq Whisper Large v3';

    for (let attempt = 1; attempt <= 3; attempt++) {
      const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(multipartBody.length)
        },
        body: multipartBody
      });

      const responseText = await groqResponse.text();
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = null;
      }

      if (groqResponse.ok) {
        const cleanText = (data && data.text) ? String(data.text).trim() : '';
        if (wantPlainText) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          return res.status(200).send(cleanText);
        }
        return res.status(200).json({ text: cleanText });
      }

      lastStatus = groqResponse.status;
      lastError = (data && data.error && data.error.message) || responseText || `Error HTTP ${groqResponse.status}`;

      if (attempt < 3 && (lastStatus === 429 || lastStatus >= 500)) {
        const retryAfterSec = parseInt(groqResponse.headers.get('retry-after') || '0', 10);
        const waitMs = retryAfterSec > 0 ? Math.min(10000, retryAfterSec * 1000) : attempt * 1500;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      break;
    }

    if (wantPlainText) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(lastStatus).send(`Error: ${lastError}`);
    }
    return res.status(lastStatus).json({ error: lastError });
  } catch (err) {
    const msg = err && err.message ? err.message : 'Error interno procesando el audio';
    if (wantPlainText) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(500).send(`Error: ${msg}`);
    }
    return res.status(500).json({ error: msg });
  }
}
