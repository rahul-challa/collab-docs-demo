import sanitizeHtml from 'sanitize-html';
import mammoth from 'mammoth';
import { marked } from 'marked';

// Content is stored as HTML, restricted to exactly what the editor can produce.
// Sanitising on the server (not just trusting the client) means imported files and
// hand-crafted API calls can never store script or arbitrary markup.
const SANITIZE_OPTIONS = {
  allowedTags: [
    'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's',
    'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  transformTags: {
    // Normalise headings below h3 so imported docs map onto the editor's heading levels.
    h4: 'h3', h5: 'h3', h6: 'h3',
    b: 'strong', i: 'em',
  },
};

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 1_000_000; // 1 MB of HTML is plenty for this scope.
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown', '.docx'];

export function sanitizeContent(html) {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Plain text: blank lines separate paragraphs, single newlines become <br>. */
export function textToHtml(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Converts an uploaded file into sanitised editor HTML.
 * Throws an Error with `status = 400` for unsupported or unreadable files.
 */
export async function fileToHtml(originalName, buffer) {
  const ext = originalName.slice(originalName.lastIndexOf('.')).toLowerCase();
  let html;
  if (ext === '.txt') {
    html = textToHtml(buffer.toString('utf8'));
  } else if (ext === '.md' || ext === '.markdown') {
    html = await marked.parse(buffer.toString('utf8'));
  } else if (ext === '.docx') {
    try {
      ({ value: html } = await mammoth.convertToHtml({ buffer }));
    } catch {
      throw Object.assign(new Error('Could not read that .docx file. Is it a valid Word document?'), { status: 400 });
    }
  } else {
    throw Object.assign(
      new Error(`Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(', ')}`),
      { status: 400 },
    );
  }
  return sanitizeContent(html);
}

export function titleFromFilename(name) {
  const base = name.replace(/\.[^.]+$/, '').trim();
  return (base || 'Imported document').slice(0, MAX_TITLE_LENGTH);
}
