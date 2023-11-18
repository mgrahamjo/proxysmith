const sessionID = btoa(Math.random()).replace(/[^A-Z0-9]+/gi, '');
const docID = location.search?.slice(1) || sessionID;
const mode = location.pathname.split('/')[1];

if (!location.search) {
  location.search = '?' + docID;
}

let hasEdited = false;
const decoder = new TextDecoder();

function updateCode(lines) {
  const insert = lines.join('\n');
  const view = window.cmView;
  view.state.selection.ranges.forEach(range => {
    if (range.from > insert.length) {
      range.from = insert.length;
    }
    if (range.to > insert.length) {
      range.to = insert.length;
    }
  });
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert
    },
    selection: view.state.selection
  });
}

function sendCode() {
  fetch(`/send${location.search}`, {
    method: 'POST',
    body: JSON.stringify({
      sessionID,
      docID,
      lines: window.cmView.state.doc,
      mode
    })
  });
}

function streamUpdates() {
  fetch(`/stream${location.search}`).then(async res => {
    const reader = res.body.getReader();
    let done, value, json = '';
    while (!done) {
      ({ value, done } = await reader.read());
      if (!done) {
        json += decoder.decode(value);
        try {
          const data = JSON.parse(json);
          try {
            if (data.sync) {
              sendCode();
            } else if (data.mode == mode) {
              if (data.sessionID !== sessionID) {
                updateCode(data.lines);
              }
              localStorage.setItem(mode + docID, JSON.stringify(data.lines));
            }
          } finally {
            json = '';
          }
        } catch (e) {
          console.log(e)
        }
      }
    }
  }).finally(streamUpdates);
}

window.init = () => {
  document.body.classList.add('loaded');
  function edit() {
    hasEdited = true;
  };
  window.cmView.dom.addEventListener('input', edit);
  window.cmView.dom.addEventListener('keyup', edit);
  setInterval(() => {
    if (hasEdited) {
      sendCode();
      hasEdited = false;
    }
  }, 1000);
  streamUpdates();
  const cachedDoc = localStorage.getItem(mode + docID);
  if (cachedDoc) {
    updateCode(JSON.parse(cachedDoc));
  }
};
