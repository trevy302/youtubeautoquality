(function () {
  'use strict';

  const SEL = {
    PLAYER: '#movie_player',
    SETTINGS_BTN: '.ytp-settings-button',
    SETTINGS_MENU: '.ytp-settings-menu',
    MENU_ITEM: '.ytp-menuitem',
    MENU_ITEM_LABEL: '.ytp-menuitem-label',
    MENU_ITEM_CONTENT: '.ytp-menuitem-content',
  };

  const PREFIX = '[YT Auto Quality]';
  let navId = 0;
  let activeAttempt = false;
  const processed = new Set();
  let enabled = true;

  function log(...args) {
    console.log(PREFIX, ...args);
  }

  function videoId() {
    return new URLSearchParams(location.search).get('v');
  }

  function isWatch() {
    return location.pathname === '/watch';
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function nextFrames() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  async function poll(fn, timeout = 3000, interval = 50) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const result = fn();
      if (result) return result;
      await delay(interval);
    }
    return null;
  }

  function isAdPlaying() {
    const p = document.querySelector(SEL.PLAYER);
    return p && p.classList.contains('ad-showing');
  }

  function waitForAdEnd(thisNav) {
    const player = document.querySelector(SEL.PLAYER);
    if (!player || !player.classList.contains('ad-showing')) return Promise.resolve();
    log('Ad playing, waiting...');
    return new Promise((resolve) => {
      const done = () => { obs.disconnect(); clearInterval(check); clearTimeout(timer); resolve(); };
      const obs = new MutationObserver(() => {
        if (!player.classList.contains('ad-showing')) done();
      });
      obs.observe(player, { attributes: true, attributeFilter: ['class'] });
      const check = setInterval(() => { if (thisNav !== navId) done(); }, 200);
      const timer = setTimeout(done, 120_000);
    });
  }

  function settingsMenuVisible() {
    const m = document.querySelector(SEL.SETTINGS_MENU);
    return m && m.offsetHeight > 0;
  }

  function injectHideCSS() {
    let s = document.getElementById('ytaq-hide');
    if (s) s.remove();
    s = document.createElement('style');
    s.id = 'ytaq-hide';
    s.textContent =
      '#movie_player .ytp-settings-menu { opacity: 0 !important; pointer-events: none !important; }';
    document.head.appendChild(s);
  }

  function removeHideCSS() {
    const s = document.getElementById('ytaq-hide');
    if (s) s.remove();
  }

  function findQualityItem(items) {
    for (const item of items) {
      const content = item.querySelector(SEL.MENU_ITEM_CONTENT);
      if (content && /\d{3,4}p/.test(content.textContent)) return item;
    }
    for (const item of items) {
      const label = item.querySelector(SEL.MENU_ITEM_LABEL);
      if (label && /quality/i.test(label.textContent)) return item;
    }
    return null;
  }

  function bestQuality(items) {
    const options = [];
    for (const item of items) {
      const label = item.querySelector(SEL.MENU_ITEM_LABEL);
      if (!label) continue;
      const txt = label.textContent.trim();
      if (/auto/i.test(txt)) continue;
      if (
        item.getAttribute('aria-disabled') === 'true' ||
        item.classList.contains('ytp-menuitem-disabled')
      )
        continue;
      const m = txt.match(/(\d{3,4})p/);
      if (!m) continue;
      const premium = /premium/i.test(txt);
      options.push({ el: item, height: parseInt(m[1], 10), txt, premium });
    }
    if (!options.length) return null;
    options.sort((a, b) => b.height - a.height || (b.premium ? 1 : 0) - (a.premium ? 1 : 0));
    return options[0];
  }

  async function setQuality(thisNav) {
    if (thisNav !== navId) return false;

    const player = await poll(() => document.querySelector(SEL.PLAYER), 5000);
    if (!player || thisNav !== navId) return false;

    await poll(() => {
      const v = player.querySelector('video');
      return v && v.readyState >= 1;
    }, 5000);
    if (thisNav !== navId) return false;

    if (isAdPlaying()) {
      await waitForAdEnd(thisNav);
      await poll(() => {
        const v = player.querySelector('video');
        return v && v.readyState >= 1;
      }, 5000);
    }
    if (thisNav !== navId) return false;

    await delay(10000);

    if (settingsMenuVisible()) {
      log('User has settings open, skipping');
      return false;
    }

    let openedMenu = false;
    injectHideCSS();
    try {
      const btn = player.querySelector(SEL.SETTINGS_BTN);
      if (!btn) throw new Error('No settings button');
      btn.click();
      openedMenu = true;

      const menuItems = await poll(
        () => {
          const els = player.querySelectorAll(
            `${SEL.SETTINGS_MENU} ${SEL.MENU_ITEM}`
          );
          return els.length ? els : null;
        },
        2000
      );
      if (!menuItems || thisNav !== navId) {
        btn.click();
        return false;
      }

      const qItem = findQualityItem(menuItems);
      if (!qItem) {
        log('Quality item not found');
        btn.click();
        return false;
      }

      const qContent = qItem.querySelector(SEL.MENU_ITEM_CONTENT);
      const currentTxt = qContent ? qContent.textContent.trim() : '';
      const currentMatch = currentTxt.match(/(\d{3,4})p/);
      const currentHeight = currentMatch ? parseInt(currentMatch[1], 10) : 0;
      const currentPremium = /premium/i.test(currentTxt);

      qItem.click();

      const qualityRows = await poll(
        () => {
          const els = player.querySelectorAll(
            `${SEL.SETTINGS_MENU} ${SEL.MENU_ITEM}`
          );
          for (const el of els) {
            const lbl = el.querySelector(SEL.MENU_ITEM_LABEL);
            if (lbl && /\d{3,4}p/i.test(lbl.textContent)) return els;
          }
          return null;
        },
        2000
      );
      if (!qualityRows || thisNav !== navId) {
        btn.click();
        return false;
      }

      const best = bestQuality(qualityRows);
      if (!best) {
        log('No selectable quality');
        btn.click();
        return false;
      }

      const alreadyBest = best.el.getAttribute('aria-checked') === 'true' ||
        (currentHeight === best.height && currentPremium === best.premium);
      if (alreadyBest) {
        log('Already at best quality:', best.txt);
        return 'unchanged';
      }

      log('Setting quality to', best.txt);
      best.el.click();
      openedMenu = false;
      return 'changed';
    } finally {
      removeHideCSS();
      if (openedMenu) {
        await nextFrames();
        if (settingsMenuVisible()) {
          const btn = player.querySelector(SEL.SETTINGS_BTN);
          if (btn) btn.click();
        }
      }
    }
  }

  async function setQualityRetry(thisNav) {
    for (let i = 0; i < 3; i++) {
      if (thisNav !== navId) return false;
      try {
        const result = await setQuality(thisNav);
        if (result) return result;
      } catch (e) {
        log(`Attempt ${i + 1} failed:`, e.message);
      }
      removeHideCSS();
      if (i < 2) await poll(() => {
        const p = document.querySelector(SEL.PLAYER);
        return p && p.querySelector(SEL.SETTINGS_BTN) && !settingsMenuVisible();
      }, 2000);
    }
    log('All attempts failed');
    return false;
  }

  async function trySetQuality() {
    const thisNav = navId;

    if (!enabled || !isWatch()) return;
    const vid = videoId();
    if (!vid || processed.has(vid)) return;
    if (activeAttempt) return;

    activeAttempt = true;
    try {
      const ready = await poll(() => {
        const p = document.querySelector(SEL.PLAYER);
        if (!p) return false;
        const v = p.querySelector('video');
        return v && v.readyState >= 1 && p.querySelector(SEL.SETTINGS_BTN);
      }, 8000, 100);
      if (!ready || thisNav !== navId) return;

      const result = await setQualityRetry(thisNav);
      if (result) {
        processed.add(vid);
        if (processed.size > 100) processed.delete(processed.values().next().value);
      }
    } finally {
      activeAttempt = false;
      if (navId !== thisNav) trySetQuality();
    }
  }

  let navigateTimer = null;
  function onNavigate() {
    navId++;
    if (navigateTimer) clearTimeout(navigateTimer);
    navigateTimer = setTimeout(() => {
      navigateTimer = null;
      trySetQuality();
    }, 0);
  }

  function onRetrigger() {
    trySetQuality();
  }

  function init() {
    document.addEventListener('yt-navigate-finish', onNavigate);
    window.addEventListener('popstate', onNavigate);
    trySetQuality();

    let lastAdState = false;
    const watchPlayer = setInterval(() => {
      const player = document.querySelector(SEL.PLAYER);
      if (!player) return;
      clearInterval(watchPlayer);
      lastAdState = player.classList.contains('ad-showing');
      new MutationObserver(() => {
        const wasAd = lastAdState;
        const isAd = player.classList.contains('ad-showing');
        lastAdState = isAd;
        if (wasAd && !isAd && isWatch()) {
          const vid = videoId();
          if (vid && !processed.has(vid)) onRetrigger();
        }
      }).observe(player, { attributes: true, attributeFilter: ['class'] });
    }, 1000);

    log('Initialized');
  }

  chrome.storage.local.get(['enabled'], (r) => {
    enabled = r.enabled !== false;
    init();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'enabled' in changes) {
      enabled = changes.enabled.newValue !== false;
      if (enabled) {
        const vid = videoId();
        if (vid) processed.delete(vid);
        onRetrigger();
      }
    }
  });
})();
