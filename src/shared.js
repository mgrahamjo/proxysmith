const id = btoa(Math.random()).replace(/[^A-Z0-9]+/gi, '');
const mode = location.pathname.split('/')[1];

if (!location.search) {
  location.search = '?' + id;
}

let hasEdited = false;
const decoder = new TextDecoder();

function updateCode(lines) {
  const view = window.cmView;
  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: lines.join('\n')
    },
    selection: view.state.selection
  });
}

function sendCode() {
  fetch(`/send${location.search}`, {
    method: 'POST',
    body: JSON.stringify({
      id,
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
          if (data.sync) {
            sendCode();
          } else if (data.id !== id && data.mode == mode) {
            updateCode(data.lines);
          }
          json = '';
        } catch (e) {
          console.log(e)
        }
      }
    }
  }).then(streamUpdates);
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
};
