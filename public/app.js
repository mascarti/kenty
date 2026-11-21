// КЕНТОФОН — клиент
{
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtId = (id) => String(id).replace(/(\d{3})(\d{3})/, '$1 $2');
  const hue = (id) => (Number(id) * 47) % 360;
  const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
  const ava = (el, c) => { el.textContent = initial(c.nick); el.style.setProperty('--h', hue(c.id)); };

  const ICON = {
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>',
    cam: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/></svg>',
    more: '<svg viewBox="0 0 24 24"><path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg>',
  };

  let token = store.get('kf_token', null);
  let me = store.get('kf_me', null);
  let contacts = store.get('kf_contacts', []);
  let socket = null;
  let ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
  let call = null;
  const pendingAdd = new URLSearchParams(location.search).get('add');
  const baseTitle = document.title;

  const forceRelay = new URLSearchParams(location.search).has('relay'); // для проверки TURN

  // ---------- уведомления ----------
  let toastTimer;
  function toast(msg, ms = 3200) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ---------- звуки (рингтон без файлов) ----------
  let actx = null;
  function audio() {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch {}
    return actx;
  }
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) => document.addEventListener(ev, audio, { passive: true }));
  function beep(freqs, dur, vol = 0.16) {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const g = a.createGain();
    g.connect(a.destination);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const f of freqs) {
      const o = a.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }
  let toneTimer = null;
  function startTone(kind) {
    stopTone();
    const play = kind === 'ring'
      ? () => { beep([659, 880], 0.35); setTimeout(() => beep([659, 880], 0.35), 480); try { navigator.vibrate?.([300, 150, 300]); } catch {} }
      : () => beep([425], 0.9, 0.1);
    play();
    toneTimer = setInterval(play, kind === 'ring' ? 2200 : 4000);
  }
  function stopTone() { clearInterval(toneTimer); toneTimer = null; }

  // ---------- вход ----------
  function setMode(m) {
    $('#auth').dataset.mode = m;
    $('#a-submit').textContent = m === 'login' ? 'Войти' : 'Создать аккаунт';
    $('#a-pass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('#a-err').textContent = '';
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  $('#auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mode = $('#auth').dataset.mode;
    const btn = $('#a-submit');
    btn.disabled = true;
    $('#a-err').textContent = '';
    try {
      const r = await fetch('/api/' + mode, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: $('#a-login').value.trim(), password: $('#a-pass').value, nick: $('#a-nick').value.trim() }),
      });
      const j = await r.json().catch(() => ({ error: 'Сервер просыпается, попробуй ещё раз через пару секунд' }));
      if (!r.ok) throw new Error(j.error || 'Что-то пошло не так');
      token = j.token;
      me = j.me;
      contacts = [];
      store.set('kf_token', token);
      store.set('kf_me', me);
      store.set('kf_contacts', contacts);
      $('#a-pass').value = '';
      start();
    } catch (err) {
      $('#a-err').textContent = err.message === 'Failed to fetch' || err.message === 'Load failed' ? 'Нет связи с сервером' : err.message;
    } finally {
      btn.disabled = false;
    }
  });

  function logout() {
    if (call) hangup();
    socket?.disconnect();
    socket = null;
    token = me = null;
    contacts = [];
    ['kf_token', 'kf_me', 'kf_contacts'].forEach(store.del);
    $('#main').hidden = true;
    $('#auth').hidden = false;
    setMode('login');
  }

  // ---------- главный экран ----------
  function renderMe() {
    if (!me) return;
    $('#me-nick').textContent = me.nick;
    $('#me-id').textContent = fmtId(me.id);
    ava($('#me-ava'), me);
  }

  function saveContacts() { store.set('kf_contacts', contacts.map(({ id, nick }) => ({ id, nick }))); }
  function mergeContacts(list) {
    const old = new Map(contacts.map((c) => [c.id, c]));
    contacts = list.map((c) => ({ id: c.id, nick: c.nick || old.get(c.id)?.nick || 'ID ' + fmtId(c.id), online: !!c.online }));
    saveContacts();
    renderContacts();
  }
  function upsert(c) {
    const i = contacts.findIndex((x) => x.id === c.id);
    const next = { ...(contacts[i] || { id: c.id, nick: 'ID ' + fmtId(c.id), online: false }) };
    if (c.nick) next.nick = c.nick;
    if (typeof c.online === 'boolean') next.online = c.online;
    if (i < 0) contacts.push(next); else contacts[i] = next;
    saveContacts();
    renderContacts();
    if (call && call.peer.id === c.id && c.nick) { call.peer.nick = c.nick; renderCall(); }
  }

  function renderContacts() {
    const box = $('#contacts');
    if (!contacts.length) {
      box.innerHTML = '<li class="empty">Пока пусто. Вбей ID друга сверху или нажми «Позвать друга» и скинь ему ссылку.</li>';
      return;
    }
    const list = [...contacts].sort((a, b) => (b.online - a.online) || a.nick.localeCompare(b.nick, 'ru'));
    box.innerHTML = list.map((c) => `
      <li class="contact ${c.online ? 'on' : ''}" data-id="${esc(c.id)}">
        <span class="ava" style="--h:${hue(c.id)}">${esc(initial(c.nick))}</span>
        <span class="who"><b>${esc(c.nick)}</b><small>${c.online ? 'в сети' : 'не в сети'} · ID ${esc(fmtId(c.id))}</small></span>
        <button class="ib more" data-act="remove" aria-label="Удалить ${esc(c.nick)}">${ICON.more}</button>
        <button class="ib vid" data-act="video" aria-label="Видеозвонок ${esc(c.nick)}">${ICON.cam}</button>
        <button class="ib call" data-act="audio" aria-label="Позвонить ${esc(c.nick)}">${ICON.phone}</button>
      </li>`).join('');
  }

  $('#contacts').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const c = contacts.find((x) => x.id === b.closest('.contact').dataset.id);
    if (!c) return;
    if (b.dataset.act === 'remove') {
      if (!confirm(`Удалить ${c.nick} из контактов?`)) return;
      socket?.emit('remove', { id: c.id }, () => {});
      contacts = contacts.filter((x) => x.id !== c.id);
      saveContacts();
      renderContacts();
      return;
    }
    startCall({ id: c.id, nick: c.nick }, b.dataset.act === 'video');
  });

  // поиск друга
  async function find(raw) {
    const id = String(raw || '').replace(/\D/g, '');
    const box = $('#found');
    if (id.length !== 6) { box.innerHTML = '<p class="err">ID — это 6 цифр</p>'; return; }
    if (!socket?.connected) { box.innerHTML = '<p class="err">Нет связи с сервером, секунду…</p>'; return; }
    socket.emit('find', { id }, (r) => {
      if (r?.error) { box.innerHTML = `<p class="err">${esc(r.error)}</p>`; return; }
      const u = r.user;
      box.innerHTML = `
        <div class="found">
          <span class="ava" style="--h:${hue(u.id)}">${esc(initial(u.nick))}</span>
          <span class="who"><b>${esc(u.nick)}</b><small>ID ${esc(fmtId(u.id))} · ${u.online ? 'в сети' : 'не в сети'}</small></span>
          ${u.added ? '<span class="muted">уже в контактах</span>' : `<button type="button" class="btn primary" data-add="${esc(u.id)}">Добавить</button>`}
        </div>`;
    });
  }
  $('#find').addEventListener('submit', (e) => { e.preventDefault(); find($('#find-id').value); });
  $('#found').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    b.disabled = true;
    socket.emit('add', { id: b.dataset.add }, (r) => {
      if (r?.error) { b.disabled = false; return toast(r.error); }
      upsert(r.contact);
      toast(`${r.contact.nick} теперь в контактах`);
      $('#found').innerHTML = '';
      $('#find-id').value = '';
    });
  });

  // мой ID
  $('#copy-id').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(me.id); toast('ID скопирован'); } catch { toast('Твой ID: ' + me.id, 5000); }
  });
  $('#invite').addEventListener('click', async () => {
    const url = location.origin + '/?add=' + me.id;
    const text = `Го созвонимся в Кентофоне! Мой ID: ${me.id}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'Кентофон', text, url }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text + '\n' + url); toast('Ссылка скопирована, кидай другу'); } catch { toast(url, 6000); }
  });

  // настройки
  $('#open-settings').addEventListener('click', () => {
    $('#s-nick').value = me.nick;
    $('#s-login').textContent = 'Логин: ' + me.login + ' · ID ' + fmtId(me.id);
    $('#settings').showModal();
  });
  $('#s-close').addEventListener('click', () => $('#settings').close());
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    socket?.emit('nick', { nick: $('#s-nick').value }, (r) => {
      if (r?.error) return toast(r.error);
      me = r.me; token = r.token;
      store.set('kf_me', me); store.set('kf_token', token);
      renderMe();
      $('#settings').close();
      toast('Ник сохранён');
    });
  });
  $('#logout').addEventListener('click', () => { $('#settings').close(); logout(); });

  // ---------- соединение с сервером ----------
  function setNet(ok, text) {
    $('#net').hidden = ok;
    if (text) $('#net').textContent = text;
  }

  function start() {
    $('#auth').hidden = true;
    $('#main').hidden = false;
    renderMe();
    renderContacts();
    setNet(false, 'Подключаюсь к серверу…');
    socket?.disconnect();
    socket = io({ auth: { token } });
    let added = false;

    socket.on('connect', () => {
      setNet(true);
      socket.emit('hello', { contacts: contacts.map((c) => c.id) }, (r) => {
        if (!r) return;
        me = r.me; token = r.token;
        if (r.ice?.iceServers) ice = r.ice;
        store.set('kf_me', me); store.set('kf_token', token);
        socket.auth.token = token;
        renderMe();
        mergeContacts(r.contacts);
        if (pendingAdd && !added) {
          added = true;
          if (pendingAdd !== me.id && !contacts.some((c) => c.id === pendingAdd)) { $('#find-id').value = pendingAdd; find(pendingAdd); }
          history.replaceState(null, '', forceRelay ? '/?relay' : '/');
        }
      });
    });
    socket.on('disconnect', () => setNet(false, 'Связь с сервером пропала, переподключаюсь…'));
    socket.on('connect_error', (err) => {
      if (err?.message === 'auth') { toast('Войди заново'); logout(); return; }
      setNet(false, 'Сервер не отвечает, пробую ещё…');
    });
    socket.on('presence', upsert);
    socket.on('contact:new', (c) => { upsert(c); toast(`${c.nick} добавил тебя в контакты`); });

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', ({ callId }) => {
      if (!call || call.id !== callId || call.role !== 'caller') return;
      beginOffer().catch((e) => { console.warn(e); toast('Не получилось начать звонок'); hangup(); });
    });
    socket.on('call:gone', ({ callId }) => { if (call && call.id === callId && call.state === 'ringing') cleanup(); });
    socket.on('call:ended', ({ callId, reason }) => {
      if (!call || call.id !== callId) return;
      const n = call.peer.nick;
      const msg = {
        declined: `${n} сбросил`,
        noanswer: call.role === 'caller' ? `${n} не ответил` : `Пропущенный от ${n}`,
        cancelled: call.role === 'callee' ? `Пропущенный от ${n}` : 'Звонок отменён',
        lost: 'Связь потеряна',
        ended: call.t0 ? 'Звонок завершён · ' + duration(call) : 'Звонок завершён',
      }[reason] || 'Звонок завершён';
      cleanup();
      toast(msg);
    });
    socket.on('signal', ({ callId, data }) => {
      const c = call;
      if (!c || c.id !== callId || !data) return;
      c.chain = c.chain.then(() => onSignal(c, data)).catch((e) => console.warn('signal', e));
    });
  }

  // ---------- звонки ----------
  function newCall(o) {
    return { id: null, local: null, pc: null, remote: new MediaStream(), chain: Promise.resolve(), pending: [], camOn: false, micOn: true, facing: 'user', peerCam: false, peerMic: true, t0: 0, timer: null, ...o };
  }
  const duration = (c) => {
    const s = Math.floor((Date.now() - c.t0) / 1000);
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const send = (c, data) => { if (c.id) socket?.emit('signal', { callId: c.id, data }); };

  async function getMedia(video) {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Браузер не даёт микрофон. Открой сайт в Safari или Chrome по https');
    const audioOpts = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audioOpts, video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false });
    } catch (e) {
      if (video) {
        try { const s = await navigator.mediaDevices.getUserMedia({ audio: audioOpts }); toast('Камера недоступна, звоню голосом'); return s; } catch {}
      }
      throw new Error('Разреши доступ к микрофону в настройках браузера');
    }
  }

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen');
      if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch {}
  }

  async function startCall(peer, video) {
    if (call) return;
    if (!socket?.connected) return toast('Нет связи с сервером');
    audio();
    const c = (call = newCall({ peer, role: 'caller', state: 'calling', video }));
    showCall();
    try { c.local = await getMedia(video); } catch (e) { cleanup(); return toast(e.message); }
    if (call !== c) { c.local.getTracks().forEach((t) => t.stop()); return; }
    c.camOn = !!c.local.getVideoTracks()[0];
    renderCall();
    socket.emit('call:start', { to: peer.id, video: c.camOn }, (r) => {
      if (call !== c) return;
      if (r?.error) { cleanup(); return toast(r.error); }
      c.id = r.callId;
      startTone('back');
      renderCall();
    });
  }

  function onIncoming({ callId, from, video }) {
    if (call) return;
    upsert({ id: from.id, nick: from.nick });
    call = newCall({ id: callId, peer: { id: from.id, nick: from.nick }, role: 'callee', state: 'ringing', video });
    ava($('#i-ava'), call.peer);
    $('#i-nick').textContent = from.nick;
    $('#i-type').textContent = video ? 'Видеозвонок' : 'Звонит тебе';
    $('#incoming').hidden = false;
    document.title = '📞 ' + from.nick + ' звонит';
    startTone('ring');
  }

  $('#i-no').addEventListener('click', () => {
    if (!call || call.state !== 'ringing') return;
    socket.emit('call:decline', { callId: call.id });
    cleanup();
  });
  $('#i-yes').addEventListener('click', async () => {
    const c = call;
    if (!c || c.state !== 'ringing') return;
    stopTone();
    audio();
    c.state = 'connecting';
    $('#incoming').hidden = true;
    showCall();
    try { c.local = await getMedia(c.video); } catch (e) {
      socket.emit('call:decline', { callId: c.id });
      cleanup();
      return toast(e.message);
    }
    if (call !== c) { c.local.getTracks().forEach((t) => t.stop()); return; }
    c.camOn = !!c.local.getVideoTracks()[0];
    setupPC(c);
    renderCall();
    socket.emit('call:accept', { callId: c.id }, (r) => { if (r?.error && call === c) { cleanup(); toast(r.error); } });
  });

  function setupPC(c) {
    const pc = (c.pc = new RTCPeerConnection({ ...ice, iceTransportPolicy: forceRelay ? 'relay' : 'all' }));
    pc.onicecandidate = (e) => { if (e.candidate) send(c, { cand: e.candidate }); };
    pc.ontrack = (e) => {
      if (!c.remote.getTracks().includes(e.track)) c.remote.addTrack(e.track);
      attachRemote(c);
    };
    pc.oniceconnectionstatechange = () => {
      if (call !== c) return;
      const s = pc.iceConnectionState;
      if (s === 'connected' || s === 'completed') onConnected(c);
      else if (s === 'disconnected') { c.reconnecting = true; renderCall(); }
      else if (s === 'failed') { toast('Не получилось соединиться напрямую — нужен TURN-сервер', 5000); hangup(); }
    };
    return pc;
  }

  const videoSender = (c) => c.pc?.getTransceivers().find((t) => t.receiver.track.kind === 'video')?.sender;

  async function beginOffer() {
    const c = call;
    stopTone();
    c.state = 'connecting';
    renderCall();
    const pc = setupPC(c);
    pc.addTransceiver(c.local.getAudioTracks()[0], { direction: 'sendrecv' });
    const vt = pc.addTransceiver('video', { direction: 'sendrecv' });
    const cam = c.local.getVideoTracks()[0];
    if (cam) await vt.sender.replaceTrack(cam);
    await pc.setLocalDescription(await pc.createOffer());
    send(c, { sdp: pc.localDescription });
    send(c, { cam: c.camOn, mic: c.micOn });
  }

  async function onSignal(c, d) {
    if (call !== c) return;
    const pc = c.pc || setupPC(c);
    if (d.sdp) {
      await pc.setRemoteDescription(d.sdp);
      if (d.sdp.type === 'offer') {
        for (const t of pc.getTransceivers()) {
          const kind = t.receiver.track.kind;
          const track = kind === 'audio' ? c.local?.getAudioTracks()[0] : c.local?.getVideoTracks()[0];
          t.direction = 'sendrecv';
          if (track) await t.sender.replaceTrack(track);
        }
        await pc.setLocalDescription(await pc.createAnswer());
        send(c, { sdp: pc.localDescription });
        send(c, { cam: c.camOn, mic: c.micOn });
      }
      for (const cand of c.pending.splice(0)) await pc.addIceCandidate(cand).catch(() => {});
    }
    if (d.cand) {
      if (pc.remoteDescription) await pc.addIceCandidate(d.cand).catch(() => {});
      else c.pending.push(d.cand);
    }
    if ('cam' in d) c.peerCam = !!d.cam;
    if ('mic' in d) c.peerMic = !!d.mic;
    renderCall();
  }

  function onConnected(c) {
    c.reconnecting = false;
    if (c.state !== 'active') {
      c.state = 'active';
      c.t0 = Date.now();
      c.timer = setInterval(renderCall, 1000);
      keepAwake(true);
    }
    attachRemote(c);
    renderCall();
  }

  function attachRemote(c) {
    const a = $('#r-audio');
    const v = $('#r-video');
    if (a.srcObject !== c.remote) a.srcObject = c.remote;
    if (v.srcObject !== c.remote) v.srcObject = c.remote;
    a.play().catch(() => {});
    v.play().catch(() => {});
  }

  function showCall() {
    $('#call').hidden = false;
    renderCall();
  }

  function renderCall() {
    const c = call;
    if (!c) return;
    ava($('#c-ava'), c.peer);
    $('#c-nick').textContent = c.peer.nick;
    $('#c-status').textContent =
      c.reconnecting ? 'Связь пропала, переподключаю…'
      : c.state === 'active' ? duration(c)
      : c.state === 'connecting' ? 'Соединяю…'
      : c.id ? 'Звоню…' : 'Готовлю микрофон…';
    $('#c-note').hidden = c.state !== 'active' || c.peerMic;
    $('#call').classList.toggle('has-video', c.state === 'active' && c.peerCam);
    const lv = $('#l-video');
    lv.hidden = !c.camOn;
    lv.classList.toggle('mirror', c.facing === 'user');
    if (c.camOn && c.local && lv.srcObject !== c.local) { lv.srcObject = c.local; lv.play().catch(() => {}); }
    $('#c-mic').classList.toggle('is-off', !c.micOn);
    $('#c-mic').setAttribute('aria-pressed', String(!c.micOn));
    $('#c-cam').classList.toggle('is-off', !c.camOn);
    $('#c-cam').setAttribute('aria-pressed', String(c.camOn));
    $('#c-flip').hidden = !c.camOn;
  }

  async function camTrack(c) {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: c.facing, width: { ideal: 640 }, height: { ideal: 480 } } });
    return s.getVideoTracks()[0];
  }
  function dropCam(c) {
    for (const t of c.local.getVideoTracks()) { t.stop(); c.local.removeTrack(t); }
  }

  $('#c-mic').addEventListener('click', () => {
    const c = call;
    const t = c?.local?.getAudioTracks()[0];
    if (!t) return;
    c.micOn = !c.micOn;
    t.enabled = c.micOn;
    send(c, { mic: c.micOn });
    renderCall();
  });

  $('#c-cam').addEventListener('click', async () => {
    const c = call;
    if (!c?.local) return;
    const sender = videoSender(c);
    if (c.camOn) {
      dropCam(c);
      if (sender) await sender.replaceTrack(null);
      c.camOn = false;
    } else {
      let t;
      try { t = await camTrack(c); } catch { return toast('Нет доступа к камере'); }
      if (call !== c) return t.stop();
      c.local.addTrack(t);
      if (sender) await sender.replaceTrack(t);
      c.camOn = true;
    }
    send(c, { cam: c.camOn });
    renderCall();
  });

  $('#c-flip').addEventListener('click', async () => {
    const c = call;
    if (!c?.camOn) return;
    c.facing = c.facing === 'user' ? 'environment' : 'user';
    dropCam(c);
    let t;
    try { t = await camTrack(c); } catch { c.camOn = false; send(c, { cam: false }); renderCall(); return toast('Вторая камера недоступна'); }
    if (call !== c) return t.stop();
    c.local.addTrack(t);
    await videoSender(c)?.replaceTrack(t);
    $('#l-video').srcObject = null;
    renderCall();
  });

  $('#c-end').addEventListener('click', () => {
    const c = call;
    const msg = c?.t0 ? 'Звонок завершён · ' + duration(c) : null;
    hangup();
    if (msg) toast(msg);
  });

  function hangup() {
    const c = call;
    if (!c) return;
    if (c.id) socket?.emit(c.role === 'callee' && c.state === 'ringing' ? 'call:decline' : 'call:end', { callId: c.id });
    cleanup();
  }

  function cleanup() {
    stopTone();
    const c = call;
    call = null;
    if (c) {
      clearInterval(c.timer);
      try { c.pc?.close(); } catch {}
      c.local?.getTracks().forEach((t) => t.stop());
    }
    for (const id of ['#r-audio', '#r-video', '#l-video']) $(id).srcObject = null;
    $('#call').hidden = true;
    $('#call').classList.remove('has-video');
    $('#incoming').hidden = true;
    document.title = baseTitle;
    keepAwake(false);
  }

  window.addEventListener('pagehide', () => { if (call) hangup(); });

  // ---------- запуск ----------
  setMode(pendingAdd ? 'register' : 'login');
  if (token && me) start();
  else $('#auth').hidden = false;
}
