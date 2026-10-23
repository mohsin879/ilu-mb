const firebaseConfig = {
  apiKey: "AIzaSyCzWj6i1N2a9CNTit2acENaXfqBRlYRpLo",
  authDomain: "ilu-app-3e2f8.firebaseapp.com",
  projectId: "ilu-app-3e2f8",
  storageBucket: "ilu-app-3e2f8.firebasestorage.app",
  messagingSenderId: "738719127887",
  appId: "1:738719127887:web:a47714d50550aa78c04d3a"
};

// ===== TURN (free relay server) =====
// metered.ca par free account banao, phir neeche apna app naam aur API key likho.
// Khali rahe to sirf STUN chalega (jaisa abhi hai).
const TURN_APP = '';   // jaise: 'ilu'  (matlab https://ilu.metered.live)
const TURN_KEY = '';   // aapki API key
const TURN_EXTRA = []; // zaroorat ho to yahan seedhe username/password wale servers bhi daal sakte ho

// Koi bhi galti ho to screen par dikhegi
function showError(msg) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = 'Error: ' + msg;
    t.classList.add('show');
  }
}
window.addEventListener('error', e => showError(e.message));
window.addEventListener('unhandledrejection', e => showError((e.reason && e.reason.message) || e.reason));

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const FV = firebase.firestore.FieldValue;

const EMOJIS = ['👨','👩','👦','👧','😍','😘','🐻','🐼','🐰','🦊','🐱','🐶','🦄','🌸','⭐','😎'];
const MOODS = ['😊 Khush', '🥰 Pyaar mein', '😴 Thaka hua', '🥺 Yaad aa rahi'];
const $ = id => document.getElementById(id);

let me = JSON.parse(localStorage.getItem('ilu_me') || 'null');   // { code, role: 'A' ya 'B' }
let data = null;
let chat = [];
let playlist = [];
let draft = { emojiA: '👨', emojiB: '👩' };
let setupMode = 'create';
let unsubDoc = null, unsubMsgs = null, unsubLive = null, unsubList = null, unsubCall = null;
let unsubGames = null, unsubCanvas = null;
let unsubJar = null, unsubBucket = null;

const coupleRef = () => db.collection('couples').doc(me.code);
const liveRef = () => coupleRef().collection('live').doc('watch');

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}

function makeCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function buildPicker(boxId, key) {
  const box = $(boxId);
  box.innerHTML = '';
  EMOJIS.forEach(e => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = e;
    if (draft[key] === e) b.classList.add('sel');
    b.onclick = () => {
      draft[key] = e;
      box.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    };
    box.appendChild(b);
  });
}

function daysFrom(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((today - start) / 86400000);
}

function showTab(name) {
  document.querySelectorAll('#nav button').forEach(b =>
    b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(name).classList.add('active');
}

/* ---------- Photo viewer ---------- */
function openViewer(src) {
  $('viewerImg').src = src;
  $('viewer').classList.remove('hidden');
}
$('viewer').onclick = () => $('viewer').classList.add('hidden');

/* ---------- Dikhana ---------- */
function renderMoods() {
  const box = $('moods');
  box.innerHTML = '';
  const mine = (data.mood && data.mood[me.role]) || '';
  MOODS.forEach(m => {
    const b = document.createElement('button');
    b.className = 'mood' + (mine === m ? ' sel' : '');
    b.textContent = m;
    b.onclick = () => coupleRef().update({ ['mood.' + me.role]: m });
    box.appendChild(b);
  });
  const partner = me.role === 'A' ? 'B' : 'A';
  const pm = (data.mood && data.mood[partner]) || '';
  $('partnerMood').textContent = pm ? 'Unka mood: ' + pm : '';
}

function renderChat() {
  const box = $('msgs');
  box.innerHTML = '';
  if (!chat.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'Pehla message likho 💬';
    box.appendChild(p);
  }
  chat.forEach(m => {
    const d = document.createElement('div');
    d.className = 'bubble ' + (m.from === me.role ? 'me' : 'you') + (m.img ? ' photo' : '');
    if (m.img) {
      const im = document.createElement('img');
      im.src = m.img;
      im.alt = 'Photo';
      im.onclick = () => openViewer(m.img);
      im.onload = () => { $('screens').scrollTop = $('screens').scrollHeight; };
      d.appendChild(im);
    } else {
      d.textContent = m.text;
    }
    box.appendChild(d);
  });
  $('screens').scrollTop = $('screens').scrollHeight;
}

function render() {
  if (!data || !me) return;
  const partner = me.role === 'A' ? 'B' : 'A';
  $('app').className = data.theme || 'mint';
  $('avA').textContent = data.emojiA;
  $('avB').textContent = data.emojiB;
  $('chatAv').textContent = data['emoji' + partner];
  $('chatName').textContent = data['name' + partner];
  $('names').textContent = data.nameA + ' ❤️ ' + data.nameB;

  const n = daysFrom(data.since);
  $('days').textContent = Math.abs(n);
  $('daysLabel').textContent = n >= 0 ? 'din saath mein' : 'din baaki hain';

  document.querySelectorAll('.theme').forEach(t =>
    t.classList.toggle('sel', t.dataset.theme === (data.theme || 'mint')));
  $('codeText').textContent = me.code;
  renderMoods();
  syncPinHash();
  renderMem();
}

/* =====================================================
   SAATH DEKHO AUR SUNO (YouTube sync, reactions, playlist)
   ===================================================== */
let ytPlayer = null;
let ytReady = false;
let ytVideoId = null;
let pendingVideo = null;
let applying = false;
let applyTimer = null;
let liveFirst = true;
let lastAt = null;
let lastReactId = 0;

// YouTube ka code load karna
window.onYouTubeIframeAPIReady = () => {
  ytReady = true;
  if (pendingVideo) {
    const p = pendingVideo;
    pendingVideo = null;
    loadVideo(p.id, p.pos, p.play);
  }
};
(function () {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

function parseYouTubeId(text) {
  text = (text || '').trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  const m = text.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  return m ? m[1] : null;
}

// Partner ke action lagate waqt apne events ko dobara bhejne se rokna
function quiet(ms, fn) {
  applying = true;
  clearTimeout(applyTimer);
  fn();
  applyTimer = setTimeout(() => { applying = false; }, ms);
}

function loadVideo(id, pos, play) {
  ytVideoId = id;
  $('ytEmpty').classList.add('hidden');
  if (location.protocol === 'file:') {
    toast('Dhyan: file se kholne par YouTube Error 153 dega. App ko https link se kholo.');
  }
  if (!ytReady) {
    pendingVideo = { id: id, pos: pos, play: play };
    return;
  }
  if (!ytPlayer) {
    const vars = { playsinline: 1, rel: 0, start: Math.floor(pos || 0) };
    if (location.protocol.indexOf('http') === 0) vars.origin = location.origin;
    ytPlayer = new YT.Player('ytBox', {
      width: '100%',
      height: '100%',
      videoId: id,
      playerVars: vars,
      events: {
        onReady: e => { if (play) e.target.playVideo(); },
        onStateChange: onYtState
      }
    });
  } else if (play) {
    ytPlayer.loadVideoById({ videoId: id, startSeconds: pos || 0 });
  } else {
    ytPlayer.cueVideoById({ videoId: id, startSeconds: pos || 0 });
  }
}

function sendLive(extra) {
  if (!me || !ytVideoId) return;
  const pos = (ytPlayer && ytPlayer.getCurrentTime) ? ytPlayer.getCurrentTime() : 0;
  const at = Date.now();
  lastAt = at;
  liveRef().set(Object.assign({
    videoId: ytVideoId,
    pos: pos,
    by: me.role,
    at: at
  }, extra), { merge: true });
}

function onYtState(e) {
  if (applying || !me) return;
  if (e.data === 1) sendLive({ playing: true });        // play
  else if (e.data === 2) sendLive({ playing: false });  // pause
}

// Dono ke liye naya video chalana
function setShared(id, play) {
  if (!me) return;
  quiet(3000, () => loadVideo(id, 0, play));
  const at = Date.now();
  lastAt = at;
  liveRef().set({ videoId: id, playing: play, pos: 0, by: me.role, at: at }, { merge: true });
}

function applyRemote(d) {
  const sameVideo = d.videoId === ytVideoId;
  quiet(sameVideo ? 1500 : 3000, () => {
    if (!sameVideo) {
      loadVideo(d.videoId, d.pos || 0, d.playing);
    } else if (ytPlayer && ytPlayer.seekTo) {
      ytPlayer.seekTo(d.pos || 0, true);
      if (d.playing) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
    }
  });
  if (!sameVideo) toast('Partner ne naya video lagaya 🎬');
  else toast(d.playing ? '▶ Partner ne play kiya' : '⏸ Partner ne pause kiya');
}

function onLive(snap) {
  const d = snap.exists ? snap.data() : {};
  const first = liveFirst;
  liveFirst = false;

  if (d.react) {
    if (!first && d.react.id !== lastReactId && d.react.from !== me.role) floatEmoji(d.react.e);
    lastReactId = d.react.id;
  }

  if (!d.videoId) return;
  if (first) {
    lastAt = d.at;
    loadVideo(d.videoId, d.pos || 0, false);   // pichla video taiyar rakhna, apne aap chalana nahi
    return;
  }
  if (d.at === lastAt) return;
  lastAt = d.at;
  if (d.by === me.role) return;
  applyRemote(d);
}

function floatEmoji(e) {
  const f = document.createElement('span');
  f.className = 'floaty';
  f.textContent = e;
  f.style.right = (10 + Math.random() * 60) + 'px';
  $('player').appendChild(f);
  setTimeout(() => f.remove(), 1500);
}

function resetPlayer() {
  if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
  ytVideoId = null;
  pendingVideo = null;
  liveFirst = true;
  lastAt = null;
  lastReactId = 0;
  $('ytEmpty').classList.remove('hidden');
}

function renderPlaylist() {
  const box = $('playlist');
  box.innerHTML = '';
  if (!playlist.length) {
    const p = document.createElement('p');
    p.className = 'plempty';
    p.textContent = 'Abhi koi gaana nahi. Link paste karke "Playlist mein" dabao.';
    box.appendChild(p);
    return;
  }
  playlist.forEach(item => {
    const row = document.createElement('div');
    row.className = 'plrow';

    const img = document.createElement('img');
    img.src = 'https://img.youtube.com/vi/' + item.videoId + '/mqdefault.jpg';
    img.alt = '';

    const txt = document.createElement('div');
    txt.className = 'pltxt';
    const title = document.createElement('div');
    title.className = 'pltitle';
    title.textContent = item.title || 'YouTube gaana';
    const small = document.createElement('small');
    small.textContent = 'Tap karke saath chalao';
    txt.appendChild(title);
    txt.appendChild(small);

    const del = document.createElement('button');
    del.className = 'pldel';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Hatao');
    del.onclick = ev => {
      ev.stopPropagation();
      coupleRef().collection('playlist').doc(item.id).delete();
    };

    row.onclick = () => { setShared(item.videoId, true); toast('Dono ke liye chala diya ▶'); };
    row.appendChild(img);
    row.appendChild(txt);
    row.appendChild(del);
    box.appendChild(row);
  });
}

$('ytGo').onclick = () => {
  const id = parseYouTubeId($('ytLink').value);
  if (!id) { toast('Is link mein YouTube video nahi mila'); return; }
  setShared(id, true);
  $('ytLink').value = '';
};

$('ytAdd').onclick = async () => {
  const id = parseYouTubeId($('ytLink').value);
  if (!id) { toast('Is link mein YouTube video nahi mila'); return; }
  if (!me) return;
  let title = 'YouTube gaana';
  try {
    const r = await fetch('https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    if (r.ok) {
      const j = await r.json();
      if (j.title) title = j.title;
    }
  } catch (err) { /* naam nahi mila to default naam rahega */ }
  await coupleRef().collection('playlist').add({
    videoId: id,
    title: title.slice(0, 100),
    by: me.role,
    ts: FV.serverTimestamp()
  });
  $('ytLink').value = '';
  toast('Playlist mein jod diya ✓');
};

$('ytSync').onclick = () => {
  if (!ytPlayer || !ytVideoId) { toast('Pehle video chalao'); return; }
  const playing = ytPlayer.getPlayerState && ytPlayer.getPlayerState() === 1;
  sendLive({ playing: playing });
  toast('Partner ka video aapke jaisa ho jayega');
};

document.querySelectorAll('#reactions button').forEach(b => {
  b.onclick = () => {
    floatEmoji(b.textContent);
    if (me) liveRef().set({ react: { e: b.textContent, from: me.role, id: Date.now() } }, { merge: true });
  };
});

$('tileWatch').onclick = () => showTab('watch');
$('tileCanvas').onclick = () => { showTab('games'); openGame('canvas'); };
$('tilePlant').onclick = () => { showTab('memories'); openMem('plant'); };
$('tileJar').onclick = () => { showTab('memories'); openMem('jar'); };

/* ---------- Firebase se live sunna ---------- */
function stopListening() {
  if (unsubDoc) unsubDoc();
  if (unsubMsgs) unsubMsgs();
  if (unsubLive) unsubLive();
  if (unsubList) unsubList();
  if (unsubCall) unsubCall();
  if (unsubGames) unsubGames();
  if (unsubCanvas) unsubCanvas();
  if (unsubJar) unsubJar();
  if (unsubBucket) unsubBucket();
  unsubDoc = unsubMsgs = unsubLive = unsubList = unsubCall = unsubGames = unsubCanvas = unsubJar = unsubBucket = null;
}

function startListening() {
  stopListening();
  $('welcome').classList.add('hidden');
  liveFirst = true;
  lastAt = null;
  lastReactId = 0;

  unsubDoc = coupleRef().onSnapshot(snap => {
    if (!snap.exists) { toast('Ye couple nahi mila'); return; }
    data = snap.data();
    render();
  }, () => toast('Internet ya Firebase check karo'));

  unsubMsgs = coupleRef().collection('messages').orderBy('ts', 'desc').limit(40).onSnapshot(s => {
    chat = s.docs.map(d => d.data()).reverse();
    renderChat();
  });

  unsubLive = liveRef().onSnapshot(onLive, () => {});
  unsubCall = callDoc().onSnapshot(onCall, () => {});

  unsubGames = coupleRef().collection('games').onSnapshot(sn => {
    sn.docs.forEach(d => { gameData[d.id] = d.data(); });
    renderGame();
    renderMem();
  }, () => {});

  unsubJar = coupleRef().collection('jar').orderBy('ts').limit(300).onSnapshot(sn => {
    jar = sn.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderMem();
  }, () => {});

  unsubBucket = coupleRef().collection('bucket').orderBy('ts').limit(200).onSnapshot(sn => {
    bucket = sn.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderMem();
  }, () => {});

  unsubCanvas = coupleRef().collection('canvas').orderBy('ts').limit(400).onSnapshot(sn => {
    strokes = sn.docs.map(d => Object.assign({ id: d.id }, d.data()));
    redrawCanvas();
  }, () => {});

  unsubList = coupleRef().collection('playlist').orderBy('ts', 'desc').limit(50).onSnapshot(s => {
    playlist = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
    renderPlaylist();
  });
}

/* ---------- Welcome ---------- */
$('btnCreate').onclick = () => {
  $('welcome').classList.add('hidden');
  openSetup(false);
};

$('joinGo').onclick = async () => {
  const code = $('joinCode').value.trim().toUpperCase();
  $('joinErr').textContent = '';
  if (code.length < 6 || code.length > 10) { $('joinErr').textContent = 'Poora couple code likho.'; return; }
  try {
    const snap = await db.collection('couples').doc(code).get();
    if (!snap.exists) { $('joinErr').textContent = 'Ye code galat hai.'; return; }
    me = { code: code, role: 'B' };
    localStorage.setItem('ilu_me', JSON.stringify(me));
    startListening();
    toast('Judh gaye! 💗');
  } catch (e) {
    $('joinErr').textContent = 'Nahi juda: ' + e.message;
  }
};

/* ---------- Signup / Edit ---------- */
function openSetup(edit) {
  setupMode = edit ? 'edit' : 'create';
  if (edit && data) {
    $('nameA').value = data.nameA;
    $('nameB').value = data.nameB;
    $('since').value = data.since;
    draft = { emojiA: data.emojiA, emojiB: data.emojiB };
  } else {
    $('nameA').value = '';
    $('nameB').value = '';
    $('since').value = '';
    draft = { emojiA: '👨', emojiB: '👩' };
  }
  $('err').textContent = '';
  $('saveBtn').textContent = edit ? 'Save karo' : 'Couple banao';
  buildPicker('pickA', 'emojiA');
  buildPicker('pickB', 'emojiB');
  $('setup').classList.remove('hidden');
}

$('saveBtn').onclick = async () => {
  const a = $('nameA').value.trim();
  const b = $('nameB').value.trim();
  const s = $('since').value;
  if (!a || !b) { $('err').textContent = 'Dono ke naam likho.'; return; }
  if (!s) { $('err').textContent = 'Saath hone ki date chuno.'; return; }
  const info = { nameA: a, nameB: b, since: s, emojiA: draft.emojiA, emojiB: draft.emojiB };
  try {
    if (setupMode === 'edit') {
      await coupleRef().update(info);
      $('setup').classList.add('hidden');
      return;
    }
    let code, ref;
    do {
      code = makeCode();
      ref = db.collection('couples').doc(code);
    } while ((await ref.get()).exists);
    await ref.set(Object.assign({}, info, {
      theme: 'mint',
      mood: { A: '', B: '' },
      created: FV.serverTimestamp()
    }));
    me = { code: code, role: 'A' };
    localStorage.setItem('ilu_me', JSON.stringify(me));
    $('setup').classList.add('hidden');
    startListening();
    $('codeText').textContent = code;
    $('settings').classList.remove('hidden');
    toast('Couple ban gaya! Code partner ko bhejo');
  } catch (e) {
    $('err').textContent = 'Save nahi hua: ' + e.message;
  }
};

$('cancelSetup').onclick = () => {
  $('setup').classList.add('hidden');
  if (!me) $('welcome').classList.remove('hidden');
};
$('editBtn').onclick = () => openSetup(true);

/* ---------- Settings ---------- */
$('openSettings').onclick = () => $('settings').classList.remove('hidden');
$('closeSettings').onclick = () => $('settings').classList.add('hidden');

document.querySelectorAll('.theme').forEach(t => {
  t.onclick = () => coupleRef().update({ theme: t.dataset.theme });
});

$('copyCode').onclick = () => {
  const code = me.code;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code).then(
      () => toast('Code copy ho gaya'),
      () => toast('Code: ' + code)
    );
  } else {
    toast('Code: ' + code);
  }
};

$('logoutBtn').onclick = () => {
  if (!confirm('Is phone se bahar niklein? Data safe rahega, code se wapas ja sakte ho.')) return;
  stopListening();
  resetPlayer();
  cleanupCall();
  resetGames();
  resetMem();
  localStorage.removeItem('ilu_me');
  me = null; data = null; chat = []; playlist = [];
  $('settings').classList.add('hidden');
  $('welcome').classList.remove('hidden');
};

/* ---------- Tabs ---------- */
document.querySelectorAll('#nav button').forEach(btn => {
  btn.onclick = () => showTab(btn.dataset.tab);
});

/* ---------- Chat ---------- */
function sendMsg() {
  const t = $('msgInput').value.trim();
  if (!t || !me) return;
  coupleRef().collection('messages').add({
    text: t,
    from: me.role,
    ts: FV.serverTimestamp()
  });
  $('msgInput').value = '';
}
$('sendBtn').onclick = sendMsg;
$('msgInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(); });

/* ---------- Photo sharing ---------- */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = 800, quality = 0.65, out = '';
      for (let i = 0; i < 6; i++) {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', quality);
        if (out.length < 250000) break;
        max = Math.round(max * 0.8);
        quality = Math.max(0.4, quality - 0.08);
      }
      if (out.length < 900000) resolve(out);
      else reject(new Error('Photo bahut badi hai'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Photo khul nahi payi'));
    };
    img.src = url;
  });
}

$('photoBtn').addEventListener('click', () => $('photoInput').click());

$('photoInput').addEventListener('change', async () => {
  const file = $('photoInput').files[0];
  if (!file) return;
  if (!me) { toast('Pehle couple se judo'); return; }
  toast('Photo chhoti ho rahi hai...');
  try {
    const img = await compressImage(file);
    await coupleRef().collection('messages').add({
      img: img,
      text: '',
      from: me.role,
      ts: FV.serverTimestamp()
    });
    toast('Photo bhej di ✓');
  } catch (e) {
    toast('Photo nahi gayi: ' + e.message);
  }
  $('photoInput').value = '';
});

/* ---------- Jaldi aane wale features ---------- */
document.querySelectorAll('[data-soon]').forEach(el => {
  el.onclick = () => toast(el.dataset.soon + ' jaldi aayega 💗');
});

/* =====================================================
   VIDEO CALL + FUNNY FILTERS
   ===================================================== */
const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};
const callDoc = () => coupleRef().collection('call').doc('state');
const iceCol = () => coupleRef().collection('callIce');

let pc = null, camStream = null, outStream = null, camFacing = 'user';
let callId = null, callRole = null, handledId = null, incomingOffer = null;
let iceQueue = [], remoteSet = false;
let unsubIce = null, ringTimer = null, drawTimer = null;
let curFilter = 'none', faceDet = null, faceLoading = false, lastFace = null, frameN = 0;

const FILTER_LIST = [
  { id: 'none', l: 'Normal' },
  { id: 'pink', l: '🌸 Pink' },
  { id: 'bw', l: '⚫ B&W' },
  { id: 'vintage', l: '📷 Vintage' },
  { id: 'glow', l: '✨ Glow' },
  { id: 'dog', l: '🐶 Dog' },
  { id: 'bunny', l: '🐰 Bunny' },
  { id: 'cat', l: '🐱 Cat' },
  { id: 'crown', l: '👑 Crown' },
  { id: 'glasses', l: '😎 Glasses' },
  { id: 'hearts', l: '😍 Hearts' }
];

const FILTER_CSS = {
  none: 'none',
  pink: 'sepia(0.35) hue-rotate(-20deg) saturate(1.8) brightness(1.05)',
  bw: 'grayscale(1) contrast(1.1)',
  vintage: 'sepia(0.7) contrast(1.1) brightness(0.95)',
  glow: 'brightness(1.15) contrast(0.95) saturate(1.25)'
};

/* ----- Chehre par lagne wale stickers ----- */
function emojiAt(ctx, ch, x, y, size) {
  ctx.font = Math.round(size) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}
function ear(ctx, x, y, rx, ry, rot, color, inner) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  if (inner) {
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.ellipse(0, ry * 0.1, rx * 0.55, ry * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
function tri(ctx, x, y, w, h, rot, color, inner) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -h); ctx.lineTo(-w / 2, 0); ctx.lineTo(w / 2, 0);
  ctx.closePath();
  ctx.fill();
  if (inner) {
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.65); ctx.lineTo(-w * 0.28, 0); ctx.lineTo(w * 0.28, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

const FACE_FILTERS = {
  dog(ctx, f) {
    ear(ctx, f.x + f.w * 0.02, f.y + f.h * 0.15, f.w * 0.15, f.h * 0.3, -0.4, '#8B5A2B');
    ear(ctx, f.x + f.w * 0.98, f.y + f.h * 0.15, f.w * 0.15, f.h * 0.3, 0.4, '#8B5A2B');
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(f.nose.x, f.nose.y, f.w * 0.09, f.w * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    emojiAt(ctx, '👅', f.nose.x, f.nose.y + f.h * 0.28, f.w * 0.22);
  },
  bunny(ctx, f) {
    ear(ctx, f.x + f.w * 0.3, f.y - f.h * 0.28, f.w * 0.11, f.h * 0.42, -0.12, '#ffffff', '#ffb6c8');
    ear(ctx, f.x + f.w * 0.7, f.y - f.h * 0.28, f.w * 0.11, f.h * 0.42, 0.12, '#ffffff', '#ffb6c8');
    ctx.fillStyle = '#ff8fa8';
    ctx.beginPath();
    ctx.ellipse(f.nose.x, f.nose.y, f.w * 0.05, f.w * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  cat(ctx, f) {
    tri(ctx, f.x + f.w * 0.12, f.y + f.h * 0.08, f.w * 0.3, f.h * 0.28, -0.25, '#444', '#ffb6c8');
    tri(ctx, f.x + f.w * 0.88, f.y + f.h * 0.08, f.w * 0.3, f.h * 0.28, 0.25, '#444', '#ffb6c8');
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(2, f.w * 0.012);
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(f.nose.x - f.w * 0.12, f.nose.y + i * f.h * 0.05);
      ctx.lineTo(f.nose.x - f.w * 0.45, f.nose.y + i * f.h * 0.1);
      ctx.moveTo(f.nose.x + f.w * 0.12, f.nose.y + i * f.h * 0.05);
      ctx.lineTo(f.nose.x + f.w * 0.45, f.nose.y + i * f.h * 0.1);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff6f91';
    ctx.beginPath();
    ctx.ellipse(f.nose.x, f.nose.y, f.w * 0.05, f.w * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  crown(ctx, f) {
    emojiAt(ctx, '👑', f.x + f.w / 2, f.y - f.h * 0.02, f.w * 1.0);
  },
  glasses(ctx, f) {
    emojiAt(ctx, '🕶️', f.eyes.x, f.eyes.y, f.eyes.d * 2.4);
  },
  hearts(ctx, f) {
    const e1 = f.e1 || { x: f.eyes.x - f.eyes.d / 2, y: f.eyes.y };
    const e2 = f.e2 || { x: f.eyes.x + f.eyes.d / 2, y: f.eyes.y };
    emojiAt(ctx, '❤️', e1.x, e1.y, f.eyes.d * 0.8);
    emojiAt(ctx, '❤️', e2.x, e2.y, f.eyes.d * 0.8);
  }
};

function faceBox(det, W, H) {
  const bb = det.boundingBox;
  const norm = bb.width <= 1.5;
  const sx = norm ? W : 1, sy = norm ? H : 1;
  const box = { x: bb.originX * sx, y: bb.originY * sy, w: bb.width * sx, h: bb.height * sy };
  const k = det.keypoints || [];
  const kx = (k[0] && k[0].x > 1.5) ? 1 : W;
  const ky = (k[0] && k[0].y > 1.5) ? 1 : H;
  const P = i => (k[i] ? { x: k[i].x * kx, y: k[i].y * ky } : null);
  const e1 = P(0), e2 = P(1), nose = P(2);
  box.e1 = e1;
  box.e2 = e2;
  box.eyes = (e1 && e2)
    ? { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2, d: Math.hypot(e1.x - e2.x, e1.y - e2.y) }
    : { x: box.x + box.w / 2, y: box.y + box.h * 0.38, d: box.w * 0.45 };
  box.nose = nose || { x: box.x + box.w / 2, y: box.y + box.h * 0.58 };
  return box;
}

async function loadFaceDetector() {
  if (faceDet || faceLoading) return;
  faceLoading = true;
  toast('Face filter load ho raha hai...');
  try {
    const base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
    const mp = await import(base + '/+esm');
    const fileset = await mp.FilesetResolver.forVisionTasks(base + '/wasm');
    faceDet = await mp.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
      },
      runningMode: 'VIDEO'
    });
    toast('Filter taiyar ✓');
  } catch (e) {
    toast('Face filter nahi chala: ' + e.message);
    curFilter = 'none';
    updateChips();
  }
  faceLoading = false;
}

function buildChips() {
  const box = $('fchips');
  box.innerHTML = '';
  FILTER_LIST.forEach(f => {
    const b = document.createElement('button');
    b.className = 'fchip' + (curFilter === f.id ? ' sel' : '');
    b.dataset.id = f.id;
    b.textContent = f.l;
    b.onclick = () => {
      curFilter = f.id;
      updateChips();
      if (FACE_FILTERS[f.id]) loadFaceDetector();
    };
    box.appendChild(b);
  });
}
function updateChips() {
  document.querySelectorAll('.fchip').forEach(b =>
    b.classList.toggle('sel', b.dataset.id === curFilter));
}

/* ----- Camera aur canvas ----- */
function drawFrame() {
  const v = $('camVideo'), c = $('camCanvas');
  if (!v.videoWidth) return;
  if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
    c.width = v.videoWidth;
    c.height = v.videoHeight;
  }
  const ctx = c.getContext('2d');
  ctx.filter = FILTER_CSS[curFilter] || 'none';
  ctx.drawImage(v, 0, 0, c.width, c.height);
  ctx.filter = 'none';
  const sticker = FACE_FILTERS[curFilter];
  if (sticker && faceDet) {
    frameN++;
    if (frameN % 3 === 0) {
      try {
        const r = faceDet.detectForVideo(v, performance.now());
        lastFace = (r.detections && r.detections[0]) || null;
      } catch (e) { lastFace = null; }
    }
    if (lastFace) sticker(ctx, faceBox(lastFace, c.width, c.height));
  }
}

async function startCamera() {
  camStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: camFacing, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: true
  });
  const v = $('camVideo');
  v.srcObject = camStream;
  await v.play();
  const c = $('camCanvas');
  c.width = v.videoWidth || 640;
  c.height = v.videoHeight || 480;
  const canvasTrack = c.captureStream(24).getVideoTracks()[0];
  outStream = new MediaStream([canvasTrack].concat(camStream.getAudioTracks()));
  clearInterval(drawTimer);
  drawTimer = setInterval(drawFrame, 42);
}

async function openCallUI() {
  await startCamera();
  buildChips();
  $('btnMic').classList.remove('off');
  $('btnMic').textContent = '🎤';
  $('btnCamOff').classList.remove('off');
  $('call').classList.remove('hidden');
}

/* ----- WebRTC ----- */
let iceCfg = null;
async function getIceConfig() {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ].concat(TURN_EXTRA);
  if (TURN_APP && TURN_KEY) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch('https://' + TURN_APP + '.metered.live/api/v1/turn/credentials?apiKey=' +
        encodeURIComponent(TURN_KEY), { signal: ctl.signal });
      clearTimeout(timer);
      if (r.ok) {
        const list = await r.json();
        if (Array.isArray(list)) return { iceServers: servers.concat(list) };
      }
      toast('TURN nahi mila, sirf STUN chalega');
    } catch (e) {
      toast('TURN load nahi hua, sirf STUN chalega');
    }
  }
  return { iceServers: servers };
}


function makePC() {
  pc = new RTCPeerConnection(iceCfg || ICE_CONFIG);
  outStream.getTracks().forEach(t => pc.addTrack(t, outStream));
  pc.ontrack = e => {
    const rv = $('remoteVideo');
    if (rv.srcObject !== e.streams[0]) rv.srcObject = e.streams[0];
  };
  pc.onicecandidate = e => {
    if (e.candidate && callId) {
      iceCol().add({ callId: callId, from: me.role, c: JSON.stringify(e.candidate) });
    }
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    const s = pc.connectionState;
    if (s === 'connected') $('callStatus').textContent = '';
    else if (s === 'connecting') $('callStatus').textContent = 'Jud raha hai...';
    else if (s === 'failed') {
      $('callStatus').textContent = 'Connect nahi hua';
      toast('Call connect nahi hui. Dono ka internet check karo.');
    }
  };
}

function flushIce() {
  const q = iceQueue;
  iceQueue = [];
  q.forEach(c => { if (pc) pc.addIceCandidate(c).catch(() => {}); });
}

function listenIce(id) {
  if (unsubIce) unsubIce();
  unsubIce = iceCol().where('callId', '==', id).onSnapshot(s => {
    s.docChanges().forEach(ch => {
      if (ch.type !== 'added') return;
      const d = ch.doc.data();
      if (d.from === me.role) return;
      const cand = JSON.parse(d.c);
      if (pc && remoteSet) pc.addIceCandidate(cand).catch(() => {});
      else iceQueue.push(cand);
    });
  });
}

async function startCall() {
  if (!me || pc) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    toast('Camera ke liye app ko https link se kholo');
    return;
  }
  try {
    await openCallUI();
    callId = String(Date.now());
    callRole = 'caller';
    iceQueue = [];
    remoteSet = false;
    iceCfg = await getIceConfig();
    makePC();
    listenIce(callId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await callDoc().set({
      callId: callId,
      from: me.role,
      status: 'ringing',
      offer: { type: offer.type, sdp: offer.sdp },
      answer: null,
      at: Date.now()
    });
    $('callStatus').textContent = 'Ring ho raha hai...';
    ringTimer = setTimeout(() => {
      if (pc && !remoteSet) { toast('Partner ne nahi uthaya'); endCall(true); }
    }, 45000);
  } catch (e) {
    toast('Call shuru nahi hui: ' + e.message);
    cleanupCall();
  }
}

function showIncoming() {
  const partner = me.role === 'A' ? 'B' : 'A';
  $('incAv').textContent = data ? data['emoji' + partner] : '💗';
  $('incText').textContent = (data ? data['name' + partner] : 'Partner') + ' call kar raha hai 📞';
  $('incoming').classList.remove('hidden');
  if (navigator.vibrate) navigator.vibrate([300, 200, 300, 200, 300]);
}

async function acceptCall() {
  $('incoming').classList.add('hidden');
  handledId = callId;
  try {
    callRole = 'callee';
    await openCallUI();
    iceCfg = await getIceConfig();
    makePC();
    await pc.setRemoteDescription(incomingOffer);
    remoteSet = true;
    flushIce();
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    await callDoc().update({ status: 'active', answer: { type: ans.type, sdp: ans.sdp } });
    $('callStatus').textContent = 'Jud raha hai...';
  } catch (e) {
    toast('Call nahi uthi: ' + e.message);
    endCall(true);
  }
}

function declineCall() {
  handledId = callId;
  callDoc().update({ status: 'ended' }).catch(() => {});
  cleanupCall();
}

function onCall(snap) {
  if (!me) return;
  const d = snap.exists ? snap.data() : null;
  if (!d) return;

  // Partner ki call aa rahi hai
  if (d.status === 'ringing' && d.from !== me.role && !pc && d.callId !== handledId) {
    if (Date.now() - d.at > 60000) return;     // purani call
    callId = d.callId;
    incomingOffer = d.offer;
    iceQueue = [];
    remoteSet = false;
    listenIce(callId);
    showIncoming();
    return;
  }

  // Maine call ki thi aur partner ne utha li
  if (callRole === 'caller' && d.callId === callId && d.status === 'active' && d.answer && !remoteSet && pc) {
    pc.setRemoteDescription(d.answer).then(() => {
      remoteSet = true;
      clearTimeout(ringTimer);
      flushIce();
      $('callStatus').textContent = 'Jud raha hai...';
    }).catch(e => toast('Call jud nahi payi: ' + e.message));
    return;
  }

  // Call khatam
  if (d.status === 'ended' && d.callId === callId && callId !== null) {
    toast('Call khatam');
    cleanupCall();
  }
}

function endCall(notify) {
  if (notify && me && callId) callDoc().update({ status: 'ended' }).catch(() => {});
  cleanupCall();
}

function cleanupCall() {
  clearTimeout(ringTimer);
  clearInterval(drawTimer);
  if (unsubIce) { unsubIce(); unsubIce = null; }
  if (pc) { pc.close(); pc = null; }
  if (camStream) camStream.getTracks().forEach(t => t.stop());
  camStream = null;
  outStream = null;
  const rv = $('remoteVideo');
  if (rv) rv.srcObject = null;
  $('call').classList.add('hidden');
  $('incoming').classList.add('hidden');
  callId = null;
  callRole = null;
  iceQueue = [];
  remoteSet = false;
  incomingOffer = null;
}

$('btnCall').onclick = startCall;
$('incYes').onclick = acceptCall;
$('incNo').onclick = declineCall;
$('btnEnd').onclick = () => endCall(true);

$('btnMic').onclick = () => {
  if (!camStream) return;
  const t = camStream.getAudioTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('btnMic').textContent = t.enabled ? '🎤' : '🔇';
  $('btnMic').classList.toggle('off', !t.enabled);
};

$('btnCamOff').onclick = () => {
  if (!outStream) return;
  const t = outStream.getVideoTracks()[0];
  if (!t) return;
  t.enabled = !t.enabled;
  $('btnCamOff').classList.toggle('off', !t.enabled);
};

$('btnFlip').onclick = async () => {
  if (!camStream) return;
  const next = camFacing === 'user' ? 'environment' : 'user';
  try {
    const ns = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: next, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    const audio = camStream.getAudioTracks();
    camStream.getVideoTracks().forEach(t => t.stop());
    camStream = new MediaStream(ns.getVideoTracks().concat(audio));
    camFacing = next;
    $('camVideo').srcObject = camStream;
    await $('camVideo').play();
  } catch (e) {
    toast('Camera nahi badla');
  }
};

/* =====================================================
   KHELO: Tic-tac-toe, RPS, Couple Quiz, Date Night, Shared Canvas
   ===================================================== */
let gameData = {};
let activeGame = null;
let strokes = [];
const gameRef = id => coupleRef().collection('games').doc(id);
const otherRole = () => (me.role === 'A' ? 'B' : 'A');
const partnerName = () => (data ? data['name' + otherRole()] : 'Partner');

function openGame(name) {
  activeGame = name;
  $('gameMenu').classList.add('hidden');
  $('gamePanel').classList.remove('hidden');
  document.querySelectorAll('.gp').forEach(p => p.classList.toggle('hidden', p.id !== 'gp-' + name));
  renderGame();
}
function closeGame() {
  activeGame = null;
  $('gamePanel').classList.add('hidden');
  $('gameMenu').classList.remove('hidden');
}
function renderGame() {
  if (!me || !activeGame) return;
  if (activeGame === 'ttt') renderTtt();
  else if (activeGame === 'rps') renderRps();
  else if (activeGame === 'quiz') renderQuiz();
  else if (activeGame === 'date') renderDate();
  else if (activeGame === 'canvas') redrawCanvas();
}
function resetGames() {
  gameData = {};
  strokes = [];
  closeGame();
  redrawCanvas();
}
document.querySelectorAll('[data-game]').forEach(b => { b.onclick = () => openGame(b.dataset.game); });
$('gameBack').onclick = closeGame;

/* ---------- Tic-tac-toe ---------- */
const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function tttState() {
  return Object.assign({ board: '---------', turn: 'A', winner: '', winsA: 0, winsB: 0, games: 0 }, gameData.ttt || {});
}
function tttMove(i) {
  const g = tttState();
  if (g.winner || g.board[i] !== '-' || g.turn !== me.role) return;
  const mark = me.role === 'A' ? 'X' : 'O';
  const b = g.board.slice(0, i) + mark + g.board.slice(i + 1);
  let winner = '';
  WINS.forEach(w => {
    if (b[w[0]] !== '-' && b[w[0]] === b[w[1]] && b[w[1]] === b[w[2]]) winner = me.role;
  });
  if (!winner && b.indexOf('-') === -1) winner = 'draw';
  const upd = { board: b, turn: otherRole(), winner: winner };
  if (winner === 'A') upd.winsA = (g.winsA || 0) + 1;
  if (winner === 'B') upd.winsB = (g.winsB || 0) + 1;
  gameRef('ttt').set(upd, { merge: true });
}
function renderTtt() {
  const g = tttState();
  const box = $('tttBoard');
  box.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const b = document.createElement('button');
    const ch = g.board[i];
    b.textContent = ch === '-' ? '' : ch;
    b.className = 'tcell' + (ch === 'X' ? ' x' : ch === 'O' ? ' o' : '');
    b.onclick = () => tttMove(i);
    box.appendChild(b);
  }
  const mine = me.role === 'A' ? 'X' : 'O';
  let st;
  if (g.winner === 'draw') st = 'Barabar rahi 🤝';
  else if (g.winner) st = g.winner === me.role ? 'Aap jeet gaye 🎉' : partnerName() + ' jeet gaya 😄';
  else st = g.turn === me.role ? 'Aapki baari (' + mine + ')' : partnerName() + ' ki baari...';
  $('tttStatus').textContent = st;
  const my = me.role === 'A' ? g.winsA : g.winsB;
  const th = me.role === 'A' ? g.winsB : g.winsA;
  $('tttScore').textContent = 'Aap ' + (my || 0) + '  •  ' + partnerName() + ' ' + (th || 0);
}
$('tttNew').onclick = () => {
  if (!me) return;
  const g = tttState();
  const n = (g.games || 0) + 1;
  gameRef('ttt').set({ board: '---------', winner: '', turn: n % 2 === 1 ? 'B' : 'A', games: n }, { merge: true });
};

/* ---------- Rock Paper Scissors ---------- */
const RPS_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
const RPS_BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
let rpsScoredLocal = 0;
function rpsState() {
  return Object.assign({ a: '', b: '', round: 1, scoreA: 0, scoreB: 0, scored: 0 }, gameData.rps || {});
}
function renderRps() {
  const g = rpsState();
  const mk = me.role === 'A' ? 'a' : 'b';
  const ok = me.role === 'A' ? 'b' : 'a';
  const mine = g[mk], theirs = g[ok];
  const both = !!(mine && theirs);
  $('rpsBtns').classList.toggle('hidden', !!mine);
  $('rpsNext').classList.toggle('hidden', !both);

  if (!mine) {
    $('rpsInfo').textContent = 'Round ' + g.round + ': apna pick chuno 👇';
    $('rpsResult').textContent = '';
  } else if (!theirs) {
    $('rpsInfo').textContent = 'Aapne chun liya ✓  ' + partnerName() + ' ka intezaar...';
    $('rpsResult').textContent = '🤫';
  } else {
    $('rpsResult').textContent = RPS_EMOJI[mine] + '  vs  ' + RPS_EMOJI[theirs];
    if (mine === theirs) $('rpsInfo').textContent = 'Barabar! 🤝';
    else if (RPS_BEATS[mine] === theirs) $('rpsInfo').textContent = 'Aap jeete 🎉';
    else $('rpsInfo').textContent = partnerName() + ' jeeta 😄';
  }

  // Sirf "A" score likhta hai, taaki do baar na jude
  if (both && me.role === 'A' && g.scored !== g.round && rpsScoredLocal !== g.round) {
    rpsScoredLocal = g.round;
    const aWins = RPS_BEATS[g.a] === g.b;
    const bWins = RPS_BEATS[g.b] === g.a;
    gameRef('rps').set({
      scoreA: (g.scoreA || 0) + (aWins ? 1 : 0),
      scoreB: (g.scoreB || 0) + (bWins ? 1 : 0),
      scored: g.round
    }, { merge: true });
  }
  const my = me.role === 'A' ? g.scoreA : g.scoreB;
  const th = me.role === 'A' ? g.scoreB : g.scoreA;
  $('rpsScore').textContent = 'Aap ' + (my || 0) + '  •  ' + partnerName() + ' ' + (th || 0);
}
document.querySelectorAll('#rpsBtns button').forEach(b => {
  b.onclick = () => {
    if (!me) return;
    const g = rpsState();
    const k = me.role === 'A' ? 'a' : 'b';
    if (g[k]) return;
    gameRef('rps').set({ [k]: b.dataset.pick }, { merge: true });
  };
});
$('rpsNext').onclick = () => {
  const g = rpsState();
  gameRef('rps').set({ a: '', b: '', round: g.round + 1 }, { merge: true });
};

/* ---------- Couple Quiz ---------- */
const QUIZ = [
  { q: 'Favourite khana kaunsa hai?', o: ['Biryani', 'Pizza', 'Chaat', 'Chinese'] },
  { q: 'Sabse pasandida mausam?', o: ['Garmi', 'Barish', 'Sardi', 'Basant'] },
  { q: 'Chai ya coffee?', o: ['Chai', 'Coffee', 'Dono', 'Koi nahi'] },
  { q: 'Pasandida movie type?', o: ['Romantic', 'Comedy', 'Horror', 'Action'] },
  { q: 'Gussa aaye to kya karte hain?', o: ['Chup ho jana', 'Bahas karna', 'Rona', 'Jaldi bhool jana'] },
  { q: 'Sabse achhi date kaunsi?', o: ['Movie', 'Lambi drive', 'Ghar par saath', 'Restaurant'] },
  { q: 'Favourite rang?', o: ['Laal / Pink', 'Neela', 'Kala', 'Hara'] },
  { q: 'Dream trip kahan ki?', o: ['Pahaad', 'Beach', 'Videsh', 'Shehar ghoomna'] },
  { q: 'Sabse pasandida gift?', o: ['Chocolate', 'Phool', 'Kapde', 'Handmade cheez'] },
  { q: 'Sone ka time?', o: ['10 baje se pehle', '12 baje tak', 'Raat 2 tak', 'Kabhi bhi'] },
  { q: 'Khali time mein kya karte hain?', o: ['Phone', 'Sona', 'Gaane sunna', 'Ghumna'] },
  { q: 'Subah ya raat?', o: ['Subah ka insaan', 'Raat ka insaan'] }
];
function quizState() {
  return Object.assign({ round: 0, answer: -1, guess: -1, matched: null, points: 0 }, gameData.quiz || {});
}
function renderQuiz() {
  const g = quizState();
  const q = QUIZ[g.round % QUIZ.length];
  const answerer = g.round % 2 === 0 ? 'A' : 'B';
  const iAnswer = answerer === me.role;
  const answerName = iAnswer ? 'Aap' : partnerName();
  const box = $('quizBox');
  box.innerHTML = '';

  const title = document.createElement('div');
  title.className = 'qtitle';
  title.textContent = 'Sawal ' + (g.round + 1) + ': ' + q.q;
  box.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'gstatus';
  box.appendChild(sub);

  const revealed = g.guess >= 0;
  function addOptions(onPick) {
    q.o.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'qopt';
      b.textContent = t;
      if (revealed) {
        if (i === g.answer) b.classList.add('right');
        if (i === g.guess) b.classList.add('guess');
      } else if (!onPick && iAnswer && i === g.answer) {
        b.classList.add('right');
      }
      if (onPick) b.onclick = () => onPick(i);
      box.appendChild(b);
    });
  }

  if (revealed) {
    sub.textContent = g.matched ? 'Bilkul sahi guess! 🎉 +1 point' : 'Galat guess 😅 (sahi jawab hara hai)';
    addOptions(null);
    const next = document.createElement('button');
    next.className = 'big';
    next.textContent = 'Agla sawal ➜';
    next.onclick = () => gameRef('quiz').set({ round: g.round + 1, answer: -1, guess: -1, matched: null }, { merge: true });
    box.appendChild(next);
  } else if (iAnswer) {
    if (g.answer < 0) {
      sub.textContent = 'Ye sawal aapke baare mein hai, sach sach chuno 👇';
      addOptions(i => gameRef('quiz').set({ answer: i }, { merge: true }));
    } else {
      sub.textContent = 'Aapne jawab de diya ✓  ' + partnerName() + ' guess kar raha hai...';
      addOptions(null);
    }
  } else {
    if (g.answer < 0) {
      sub.textContent = answerName + ' apna jawab chun raha hai...';
    } else {
      sub.textContent = answerName + ' ne kya chuna hoga? Guess karo 👇';
      addOptions(i => {
        const matched = i === g.answer;
        gameRef('quiz').set({ guess: i, matched: matched, points: (g.points || 0) + (matched ? 1 : 0) }, { merge: true });
      });
    }
  }
  $('quizScore').textContent = 'Couple points: ' + (g.points || 0) + ' 💗';
}

/* ---------- Date Night Planner ---------- */
const DATE_IDEAS = [
  '🎬 Saath mein movie dekho (Dekho tab)',
  '🍕 Pizza mangao aur video call par khao',
  '🌙 Chhat par jaakar taare dekho aur baatein karo',
  '🎮 Tic-tac-toe ya quiz ka mukabla',
  '🍳 Ek hi dish banao, video call par',
  '🎧 Ek dusre ko 5 favourite gaane bhejo',
  '📸 Purani photos dekho aur yaadein taza karo',
  '🕯️ Candle-light dinner, apne apne ghar mein',
  '🎨 Shared Canvas par ek dusre ka chehra banao',
  '🧁 Dessert date, kuch meetha mangao',
  '🚶 Call par saath mein walk par jao',
  '📝 Saath ki next 10 cheezein likho',
  '🎤 Ek dusre ko gaana gaakar sunao',
  '💌 Ek dusre ko lamba love letter likho'
];
let dateSpinning = false;
function renderDate() {
  const g = gameData.date;
  if (g && g.idea && !dateSpinning) $('dateResult').textContent = g.idea;
}
$('dateSpin').onclick = () => {
  if (dateSpinning || !me) return;
  dateSpinning = true;
  let i = 0;
  const t = setInterval(() => { $('dateResult').textContent = DATE_IDEAS[i++ % DATE_IDEAS.length]; }, 90);
  setTimeout(() => {
    clearInterval(t);
    const idea = DATE_IDEAS[Math.floor(Math.random() * DATE_IDEAS.length)];
    $('dateResult').textContent = idea;
    dateSpinning = false;
    gameRef('date').set({ idea: idea, by: me.role, n: Date.now() });
  }, 1500);
};

/* ---------- Shared Canvas ---------- */
const shareCanvas = $('shareCanvas');
const cctx = shareCanvas.getContext('2d');
const CANVAS_COLORS = ['#D93473', '#1f1f1f', '#2a7de1', '#1f9d55', '#f2a900', '#8a3ffc', '#ffffff'];
let curColor = CANVAS_COLORS[0], curW = 4, curStroke = null, drawing = false;

function drawStroke(s) {
  const p = s.pts;
  if (!p || p.length < 2) return;
  cctx.strokeStyle = s.c;
  cctx.lineWidth = s.w;
  cctx.lineCap = 'round';
  cctx.lineJoin = 'round';
  cctx.beginPath();
  cctx.moveTo(p[0] * 600, p[1] * 600);
  if (p.length === 2) cctx.lineTo(p[0] * 600 + 0.1, p[1] * 600);
  for (let i = 2; i < p.length; i += 2) cctx.lineTo(p[i] * 600, p[i + 1] * 600);
  cctx.stroke();
}
function redrawCanvas() {
  cctx.fillStyle = '#ffffff';
  cctx.fillRect(0, 0, 600, 600);
  strokes.forEach(drawStroke);
}
function cpos(e) {
  const r = shareCanvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
}
shareCanvas.addEventListener('pointerdown', e => {
  if (!me) return;
  shareCanvas.setPointerCapture(e.pointerId);
  const p = cpos(e);
  curStroke = { pts: [p[0], p[1]], c: curColor, w: curW };
  drawing = true;
  drawStroke(curStroke);
  e.preventDefault();
});
shareCanvas.addEventListener('pointermove', e => {
  if (!drawing || !curStroke) return;
  const p = cpos(e);
  const n = curStroke.pts.length;
  const dx = p[0] - curStroke.pts[n - 2];
  const dy = p[1] - curStroke.pts[n - 1];
  if (dx * dx + dy * dy < 0.00002) return;
  drawStroke({ pts: [curStroke.pts[n - 2], curStroke.pts[n - 1], p[0], p[1]], c: curStroke.c, w: curStroke.w });
  curStroke.pts.push(p[0], p[1]);
  e.preventDefault();
});
function endStroke() {
  if (!drawing || !curStroke) return;
  drawing = false;
  const s = curStroke;
  curStroke = null;
  let pts = s.pts;
  while (pts.length > 3000) pts = pts.filter((v, i) => Math.floor(i / 2) % 2 === 0);
  pts = pts.map(v => Math.round(v * 1000) / 1000);
  coupleRef().collection('canvas').add({
    pts: pts, c: s.c, w: s.w, by: me.role, ts: FV.serverTimestamp()
  });
}
shareCanvas.addEventListener('pointerup', endStroke);
shareCanvas.addEventListener('pointercancel', endStroke);

(function buildCanvasTools() {
  const box = $('cColors');
  CANVAS_COLORS.forEach((col, idx) => {
    const b = document.createElement('button');
    b.className = 'cdot' + (idx === 0 ? ' sel' : '');
    b.style.background = col;
    b.setAttribute('aria-label', col === '#ffffff' ? 'Eraser' : 'Rang');
    b.onclick = () => {
      curColor = col;
      box.querySelectorAll('.cdot').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    };
    box.appendChild(b);
  });
  document.querySelectorAll('[data-w]').forEach(b => {
    b.onclick = () => {
      curW = Number(b.dataset.w);
      document.querySelectorAll('[data-w]').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    };
  });
})();

$('cUndo').onclick = () => {
  if (!me) return;
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (strokes[i].by === me.role) {
      coupleRef().collection('canvas').doc(strokes[i].id).delete();
      return;
    }
  }
  toast('Hatane ke liye aapki koi line nahi hai');
};
$('cClear').onclick = () => {
  if (!me || !strokes.length) return;
  if (!confirm('Poora canvas saaf kar dein? Dono ka mit jayega.')) return;
  const batch = db.batch();
  strokes.forEach(s => batch.delete(coupleRef().collection('canvas').doc(s.id)));
  batch.commit();
};

/* =====================================================
   YAADEIN: Dual Selfie, Bucket List, Love Jar, Paudha, Secret Handshake
   ===================================================== */
let jar = [];
let bucket = [];
let activeMem = null;
let jarShown = null;

function localDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + (offset || 0));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function openMem(name) {
  activeMem = name;
  $('memMenu').classList.add('hidden');
  $('memPanel').classList.remove('hidden');
  document.querySelectorAll('.mp').forEach(p => p.classList.toggle('hidden', p.id !== 'mp-' + name));
  renderMem();
}
function closeMem() {
  activeMem = null;
  $('memPanel').classList.add('hidden');
  $('memMenu').classList.remove('hidden');
}
function renderMem() {
  if (!me || !activeMem || !data) return;
  if (activeMem === 'selfie') renderSelfie();
  else if (activeMem === 'bucket') renderBucket();
  else if (activeMem === 'jar') renderJar();
  else if (activeMem === 'plant') renderPlant();
  else if (activeMem === 'lock') renderLockPanel();
}
function resetMem() {
  jar = [];
  bucket = [];
  jarShown = null;
  closeMem();
}
document.querySelectorAll('[data-mem]').forEach(b => { b.onclick = () => openMem(b.dataset.mem); });
$('memBack').onclick = closeMem;

/* ---------- Bucket List ---------- */
function renderBucket() {
  const box = $('bucketList');
  box.innerHTML = '';
  const done = bucket.filter(b => b.done).length;
  $('bucketProg').textContent = bucket.length
    ? done + ' / ' + bucket.length + ' poore 🎯'
    : 'Abhi kuch nahi. Pehli cheez likho ✍️';
  const sorted = bucket.filter(b => !b.done).concat(bucket.filter(b => b.done));
  sorted.forEach(it => {
    const row = document.createElement('div');
    row.className = 'bitem' + (it.done ? ' done' : '');
    const chk = document.createElement('button');
    chk.className = 'chk';
    chk.textContent = it.done ? '✓' : '';
    chk.onclick = () => {
      coupleRef().collection('bucket').doc(it.id).update({ done: !it.done });
      if (!it.done) toast('🎉 Ek aur sapna poora!');
    };
    const txt = document.createElement('div');
    txt.className = 'btxt';
    txt.textContent = it.text;
    const del = document.createElement('button');
    del.className = 'bdel';
    del.textContent = '✕';
    del.setAttribute('aria-label', 'Hatao');
    del.onclick = () => coupleRef().collection('bucket').doc(it.id).delete();
    row.appendChild(chk);
    row.appendChild(txt);
    row.appendChild(del);
    box.appendChild(row);
  });
}
function addBucket() {
  const t = $('bucketInput').value.trim();
  if (!t || !me) return;
  coupleRef().collection('bucket').add({ text: t, done: false, by: me.role, ts: FV.serverTimestamp() });
  $('bucketInput').value = '';
}
$('bucketAdd').onclick = addBucket;
$('bucketInput').addEventListener('keydown', e => { if (e.key === 'Enter') addBucket(); });

/* ---------- Love Jar ---------- */
function renderJar() {
  const mineCount = jar.filter(n => n.from === me.role).length;
  const unread = jar.filter(n => n.from !== me.role && !n.read);
  const old = jar.filter(n => n.from !== me.role && n.read).reverse();
  $('jarInfo').textContent = 'Aapne ' + mineCount + ' note daale  •  ' + partnerName() +
    ' ke ' + unread.length + ' naye note jar mein hain';

  const note = $('jarNote');
  if (jarShown) {
    note.classList.remove('hidden');
    note.textContent = '“' + jarShown + '”';
    const small = document.createElement('small');
    small.textContent = '— ' + partnerName() + ' ki taraf se 💗';
    note.appendChild(small);
  } else {
    note.classList.add('hidden');
  }

  const box = $('jarOld');
  box.innerHTML = '';
  if (!old.length) {
    const p = document.createElement('p');
    p.className = 'plempty';
    p.textContent = 'Abhi koi purana note nahi.';
    box.appendChild(p);
  }
  old.forEach(n => {
    const d = document.createElement('div');
    d.className = 'oldnote';
    d.textContent = n.text;
    box.appendChild(d);
  });
}
function addJar() {
  const t = $('jarInput').value.trim();
  if (!t || !me) return;
  coupleRef().collection('jar').add({ text: t, from: me.role, read: false, ts: FV.serverTimestamp() });
  $('jarInput').value = '';
  toast('Note jar mein daal diya 💌');
}
$('jarAdd').onclick = addJar;
$('jarInput').addEventListener('keydown', e => { if (e.key === 'Enter') addJar(); });
$('jarDraw').onclick = () => {
  if (!me) return;
  const unread = jar.filter(n => n.from !== me.role && !n.read);
  if (!unread.length) { toast('Jar mein abhi koi naya note nahi 💌'); return; }
  const pick = unread[Math.floor(Math.random() * unread.length)];
  jarShown = pick.text;
  coupleRef().collection('jar').doc(pick.id).update({ read: true });
  renderJar();
};

/* ---------- Hamara paudha ---------- */
const PLANT_STAGES = [
  [0, '🌰', 'Beej'], [1, '🌱', 'Ankur'], [3, '🌿', 'Choti plant'], [6, '🪴', 'Gamle ka paudha'],
  [10, '🌷', 'Phool aa gaya'], [15, '🌻', 'Sunflower'], [25, '🌳', 'Bada ped']
];
let plantSeen = null;
function plantState() {
  return Object.assign({ waterA: '', waterB: '', growth: 0, lastGrown: '', streak: 0 }, gameData.plant || {});
}
async function tryGrow() {
  const ref = gameRef('plant');
  const today = localDay();
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const g = Object.assign({ waterA: '', waterB: '', growth: 0, lastGrown: '', streak: 0 }, snap.exists ? snap.data() : {});
      if (g.waterA === today && g.waterB === today && g.lastGrown !== today) {
        const streak = g.lastGrown === localDay(-1) ? (g.streak || 0) + 1 : 1;
        tx.set(ref, { growth: (g.growth || 0) + 1, lastGrown: today, streak: streak }, { merge: true });
      }
    });
  } catch (e) { /* agli baar phir koshish hogi */ }
}
function renderPlant() {
  const g = plantState();
  const today = localDay();
  let stage = PLANT_STAGES[0];
  PLANT_STAGES.forEach(st => { if (g.growth >= st[0]) stage = st; });
  $('plantEmoji').textContent = stage[1];
  $('plantStage').textContent = stage[2] + '  •  level ' + g.growth;
  $('plantStreak').textContent = g.streak ? '🔥 ' + g.streak + ' din lagatar' : '';
  const mine = g[me.role === 'A' ? 'waterA' : 'waterB'] === today;
  const theirs = g[me.role === 'A' ? 'waterB' : 'waterA'] === today;
  $('plantStatus').textContent =
    (mine ? 'Aapne aaj paani diya ✓' : 'Aapne aaj abhi paani nahi diya') + '\n' +
    (theirs ? partnerName() + ' ne bhi diya ✓' : partnerName() + ' ka intezaar...');
  $('plantWater').disabled = mine;
  $('plantWater').textContent = mine ? '💧 Aaj ka paani ho gaya' : '💧 Paani do';
  if (plantSeen !== null && g.growth > plantSeen) toast('Paudha badh gaya 🌱 Dono ko badhai!');
  plantSeen = g.growth;
  if (mine && theirs && g.lastGrown !== today && me.role === 'A') tryGrow();
}
$('plantWater').onclick = () => {
  if (!me) return;
  const key = me.role === 'A' ? 'waterA' : 'waterB';
  gameRef('plant').set({ [key]: localDay() }, { merge: true }).then(tryGrow);
};

/* ---------- Dual Selfie ---------- */
function compressTo(file, maxSide, limit) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let max = maxSide, q = 0.65, out = '';
      for (let i = 0; i < 6; i++) {
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        out = c.toDataURL('image/jpeg', q);
        if (out.length < limit) break;
        max = Math.round(max * 0.8);
        q = Math.max(0.4, q - 0.08);
      }
      if (out.length < limit * 2) resolve(out);
      else reject(new Error('Photo bahut badi hai'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Photo khul nahi payi')); };
    img.src = url;
  });
}
function loadImg(src) {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCover(ctx, img, x, y, w, h) {
  const sc = Math.max(w / img.width, h / img.height);
  const sw = w / sc, sh = h / sc;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
let selfieKey = '';
async function composeSelfie(a, b) {
  const cv = $('selfieCanvas');
  const ctx = cv.getContext('2d');
  const [ia, ib] = await Promise.all([loadImg(a), loadImg(b)]);
  const grad = ctx.createLinearGradient(0, 0, 1000, 640);
  grad.addColorStop(0, '#FFC4DC');
  grad.addColorStop(1, '#D93473');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1000, 640);
  [[ia, 50], [ib, 530]].forEach(p => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#fff';
    roundRectPath(ctx, p[1] - 10, 50, 440, 440, 28);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRectPath(ctx, p[1], 60, 420, 420, 22);
    ctx.clip();
    drawCover(ctx, p[0], p[1], 60, 420, 420);
    ctx.restore();
  });
  emojiAt(ctx, '❤️', 500, 270, 90);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 38px system-ui, sans-serif';
  ctx.fillText(data.nameA + '  ❤  ' + data.nameB, 500, 548);
  ctx.font = '500 24px system-ui, sans-serif';
  const dt = new Date();
  ctx.fillText('ILU 💗  ' + dt.getDate() + '/' + (dt.getMonth() + 1) + '/' + dt.getFullYear(), 500, 596);
}
function renderSelfie() {
  const g = gameData.selfie || {};
  const mine = me.role === 'A' ? g.imgA : g.imgB;
  const theirs = me.role === 'A' ? g.imgB : g.imgA;
  const both = !!(g.imgA && g.imgB);
  $('selfieCanvas').classList.toggle('hidden', !both);
  $('selfieSave').classList.toggle('hidden', !both);
  $('selfieMine').classList.toggle('hidden', both || !mine);
  if (mine && !both) $('selfieMine').src = mine;
  if (both) {
    $('selfieStatus').textContent = 'Frame taiyar 💗';
    const key = (g.imgA.length + ':' + g.imgB.length + ':' + data.nameA + data.nameB);
    if (key !== selfieKey) {
      selfieKey = key;
      composeSelfie(g.imgA, g.imgB).catch(() => toast('Frame nahi bana'));
    }
  } else if (mine) {
    $('selfieStatus').textContent = 'Aapki selfie ho gayi ✓  ' + partnerName() + ' ka intezaar...';
  } else if (theirs) {
    $('selfieStatus').textContent = partnerName() + ' ki selfie aa gayi ✓  Ab aap lo 📸';
  } else {
    $('selfieStatus').textContent = 'Dono apni apni selfie lo 📸';
  }
  $('selfieBtn').textContent = mine ? '🔄 Meri selfie dobara lo' : '📸 Meri selfie lo';
}
$('selfieBtn').onclick = () => $('selfiePick').click();
$('selfiePick').onchange = async () => {
  const file = $('selfiePick').files[0];
  $('selfiePick').value = '';
  if (!file || !me) return;
  toast('Selfie chhoti ho rahi hai...');
  try {
    const img = await compressTo(file, 520, 110000);
    await gameRef('selfie').set({ [me.role === 'A' ? 'imgA' : 'imgB']: img }, { merge: true });
    toast('Selfie save ✓');
  } catch (e) {
    toast('Selfie nahi gayi: ' + e.message);
  }
};
$('selfieSave').onclick = () => {
  $('selfieCanvas').toBlob(blob => {
    if (!blob) { toast('Save nahi hua'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ILU-dual-selfie.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
};

/* ---------- Secret Handshake (PIN lock) ---------- */
let pinEntry = '';
let hiddenAt = 0;
async function hashPin(pin) {
  const text = pin + ':' + (me ? me.code : '');
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return 'x' + h;
}
function lockOn() { return localStorage.getItem('ilu_lock') === '1'; }
function syncPinHash() {
  if (data && data.pinHash && lockOn()) localStorage.setItem('ilu_pinhash', data.pinHash);
}
function renderPinDots() {
  const box = $('pinDots');
  box.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const d = document.createElement('i');
    if (i < pinEntry.length) d.className = 'on';
    box.appendChild(d);
  }
}
function showLock() {
  if (!me || !lockOn() || !localStorage.getItem('ilu_pinhash')) return;
  pinEntry = '';
  $('lockMsg').textContent = '';
  renderPinDots();
  $('lock').classList.remove('hidden');
}
async function pinDigit(d) {
  if (pinEntry.length >= 4) return;
  pinEntry += d;
  renderPinDots();
  if (pinEntry.length === 4) {
    const h = await hashPin(pinEntry);
    if (h === localStorage.getItem('ilu_pinhash')) {
      $('lock').classList.add('hidden');
      pinEntry = '';
    } else {
      $('lockMsg').textContent = 'Galat PIN';
      const box = $('pinDots');
      box.classList.remove('shake');
      void box.offsetWidth;
      box.classList.add('shake');
      pinEntry = '';
      setTimeout(renderPinDots, 250);
    }
  }
}
(function buildPad() {
  const pad = $('pinpad');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach(k => {
    const b = document.createElement('button');
    b.textContent = k;
    if (k === '') b.className = 'blank';
    else if (k === '⌫') b.onclick = () => { pinEntry = pinEntry.slice(0, -1); renderPinDots(); };
    else b.onclick = () => pinDigit(k);
    pad.appendChild(b);
  });
})();
$('pinForgot').onclick = () => {
  const code = (prompt('Apna couple code likho (Settings mein milta hai):') || '').trim().toUpperCase();
  if (me && code === me.code) {
    localStorage.removeItem('ilu_lock');
    localStorage.removeItem('ilu_pinhash');
    $('lock').classList.add('hidden');
    toast('Lock hata diya. PIN dobara set kar sakte ho.');
  } else if (code) {
    $('lockMsg').textContent = 'Code galat hai';
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 60000) showLock();
});
function renderLockPanel() {
  const has = !!(data && data.pinHash);
  $('lockStatus').textContent = has ? 'PIN set hai ✓' : 'Abhi PIN set nahi hai';
  const on = lockOn();
  $('lockToggle').textContent = 'Is phone par lock: ' + (on ? 'ON ✓' : 'OFF');
  $('lockToggle').disabled = !has;
}
$('pinSet').onclick = async () => {
  const a = $('pinNew').value, b = $('pinNew2').value;
  $('pinErr').textContent = '';
  if (!/^\d{4}$/.test(a)) { $('pinErr').textContent = '4 ank ka PIN likho.'; return; }
  if (a !== b) { $('pinErr').textContent = 'Dono PIN alag hain.'; return; }
  const h = await hashPin(a);
  await coupleRef().update({ pinHash: h });
  if (lockOn()) localStorage.setItem('ilu_pinhash', h);
  $('pinNew').value = '';
  $('pinNew2').value = '';
  toast('PIN set ho gaya, dono ke liye 🔒');
};
$('lockToggle').onclick = () => {
  if (!data || !data.pinHash) return;
  if (lockOn()) {
    localStorage.removeItem('ilu_lock');
    localStorage.removeItem('ilu_pinhash');
  } else {
    localStorage.setItem('ilu_lock', '1');
    localStorage.setItem('ilu_pinhash', data.pinHash);
  }
  renderLockPanel();
};

/* ---------- Shuruaat ---------- */
if (me) {
  showLock();
  startListening();
} else {
  $('welcome').classList.remove('hidden');
}
