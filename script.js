const firebaseConfig = {
  apiKey: "AIzaSyCzWj6i1N2a9CNTit2acENaXfqBRlYRpLo",
  authDomain: "ilu-app-3e2f8.firebaseapp.com",
  projectId: "ilu-app-3e2f8",
  storageBucket: "ilu-app-3e2f8.firebasestorage.app",
  messagingSenderId: "738719127887",
  appId: "1:738719127887:web:a47714d50550aa78c04d3a"
};

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
let unsubDoc = null, unsubMsgs = null, unsubLive = null, unsubList = null;

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
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
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

/* ---------- Firebase se live sunna ---------- */
function stopListening() {
  if (unsubDoc) unsubDoc();
  if (unsubMsgs) unsubMsgs();
  if (unsubLive) unsubLive();
  if (unsubList) unsubList();
  unsubDoc = unsubMsgs = unsubLive = unsubList = null;
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
  if (code.length !== 6) { $('joinErr').textContent = '6 akshar ka code likho.'; return; }
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

/* ---------- Shuruaat ---------- */
if (me) {
  startListening();
} else {
  $('welcome').classList.remove('hidden');
}
