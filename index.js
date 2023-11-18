const http = require('http');
const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');

const fileCache = {
  python: fs.readFileSync('src/python.html'),
  javascript: fs.readFileSync('src/javascript.html'),
  postgres: fs.readFileSync('src/postgres.html'),
  help: fs.readFileSync('src/help.html')
};

const sessionCache = {};

function stream(docID, res) {
  const session = { send: data => res.write(data) };
  res.on('close', () => {
    const sessions = sessionCache[docID];
    if (sessions.length === 1) {
      delete sessionCache[docID];
    } else {
      sessions.splice(sessions.indexOf(session), 1);
    }
    console.log(`Closed stream: ${sessions.length} streams in ${docID} / ${Object.keys(sessionCache).length} total sessions.`);
  });
  const sessions = sessionCache[docID];
  sessions.push(session);
  if (sessions.length > 1) {
    sessions[0].send('{"sync":1}');
  }
  console.log(`Opened stream: ${sessions.length} streams in ${docID} / ${Object.keys(sessionCache).length} total sessions.`);
}

function broadcast(docID, req, res) {
  let data = '';
  req.on('data', chunk => {
    data += chunk.toString();
  }).on('end', () => {
    if (data) {
      sessionCache[docID].forEach(session => session.send(data));
    }
    res.end();
  });
}

const contentTypes = {
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.html': 'text/html'
};

function serveStatic(pathname, res) {
  const contentType = contentTypes[path.extname(pathname)];
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  if (fileCache[pathname]) {
    return res.end(fileCache[pathname]);
  }
  fs.readFile(pathname, (err, data) => {
    if (err) {
      res.statusCode = 500;
      res.statusMessage = err.toString();
      res.end();
    } else {
      fileCache[pathname] = data;
      res.end(fileCache[pathname]);
    }
  });
}

function pgQuery(res, docID, req) {
  let query = '';
  req.on('data', chunk => {
    query += chunk.toString();
  }).on('end', () => {
    let result = {};
    try {
      const ret = newDb().public.many(query);
      if (ret?.data?.error) {
        result.error = ret?.data?.error;
      } else {
        result.data = ret;
      }
    } catch (error) {
      result.error = error.message;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  }).on('error', error => {
    res.statusCode = 500;
    res.statusMessage = error.toString();
    res.end();
  });
}

function redirect(res, docID) {
  res.setHeader('Location', `/javascript?${docID}`);
  res.statusCode = 301;
  res.end();
}

const routes = {
  '/': redirect,
  '/javascript': res => res.end(fileCache.javascript),
  '/python': res => res.end(fileCache.python),
  '/postgres': res => res.end(fileCache.postgres),
  '/pg-query': pgQuery,
  '/send': (res, docID, req) => broadcast(docID, req, res),
  '/stream': (res, docID) => stream(docID, res)
};

const server = http.createServer((req, res) => {
  const { search, pathname } = new URL(req.url, `http://${req.headers.host}`);
  const docID = search.substring(1);
  if (docID) {
    sessionCache[docID] = sessionCache[docID] || [];
  }
  if (routes[pathname]) {
    return routes[pathname](res, docID, req);
  }
  serveStatic(path.join('.', pathname), res);
});

server.listen(8000);

console.log('listening on 8000');
