# 04) Runner: Web Worker + Pyodide

This document describes the in-browser runner used by the Run button.

Execution is performed in the browser:

- JavaScript runs inside a Web Worker
- Python runs inside a Web Worker using Pyodide

## Why a Web Worker

Reasons:

- Keeps the UI responsive while code runs.
- Provides a clean boundary that can be terminated.

## How output works

Inside the worker:

- for JS, `console.log` / `console.error` are captured and forwarded
- for Python, Pyodide stdout/stderr are captured and forwarded

In the UI:

- stdout and stderr are stored in shared Yjs texts (`run:stdout` and `run:stderr`)
- that makes output shared across all participants

## Errors

Runner failures are surfaced in output so they are visible to all participants.

That includes:

- normal runtime exceptions
- worker message decode errors
- worker crashes
- timeouts

## Notes

- Pyodide is large, so the first Python run can take a few seconds.
- This is not a secure sandbox; execution happens in the browser.
