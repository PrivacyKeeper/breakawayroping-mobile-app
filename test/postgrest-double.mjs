// A deliberately strict stand-in for PostgREST.
//
// The point is not to reimplement PostgREST. It is to make the app's data
// layer perform REAL HTTP against something that answers the way the real
// service does — including refusing a request the real one would refuse.
//
// It validates every requested column against a snapshot of the live schema
// and returns PostgREST's own 42703 error shape for an unknown one, so a typo
// surfaces here exactly as it would in production rather than being quietly
// echoed back.

import { createServer } from 'node:http';

export function startPostgrestDouble({ schema, rows = {} }) {
  const requests = [];
  // Mutable, so a test can change what the server returns without restarting
  // it. Re-importing the query module to point at a second server does not
  // work: `queries.ts` depends on `supabase.ts`, and busting the cache for one
  // leaves the other holding a client bound to the original URL.
  const state = { rows: { ...rows }, forcedError: null };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // /rest/v1/<table>?select=...  or  /rest/v1/rpc/<fn>
    const path = url.pathname.replace(/^\/rest\/v1\//, '');

    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const record = {
        method: req.method,
        table: path,
        select: url.searchParams.get('select'),
        params: Object.fromEntries(url.searchParams.entries()),
        headers: req.headers,
        body: body ? JSON.parse(body) : null,
      };
      requests.push(record);

      const send = (status, payload) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (state.forcedError && state.forcedError.table === path) {
        return send(state.forcedError.status, state.forcedError.payload);
      }

      if (path.startsWith('rpc/')) {
        return send(200, state.rows[path] ?? {});
      }

      const known = schema[path];
      if (!known) {
        return send(404, {
          code: '42P01',
          message: `relation "public.${path}" does not exist`,
        });
      }

      // The column check.
      //
      // Embedded resources are skipped: `rodeos(name, start_date)` inside a
      // select on `entries` is a join, not a column on `entries`. Stripping the
      // parentheses first and checking what is left would report
      // "entries.rodeos does not exist" — which is what the first version of
      // this double did, and it is wrong in the same way real PostgREST is not.
      // The static schema test covers the embedded columns themselves.
      const select = url.searchParams.get('select') ?? '';
      const topLevel = [];
      let depth = 0;
      let buffer = '';
      for (const char of select + ',') {
        if (char === '(') depth++;
        else if (char === ')') depth--;
        if (char === ',' && depth === 0) {
          const part = buffer.trim();
          buffer = '';
          if (!part || part.includes('(')) continue; // embed, not a column
          topLevel.push(part.split(':').pop().split('!')[0].trim());
          continue;
        }
        buffer += char;
      }

      for (const column of topLevel) {
        if (!known.includes(column)) {
          return send(400, {
            code: '42703',
            message: `column ${path}.${column} does not exist`,
          });
        }
      }

      send(200, state.rows[path] ?? []);
    });
  });

  return new Promise((resolveStart) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveStart({
        url: `http://127.0.0.1:${port}`,
        requests,
        /** Replace the rows one table returns, for the next request only. */
        setRows: (table, value) => {
          state.rows[table] = value;
        },
        /** Make one table answer with a PostgREST error. Pass null to clear. */
        failWith: (table, status, payload) => {
          state.forcedError = table ? { table, status, payload } : null;
        },
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
