export function getRunnerWorkerSource(): string {
  // Note: This string becomes the actual Worker script. Keep it plain JS.
  // IMPORTANT: because this is embedded in a TS/JS string, any "\n" that should
  // appear in the worker source must be written as "\\n" here.
  return `
let pyodideReady = null;

function normalizeNewlines(s) {
  // Pyodide output can include CR or CRLF depending on environment.
  // Normalize to LF so <pre> renders line breaks consistently.
  // NOTE: This source is embedded in a template string, so we must double-escape backslashes.
  return String(s).replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
}

function normalizePythonChunk(s) {
  const t = normalizeNewlines(s);
  if (!t) return '';
  // In some Pyodide stdout/stderr modes, output arrives as line chunks without a trailing "\\n".
  // If there are no newlines at all, treat this chunk as a line and add one.
  return t.includes('\\n') ? t : (t + '\\n');
}

function post(type, data) {
  self.postMessage({ type, ...data });
}

async function ensurePyodide() {
  if (pyodideReady) return pyodideReady;
  post('phase', { phase: 'loading', message: 'Loading Pyodide…' });
  importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.2/full/pyodide.js');
  pyodideReady = loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.2/full/' });
  return pyodideReady;
}

self.onmessage = async (evt) => {
  const startedAt = Date.now();
  const { language, code } = evt.data || {};
  try {
    if (language === 'javascript') {
      post('phase', { phase: 'running', message: 'Running JavaScript…' });
      const origLog = console.log;
      const origErr = console.error;
      console.log = (...args) => post('stdout', { data: args.map(String).join(' ') + '\\n' });
      console.error = (...args) => post('stderr', { data: args.map(String).join(' ') + '\\n' });
      try {
        const result = (0, eval)(code);
        if (result && typeof result.then === 'function') {
          await result;
        }
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
    } else if (language === 'python') {
      const pyodide = await ensurePyodide();
      post('phase', { phase: 'running', message: 'Running Python…' });
      if (pyodide.setStdout) {
        pyodide.setStdout({ batched: (s) => post('stdout', { data: normalizePythonChunk(s) }) });
      }
      if (pyodide.setStderr) {
        pyodide.setStderr({ batched: (s) => post('stderr', { data: normalizePythonChunk(s) }) });
      }
      await pyodide.runPythonAsync(code);
    }
    post('finished', { elapsedMs: Date.now() - startedAt });
  } catch (e) {
    const msg = (e && (e.message || e.toString())) || 'Run error';
    post('error', { message: msg });
  }
};
`;
}
