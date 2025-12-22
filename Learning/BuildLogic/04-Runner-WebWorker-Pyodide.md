# 04) Runner: Web Worker + Pyodide

I wanted a Run button that works on free tiers without running any execution backend.

So I moved execution into the browser:

- JavaScript runs inside a Web Worker
- Python runs inside a Web Worker using Pyodide

## Why a Web Worker

Two reasons:

- I don’t want the UI to freeze while code runs.
- I want a clean boundary so I can terminate execution.

## How output works

Inside the worker:

- for JS, I hook `console.log` and `console.error` and forward messages back
- for Python, I hook Pyodide stdout/stderr and forward messages back

In the UI:

- stdout and stderr are stored in shared Yjs texts (`run:stdout` and `run:stderr`)
- that makes output shared across all participants

## Errors

I made sure any runner failure ends up in stderr, not just a status banner.

That includes:

- normal runtime exceptions
- worker message decode errors
- worker crashes
- timeouts

## What I learned / gotchas

- Pyodide is large, so the first Python run can take a few seconds.
- This is not a secure sandbox; it’s “run in my own browser” execution.
- It’s still worth doing because it keeps the project deployable and demo-friendly.
