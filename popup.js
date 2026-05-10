const toggle = document.getElementById('toggle');
const status = document.getElementById('status');

chrome.storage.local.get(['enabled'], (r) => {
  const on = r.enabled !== false;
  toggle.checked = on;
  status.textContent = on ? 'Active' : 'Disabled';
  status.className = 'status ' + (on ? 'on' : 'off');
});

toggle.addEventListener('change', () => {
  const on = toggle.checked;
  chrome.storage.local.set({ enabled: on });
  status.textContent = on ? 'Active' : 'Disabled';
  status.className = 'status ' + (on ? 'on' : 'off');
});
