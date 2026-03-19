// IskoMart — market.js (full build)

// ============================================================
// FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey:            "AIzaSyBpAv4OxE_7zXl-aBD2b2x6Sh9PdWkmYL4",
  authDomain:        "pup-e-market.firebaseapp.com",
  databaseURL:       "https://pup-e-market-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "pup-e-market",
  storageBucket:     "pup-e-market.firebasestorage.app",
  messagingSenderId: "512111380104",
  appId:             "1:512111380104:web:dcdfb681816553b421413d"
};
let db = null;
try { firebase.initializeApp(firebaseConfig); db = firebase.database(); }
catch(e) { console.warn('Firebase init error:', e); }

// ============================================================
// SESSION GUARD
// ============================================================
function getValidSession() {
  try {
    const raw = localStorage.getItem('pup_current');
    if (!raw || raw === 'null') return null;
    const stored = JSON.parse(raw);
    if (!stored || !stored.id || !stored.email) { localStorage.removeItem('pup_current'); return null; }
    const us = JSON.parse(localStorage.getItem('pup_users') || '[]');
    const found = us.find(u => u.id === stored.id);
    if (!found) { localStorage.removeItem('pup_current'); return null; }
    return found;
  } catch(e) { localStorage.removeItem('pup_current'); return null; }
}
let cu = getValidSession();
if (!cu) window.location.href = 'login.html';

// ============================================================
// STATE
// ============================================================
let users               = JSON.parse(localStorage.getItem('pup_users') || '[]');
let products            = [];
let cart                = cu ? (cu.cart || []) : [];
let activeCategory      = 'All';
let toDeleteId          = null;
let activeView          = 'home';
let uploadedPhotos      = [];
let uploadedPfp         = null;
let uploadedReviewPhoto = null;
let reviewRating        = 0;
let currentProductId    = null;
let currentProduct      = null;
let currentCarouselIdx  = 0;
let activeChatRef       = null;
let currentChatMeta     = null;
let inboxRef            = null;
let notifRef            = null;
let searchTab           = 'products';
const inboxCache        = new Map();

// ============================================================
// SEED PRODUCTS
// ============================================================
const SEED_PRODUCTS = [
  { id:'p1', name:'Engineering Mechanics (Hibbeler)', price:450, image:'https://picsum.photos/id/1015/600/600', seller:'CE 3A', sellerName:'Maria Santos', sellerId:null, desc:'Brand new, never used.', category:'Books', condition:'Brand New', ratings:[], date:'2024-01-01' },
  { id:'p2', name:'iPhone 11 64GB', price:8500, image:'https://picsum.photos/id/20/600/600', seller:'ECE 2B', sellerName:'Rico Delos Reyes', sellerId:null, desc:'99% battery health. Comes with charger.', category:'Gadgets', condition:'Good', ratings:[], date:'2024-01-02' },
  { id:'p3', name:'PUP Uniform Polo (Medium)', price:250, image:'https://picsum.photos/id/201/600/600', seller:'BSIT 1C', sellerName:'Anna Cruz', sellerId:null, desc:'Used only 1 semester. Very clean.', category:'Uniforms', condition:'Like New', ratings:[], date:'2024-01-03' },
  { id:'p4', name:'Casio fx-991ES Calculator', price:650, image:'https://picsum.photos/id/180/600/600', seller:'EE 4D', sellerName:'Ben Reyes', sellerId:null, desc:'Original, working perfectly.', category:'Gadgets', condition:'Good', ratings:[], date:'2024-01-04' },
  { id:'p5', name:'Organic Chemistry Textbook', price:380, image:'https://picsum.photos/id/160/600/600', seller:'CHE 2B', sellerName:'Lara Gomez', sellerId:null, desc:'Complete, no missing pages.', category:'Books', condition:'Good', ratings:[], date:'2024-01-05' },
  { id:'p6', name:'Study Table (Foldable)', price:700, image:'https://picsum.photos/id/116/600/600', seller:'BSIE 3A', sellerName:'Carlo Tan', sellerId:null, desc:'Sturdy foldable study table.', category:'Furniture', condition:'Good', ratings:[], date:'2024-01-06' },
];

function listenToProducts() {
  if (!db) { products = SEED_PRODUCTS; renderCats(); renderProducts(products); return; }
  const ref = db.ref('products');
  ref.once('value', snap => {
    if (!snap.exists()) { const obj = {}; SEED_PRODUCTS.forEach(p => { obj[p.id] = p; }); ref.set(obj); }
  });
  ref.on('value', snap => {
    const data = snap.val();
    products = data ? Object.values(data).map(p => ({ ratings:[], ...p })).sort((a,b) => new Date(b.date)-new Date(a.date)) : [];
    filterProducts();
    if (activeView === 'profile') renderProfile();
  });
}

function listenToUsers() {
  if (!db) return;
  db.ref('users').on('value', snap => {
    const data = snap.val();
    if (!data) return;
    const firebaseUsers = Object.values(data);
    const localUsers    = JSON.parse(localStorage.getItem('pup_users') || '[]');
    const merged = [...firebaseUsers];
    localUsers.forEach(lu => { if (!merged.find(u => u.id === lu.id)) merged.push(lu); });
    users = merged;
  });
}

// ============================================================
// UTILITIES
// ============================================================
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
function initials(n) { return (n||'U').split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase(); }
function getThumb(p) { return (p.images && p.images.length) ? p.images[0] : (p.image || 'https://picsum.photos/id/96/600/600'); }

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
function openModal(id)  { document.getElementById(id).classList.remove('hidden-overlay'); document.body.style.overflow = 'hidden'; }
function closeModal(id) {
  if (id === 'chatModal') closeChatCleanup();
  document.getElementById(id).classList.add('hidden-overlay');
  document.body.style.overflow = '';
}
function handleModalClick(e, id) { if (e.target === document.getElementById(id)) closeModal(id); }
function fmtTime(ts) {
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday ? d.toLocaleTimeString('en-PH', { hour:'2-digit', minute:'2-digit' }) : d.toLocaleDateString('en-PH', { month:'short', day:'numeric' });
}

// ============================================================
// RATINGS HELPERS
// ============================================================
function getAvgRating(p) {
  if (!p.ratings || !p.ratings.length) return 0;
  return p.ratings.reduce((a,r) => a + r.rating, 0) / p.ratings.length;
}
function renderStarIcons(rating) {
  const r = Math.round(rating * 2) / 2; let h = '';
  for (let i = 1; i <= 5; i++) {
    if (i <= r) h += '<i class="fa-solid fa-star"></i>';
    else if (i-0.5===r) h += '<i class="fa-solid fa-star-half-stroke"></i>';
    else h += '<i class="fa-regular fa-star"></i>';
  }
  return h;
}
function avatarHtml(name, pfp, cls='seller-avatar') {
  return pfp ? `<div class="${cls}"><img src="${pfp}" alt="${name}"></div>` : `<div class="${cls}">${initials(name)}</div>`;
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function showView(v) {
  activeView = v;
  document.getElementById('homeView').classList.toggle('active', v==='home');
  document.getElementById('profileView').classList.toggle('active', v==='profile');
  ['bnHome','bnProfile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', (id==='bnHome'&&v==='home')||(id==='bnProfile'&&v==='profile'));
  });
  if (document.getElementById('dnHome'))    document.getElementById('dnHome').classList.toggle('active', v==='home');
  if (document.getElementById('dnProfile')) document.getElementById('dnProfile').classList.toggle('active', v==='profile');
  if (v==='profile') renderProfile();
}
function focusSearch() { showView('home'); document.getElementById('searchInput').focus(); }

// ============================================================
// CATEGORIES
// ============================================================
const CATS = ['All','Books','Gadgets','Uniforms','Food','Notes','Furniture','Other'];
function renderCats() {
  const c = document.getElementById('catsList'); c.innerHTML = '';
  CATS.forEach(cat => {
    const d = document.createElement('div');
    d.className = 'cat-chip' + (cat===activeCategory?' active':'');
    d.textContent = cat;
    d.onclick = () => { activeCategory = cat; renderCats(); filterProducts(); };
    c.appendChild(d);
  });
}

// ============================================================
// PRODUCTS
// ============================================================
function renderProducts(prods) {
  const g = document.getElementById('productGrid');
  const e = document.getElementById('noResults');
  g.innerHTML = '';
  if (!prods.length) { e.style.display='block'; return; }
  e.style.display = 'none';
  prods.forEach(p => {
    const avg = getAvgRating(p), count = p.ratings ? p.ratings.length : 0;
    const thumb = getThumb(p);
    const hasMultiple = p.images && p.images.length > 1;
    const starsHtml = count > 0
      ? `<div class="product-stars"><span class="stars">${renderStarIcons(avg)}</span><span class="rating-count">(${count})</span></div>`
      : `<div class="product-stars"><span class="rating-count" style="color:#d1d5db;">No reviews yet</span></div>`;
    const d = document.createElement('div');
    d.className = 'product-card';
    d.innerHTML = `
      <div class="product-img-wrap">
        <img class="product-img" src="${thumb}" alt="${p.name}" onerror="this.src='https://picsum.photos/id/96/600/600'">
        ${hasMultiple ? `<span class="product-photo-count"><i class="fa-solid fa-images"></i> ${p.images.length}</span>` : ''}
      </div>
      <div class="product-body">
        <div class="product-name">${p.name}</div>
        <div class="product-price">&#8369;${Number(p.price).toLocaleString()}</div>
        <div class="product-seller">${p.sellerName||p.seller}</div>
        ${starsHtml}
        <span class="product-cat-tag">${p.category||''}</span>
      </div>`;
    d.onclick = () => openProductModal(p);
    g.appendChild(d);
  });
}

function filterProducts() {
  const term         = document.getElementById('searchInput').value.toLowerCase();
  const searchTabsEl = document.getElementById('searchTabs');
  const peopleEl     = document.getElementById('peopleResults');
  const gridEl       = document.getElementById('productGrid');
  const noResultsEl  = document.getElementById('noResults');
  if (searchTabsEl) searchTabsEl.style.display = term ? 'flex' : 'none';
  if (term && searchTab === 'people') {
    if (gridEl)      gridEl.style.display      = 'none';
    if (noResultsEl) noResultsEl.style.display = 'none';
    if (peopleEl)    { peopleEl.style.display  = 'block'; renderPeopleResults(term); }
    return;
  }
  if (peopleEl) peopleEl.style.display = 'none';
  if (gridEl)   gridEl.style.display   = 'grid';
  let f = products;
  if (activeCategory !== 'All') f = f.filter(p => p.category === activeCategory);
  if (term) f = f.filter(p => (p.name+(p.sellerName||'')+(p.category||'')+(p.desc||'')).toLowerCase().includes(term));
  renderProducts(f);
}

// ============================================================
// PEOPLE SEARCH
// ============================================================
function setSearchTab(tab) {
  searchTab = tab;
  document.querySelectorAll('.search-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('st' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
  filterProducts();
}

function renderPeopleResults(term) {
  const container = document.getElementById('peopleResults');
  const t = term.toLowerCase();
  const results = users.filter(u => {
    if (u.id === cu.id) return false;
    const full = `${u.firstName} ${u.lastName}`.toLowerCase();
    return full.includes(t) || (u.email||'').toLowerCase().includes(t) || (u.course||'').toLowerCase().includes(t) || (u.studentId||'').toLowerCase().includes(t) || (u.section||'').toLowerCase().includes(t);
  });
  if (!results.length) { container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-users-slash"></i><p>No students found for "${term}".</p></div>`; return; }
  container.innerHTML = results.map(u => {
    const name = `${u.firstName} ${u.lastName}`;
    const listingCount = products.filter(p => p.sellerId === u.id).length;
    return `
      <div class="people-card" onclick="openPublicProfile('${u.id}')">
        ${avatarHtml(name, u.pfp || null, 'people-avatar')}
        <div class="people-info">
          <div class="people-name">${name}</div>
          <div class="people-meta">${u.course||''} ${u.section||''} ${u.studentId ? '&middot; '+u.studentId : ''}</div>
        </div>
        <div class="people-listing-count">
          <span>${listingCount}</span>
          <small>listing${listingCount !== 1 ? 's' : ''}</small>
        </div>
      </div>`;
  }).join('');
}

document.getElementById('searchInput').addEventListener('input', filterProducts);

// ============================================================
// PUBLIC PROFILE — with Firebase fallback fix
// ============================================================
function openPublicProfile(userId) {
  const local = users.find(x => x.id === userId);
  if (local) { _renderPublicProfile(local); return; }
  if (!db) { showToast('User not found.'); return; }
  db.ref(`users/${userId}`).once('value', snap => {
    const u = snap.val();
    if (!u) { showToast('User not found.'); return; }
    users.push(u);
    _renderPublicProfile(u);
  });
}

function _renderPublicProfile(u) {
  const name         = `${u.firstName} ${u.lastName}`;
  const userProducts = products.filter(p => p.sellerId === u.id);
  const allRatings   = userProducts.flatMap(p => p.ratings || []);
  const avgRating    = allRatings.length ? (allRatings.reduce((s,r) => s + r.rating, 0) / allRatings.length).toFixed(1) : null;
  const modal        = document.getElementById('publicProfileModal');
  const avEl         = modal.querySelector('#ppAvatar');
  if (u.pfp) { avEl.innerHTML = `<img src="${u.pfp}" alt="${name}">`; }
  else       { avEl.innerHTML = `<span>${initials(name)}</span>`; }
  modal.querySelector('#ppName').textContent   = name;
  modal.querySelector('#ppCourse').textContent = `${u.course||''} ${u.section||''}`.trim();
  modal.querySelector('#ppJoined').textContent = u.joined ? `Member since ${u.joined}` : '';
  modal.querySelector('#ppStatListings').textContent = userProducts.length;
  modal.querySelector('#ppStatRating').textContent   = avgRating ? `${avgRating} \u2605` : '\u2014';
  const grid = modal.querySelector('#ppListingsGrid');
  grid.innerHTML = '';
  if (!userProducts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;padding:32px 0;"><i class="fa-solid fa-box-open"></i><p>No listings yet.</p></div>`;
  } else {
    userProducts.forEach(p => {
      const d = document.createElement('div'); d.className = 'product-card';
      d.innerHTML = `
        <div class="product-img-wrap">
          <img class="product-img" src="${getThumb(p)}" alt="${p.name}" onerror="this.src='https://picsum.photos/id/96/600/600'">
        </div>
        <div class="product-body">
          <div class="product-name">${p.name}</div>
          <div class="product-price">&#8369;${Number(p.price).toLocaleString()}</div>
          <span class="product-cat-tag">${p.category||''}</span>
        </div>`;
      d.onclick = () => { closeModal('publicProfileModal'); setTimeout(() => openProductModal(p), 200); };
      grid.appendChild(d);
    });
  }
  const chatBtn = modal.querySelector('#ppChatBtn');
  if (u.id === cu.id) {
    chatBtn.style.display = 'none';
  } else {
    chatBtn.style.display = 'flex';
    chatBtn.onclick = () => {
      const listing = userProducts[0];
      if (!listing) { showToast('This user has no listings to chat about.'); return; }
      closeModal('publicProfileModal');
      setTimeout(() => openProductModal(listing), 200);
    };
  }
  openModal('publicProfileModal');
}

// ============================================================
// PRODUCT DETAIL MODAL + CAROUSEL
// ============================================================
function openProductModal(p) {
  currentProductId = p.id; currentProduct = p; currentCarouselIdx = 0;
  const photos = (p.images && p.images.length) ? p.images : [p.image || 'https://picsum.photos/id/96/600/600'];
  document.getElementById('mTitle').textContent = p.name;
  document.getElementById('mPrice').textContent = `\u20b1${Number(p.price).toLocaleString()}`;
  document.getElementById('mDesc').textContent  = p.desc || 'No description.';
  renderCarousel(photos);
  const sn = p.sellerName || p.seller;
  const su = users.find(u => u.id === p.sellerId);
  const clickable = p.sellerId && p.sellerId !== cu.id;
  document.getElementById('mSellerBox').innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex:1;${clickable?'cursor:pointer;':''}"
         ${clickable ? `onclick="closeModal('productModal');setTimeout(()=>openPublicProfile('${p.sellerId}'),200)"` : ''}>
      ${avatarHtml(sn, su?.pfp||null, 'seller-avatar')}
      <div>
        <div style="font-weight:700;font-size:0.9rem;">${sn}
          ${clickable ? `<span style="font-size:0.7rem;color:var(--maroon);font-weight:600;margin-left:4px;">View profile &rarr;</span>` : ''}
        </div>
        <div style="font-size:0.75rem;color:var(--muted);">${p.seller}${p.condition?' &bull; '+p.condition:''}</div>
      </div>
    </div>`;
  document.getElementById('mCatTag').innerHTML = p.category ? `<span style="background:var(--bg);padding:3px 10px;border-radius:50px;font-size:0.75rem;font-weight:600;color:var(--muted);">${p.category}</span>` : '';
  const isOwner = cu && p.sellerId === cu.id;
  const inCart  = cart.find(x => x.id === p.id);
  document.getElementById('mActions').innerHTML = isOwner
    ? `<button class="btn btn-danger" style="flex:1;" onclick="openDeleteConfirm('${p.id}')"><i class="fa-solid fa-trash"></i> Remove Listing</button>`
    : `<button class="btn btn-primary" style="flex:1;" onclick="addToCart('${p.id}')" ${inCart?'disabled style="opacity:0.6;cursor:default;"':''}>
         <i class="fa-solid fa-cart-plus"></i> ${inCart?'In Cart':'Add to Cart'}
       </button>
       <button class="btn btn-outline" style="flex:1;" onclick="openChat(currentProduct)">
         <i class="fa-solid fa-comment"></i> Chat
       </button>`;
  renderReviews(p);
  openModal('productModal');
}

function renderCarousel(photos) {
  const wrap = document.getElementById('mCarousel');
  if (!wrap) return;
  if (photos.length === 1) {
    wrap.innerHTML = `<img class="detail-img" src="${photos[0]}" alt="" onerror="this.src='https://picsum.photos/id/96/600/600'">`;
    return;
  }
  wrap.innerHTML = `
    <div class="carousel-track-wrap">
      <div class="carousel-track" id="carouselTrack">
        ${photos.map((src,i) => `<img class="carousel-slide" src="${src}" alt="Photo ${i+1}" onerror="this.src='https://picsum.photos/id/96/600/600'">`).join('')}
      </div>
      <button class="carousel-btn carousel-prev" onclick="carouselNav(-1)"><i class="fa-solid fa-chevron-left"></i></button>
      <button class="carousel-btn carousel-next" onclick="carouselNav(1)"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
    <div class="carousel-dots" id="carouselDots">
      ${photos.map((_,i) => `<span class="carousel-dot${i===0?' active':''}" onclick="carouselGoto(${i})"></span>`).join('')}
    </div>`;
  carouselGoto(0);
}
function carouselNav(dir) {
  const photos = (currentProduct && currentProduct.images && currentProduct.images.length) ? currentProduct.images : [currentProduct.image];
  carouselGoto((currentCarouselIdx + dir + photos.length) % photos.length);
}
function carouselGoto(idx) {
  currentCarouselIdx = idx;
  const track = document.getElementById('carouselTrack');
  if (track) track.style.transform = `translateX(-${idx * 100}%)`;
  document.querySelectorAll('.carousel-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
}

// ============================================================
// RATINGS & REVIEWS
// ============================================================
function renderReviews(p) {
  const wrap    = document.getElementById('mReviews');
  const ratings = p.ratings || [];
  const avg = getAvgRating(p), count = ratings.length;
  const alreadyReviewed = cu && ratings.find(r => r.userId === cu.id);
  const isOwner   = cu && p.sellerId === cu.id;
  const canReview = cu && !isOwner && !alreadyReviewed;
  const summaryHtml = count > 0 ? `
    <div class="rating-summary">
      <div>
        <div class="rating-big-num">${avg.toFixed(1)}</div>
        <div class="rating-big-stars">${renderStarIcons(avg)}</div>
        <div class="rating-big-count">${count} review${count!==1?'s':''}</div>
      </div>
    </div>` : '';
  const cardsHtml = ratings.map(r => {
    const ru   = users.find(u => u.id === r.userId);
    const date = r.date ? new Date(r.date).toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'}) : '';
    return `
      <div class="review-card">
        <div class="review-header">
          ${avatarHtml(r.userName, ru?.pfp||null, 'review-avatar')}
          <div><div class="review-name">${r.userName}</div><div class="review-date">${date}</div></div>
          <div class="review-stars">${renderStarIcons(r.rating)}</div>
        </div>
        ${r.comment ? `<div class="review-comment">${r.comment}</div>` : ''}
        ${r.photo   ? `<img src="${r.photo}" class="review-photo-img" onclick="this.style.maxHeight=this.style.maxHeight?'':'none'">` : ''}
      </div>`;
  }).join('');
  const formHtml = canReview ? `
    <div class="review-form-wrap">
      <div class="review-form-title">Leave a Review</div>
      <div class="star-picker" id="starPicker">
        <i class="fa-regular fa-star" onclick="selectStar(1)"></i>
        <i class="fa-regular fa-star" onclick="selectStar(2)"></i>
        <i class="fa-regular fa-star" onclick="selectStar(3)"></i>
        <i class="fa-regular fa-star" onclick="selectStar(4)"></i>
        <i class="fa-regular fa-star" onclick="selectStar(5)"></i>
      </div>
      <textarea id="reviewComment" placeholder="Share your experience with this item (optional)..."></textarea>
      <div class="review-photo-row">
        <label class="review-photo-label" onclick="document.getElementById('reviewPhotoInput').click()">
          <i class="fa-solid fa-camera"></i> <span id="reviewPhotoLbl">Add Photo</span>
        </label>
        <input type="file" id="reviewPhotoInput" accept="image/*" onchange="handleReviewPhoto(event)" style="display:none">
        <img id="reviewPhotoPreview" class="review-photo-preview" style="display:none">
      </div>
      <button class="btn btn-primary" style="width:100%;margin-top:10px;" onclick="submitReview()">
        <i class="fa-solid fa-star"></i> Submit Review
      </button>
    </div>` : (alreadyReviewed ? `<p style="font-size:0.82rem;color:var(--muted);text-align:center;padding:8px 0;">You have already reviewed this product.</p>` : '');
  const noHtml = (count===0 && !canReview) ? `<p style="font-size:0.84rem;color:var(--muted);text-align:center;padding:8px 0;">No reviews yet.</p>` : '';
  wrap.innerHTML = `<div class="reviews-title"><i class="fa-solid fa-star" style="color:#f59e0b;"></i> Ratings & Reviews</div>${summaryHtml}${cardsHtml}${noHtml}${formHtml}`;
  reviewRating = 0; uploadedReviewPhoto = null;
}
function selectStar(val) {
  reviewRating = val;
  document.querySelectorAll('#starPicker i').forEach((s,i) => { s.className = i < val ? 'fa-solid fa-star active' : 'fa-regular fa-star'; });
}
function handleReviewPhoto(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    uploadedReviewPhoto = ev.target.result;
    const prev = document.getElementById('reviewPhotoPreview');
    if (prev) { prev.src = uploadedReviewPhoto; prev.style.display = 'block'; }
    const lbl = document.getElementById('reviewPhotoLbl');
    if (lbl) lbl.textContent = 'Photo Added';
  };
  r.readAsDataURL(file);
}
function submitReview() {
  if (!reviewRating) return showToast('Please select a star rating.');
  if (!db)           return showToast('Not connected to database.');
  const comment = document.getElementById('reviewComment').value.trim();
  const p = products.find(x => x.id === currentProductId); if (!p) return;
  const updated = [...(p.ratings||[]), { userId:cu.id, userName:`${cu.firstName} ${cu.lastName}`, rating:reviewRating, comment, photo:uploadedReviewPhoto||null, date:new Date().toISOString() }];
  db.ref(`products/${currentProductId}/ratings`).set(updated)
    .then(() => { showToast('Review submitted!'); uploadedReviewPhoto = null; })
    .catch(err => { console.error('Review error:', err); showToast('Failed to submit review.'); });
}

// ============================================================
// CART
// ============================================================
function addToCart(id) {
  const p = products.find(x => x.id===id); if (!p) return;
  if (cart.find(x => x.id===id)) { showToast('Already in cart!'); return; }
  cart.push({...p}); saveCart(); updateCartBadge();
  closeModal('productModal'); showToast('Added to cart!');
}
function saveCart() {
  cu.cart = cart;
  const idx = users.findIndex(u => u.id===cu.id);
  if (idx!==-1) { users[idx].cart = cart; save('pup_users', users); }
  save('pup_current', cu);
}
function updateCartBadge() {
  const b = document.getElementById('cartBadge');
  b.textContent = cart.length; b.style.display = cart.length>0?'flex':'none';
}
function openCart() {
  renderCartSidebar();
  document.getElementById('cartSidebar').classList.add('open');
  document.getElementById('cartBackdrop').classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeCart() {
  document.getElementById('cartSidebar').classList.remove('open');
  document.getElementById('cartBackdrop').classList.remove('show');
  document.body.style.overflow = '';
}
function renderCartSidebar() {
  const list = document.getElementById('cartItemsList');
  if (!cart.length) { list.innerHTML = '<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Your cart is empty.</p></div>'; document.getElementById('cartTotalAmt').textContent = '\u20b10'; return; }
  let total = 0;
  list.innerHTML = cart.map(p => {
    total += Number(p.price);
    return `
      <div class="cart-item">
        <img class="cart-item-img" src="${getThumb(p)}" onerror="this.src='https://picsum.photos/id/96/400/400'">
        <div class="cart-item-info">
          <div class="cart-item-name">${p.name}</div>
          <div class="cart-item-price">\u20b1${Number(p.price).toLocaleString()}</div>
          <div style="font-size:0.72rem;color:var(--muted);">${p.sellerName||p.seller}</div>
        </div>
        <div class="cart-item-remove" onclick="removeFromCart('${p.id}')"><i class="fa-solid fa-trash-can"></i></div>
      </div>`;
  }).join('');
  document.getElementById('cartTotalAmt').textContent = `\u20b1${total.toLocaleString()}`;
}
function removeFromCart(id) {
  cart = cart.filter(p => p.id!==id); saveCart(); updateCartBadge();
  renderCartSidebar(); if (activeView==='profile') renderProfile();
}

// ============================================================
// CHECKOUT
// ============================================================
function openCheckout() {
  if (!cart.length) { showToast('Your cart is empty.'); return; }
  let total = 0;
  document.getElementById('checkoutItemsList').innerHTML = cart.map(p => {
    total += Number(p.price);
    return `
      <div class="checkout-item">
        <img class="checkout-item-img" src="${getThumb(p)}" onerror="this.src='https://picsum.photos/id/96/300/300'">
        <div class="checkout-item-name">${p.name}<br><span style="font-size:0.72rem;color:var(--muted);font-weight:400;">${p.sellerName||p.seller}</span></div>
        <div class="checkout-item-price">\u20b1${Number(p.price).toLocaleString()}</div>
      </div>`;
  }).join('');
  document.getElementById('checkoutTotal').textContent = `\u20b1${total.toLocaleString()}`;
  closeCart();
  setTimeout(() => openModal('checkoutModal'), 200);
}

function confirmOrder() {
  const total   = cart.reduce((s,p) => s+Number(p.price), 0);
  const count   = cart.length;
  const ts      = Date.now();
  const orderId = 'ord_' + ts + '_' + cu.id.slice(-4);
  if (db) {
    db.ref(`orders/${orderId}`).set({
      id: orderId, userId: cu.id,
      userName:   `${cu.firstName} ${cu.lastName}`,
      userEmail:  cu.email,
      userCourse: cu.course,
      studentId:  cu.studentId || null,
      items: cart.map(p => ({ id:p.id, name:p.name, price:p.price, image:p.image||null, images:p.images||null, seller:p.sellerName||p.seller })),
      total, count, status:'Pending', pickup:'PUP Main Campus', timestamp:ts
    }).catch(err => console.warn('Order save failed:', err));
    db.ref(`notifications/${cu.id}`).push({
      type:'order', icon:'fa-bag-shopping', iconColor:'#10b981',
      title:'Order Placed!',
      body:`${count} item${count!==1?'s':''} - Pick up at PUP Main Campus`,
      timestamp:ts, read:false
    });
  }
  cart = []; saveCart(); updateCartBadge();
  closeModal('checkoutModal');
  if (activeView==='profile') renderProfile();
  showToast('Order placed! Pick up at PUP Main Campus.');
}

// ============================================================
// SELL MODAL
// ============================================================
function openSellModal() {
  document.getElementById('sellName').value   = '';
  document.getElementById('sellCat').value    = '';
  document.getElementById('sellPrice').value  = '';
  document.getElementById('sellDesc').value   = '';
  document.getElementById('photoInput').value = '';
  uploadedPhotos = []; renderPhotoGrid(); openModal('sellModal');
}
function handlePhoto(e) {
  const slots = 5 - uploadedPhotos.length; if (slots <= 0) return;
  Array.from(e.target.files).slice(0, slots).forEach(file => {
    const r = new FileReader();
    r.onload = ev => { uploadedPhotos.push(ev.target.result); renderPhotoGrid(); };
    r.readAsDataURL(file);
  });
  e.target.value = '';
}
function renderPhotoGrid() {
  const grid = document.getElementById('photoGrid'), upload = document.getElementById('photoUpload'), counter = document.getElementById('photoCounter');
  grid.innerHTML = uploadedPhotos.map((src,i) => `
    <div class="photo-thumb-wrap">
      <img src="${src}" class="photo-thumb" alt="Photo ${i+1}">
      ${i===0 ? '<span class="photo-thumb-badge">Main</span>' : ''}
      <button class="photo-thumb-remove" onclick="removePhoto(${i})"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
  const remaining = 5 - uploadedPhotos.length;
  upload.style.display  = remaining > 0 ? 'block' : 'none';
  counter.textContent   = `${uploadedPhotos.length}/5 photos`;
  counter.style.display = uploadedPhotos.length > 0 ? 'block' : 'none';
  const hint = upload.querySelector('p');
  if (hint) hint.textContent = uploadedPhotos.length === 0 ? 'Tap to upload photos (up to 5)' : `Add more photos (${remaining} left)`;
}
function removePhoto(idx) { uploadedPhotos.splice(idx, 1); renderPhotoGrid(); }
function submitListing() {
  if (!cu.studentId || !cu.studentId.trim()) return showToast('Add your Student ID in Edit Profile first to post listings.');
  const name  = document.getElementById('sellName').value.trim();
  const cat   = document.getElementById('sellCat').value;
  const price = document.getElementById('sellPrice').value;
  const desc  = document.getElementById('sellDesc').value.trim();
  const cond  = document.getElementById('sellCondition').value;
  if (!name||!cat||!price) return showToast('Fill in all required fields.');
  if (isNaN(price)||Number(price)<=0) return showToast('Enter a valid price.');
  if (!db) return showToast('Not connected to database.');
  const fallbacks = ['https://picsum.photos/id/100/600/600','https://picsum.photos/id/130/600/600','https://picsum.photos/id/145/600/600'];
  const images = uploadedPhotos.length ? [...uploadedPhotos] : [fallbacks[Math.floor(Math.random()*fallbacks.length)]];
  const id = 'p' + Date.now();
  db.ref(`products/${id}`).set({
    id, name, category:cat, price:Number(price), desc, condition:cond,
    images, image:images[0],
    seller:`${cu.course} ${cu.section}`, sellerName:`${cu.firstName} ${cu.lastName}`,
    sellerId:cu.id, date:new Date().toISOString(), ratings:[]
  }).then(() => { uploadedPhotos=[]; renderPhotoGrid(); closeModal('sellModal'); showToast('Listing posted! Everyone can see it now.'); })
    .catch(err => { console.error('Listing error:', err); showToast('Failed to post listing.'); });
}

// ============================================================
// DELETE LISTING
// ============================================================
function openDeleteConfirm(id) { toDeleteId=id; closeModal('productModal'); setTimeout(()=>openModal('deleteModal'),200); }
function confirmDelete() {
  if (!db) return showToast('Not connected.');
  db.ref(`products/${toDeleteId}`).remove()
    .then(() => { closeModal('deleteModal'); showToast('Listing removed.'); if(activeView==='profile') renderProfile(); })
    .catch(err => { console.error('Delete error:', err); showToast('Failed to remove listing.'); });
}

// ============================================================
// PROFILE
// ============================================================
function renderProfile() {
  const name = `${cu.firstName} ${cu.lastName}`;
  const myL  = products.filter(p => p.sellerId===cu.id);
  const pAv  = document.getElementById('pAvatar');
  if (cu.pfp) { pAv.innerHTML = `<img src="${cu.pfp}" alt="${name}">`; } else { pAv.textContent = initials(name); }
  document.getElementById('pName').textContent        = name;
  document.getElementById('pCourse').textContent      = `${cu.course} ${cu.section} - ${cu.email}`;
  document.getElementById('statListings').textContent  = myL.length;
  document.getElementById('statCart').textContent      = cart.length;
  document.getElementById('statSold').textContent      = 0;
  document.getElementById('infoEmail').textContent     = cu.email;
  document.getElementById('infoCourse').textContent    = cu.course;
  document.getElementById('infoSection').textContent   = cu.section;
  document.getElementById('infoStudentId').textContent = cu.studentId || '--';
  document.getElementById('infoJoined').textContent    = cu.joined || 'Recently';
  const lg = document.getElementById('myListingsGrid'), nl = document.getElementById('noListings');
  if (!myL.length) { lg.innerHTML=''; nl.style.display='block'; } else { nl.style.display='none'; lg.innerHTML=''; buildProductCards(myL, lg, true, false); }
  const cg = document.getElementById('cartGrid'), nc = document.getElementById('noCartProfile');
  if (!cart.length) { cg.innerHTML=''; nc.style.display='block'; } else { nc.style.display='none'; cg.innerHTML=''; buildProductCards(cart, cg, false, true); }
}
function buildProductCards(prods, container, showDelete, showRemove) {
  prods.forEach(p => {
    const d = document.createElement('div'); d.className='product-card';
    let btn = '';
    if (showDelete) btn = `<button class="btn btn-danger" style="width:100%;margin-top:8px;padding:8px;font-size:0.75rem;" onclick="event.stopPropagation();openDeleteConfirm('${p.id}')"><i class="fa-solid fa-trash"></i> Remove</button>`;
    if (showRemove) btn = `<button class="btn btn-ghost" style="width:100%;margin-top:8px;padding:8px;font-size:0.75rem;" onclick="event.stopPropagation();removeFromCart('${p.id}')"><i class="fa-solid fa-trash-can"></i> Remove</button>`;
    d.innerHTML = `<div class="product-img-wrap"><img class="product-img" src="${getThumb(p)}" onerror="this.src='https://picsum.photos/id/96/600/600'"></div><div class="product-body"><div class="product-name">${p.name}</div><div class="product-price">\u20b1${Number(p.price).toLocaleString()}</div>${btn}</div>`;
    d.onclick = () => openProductModal(p); container.appendChild(d);
  });
}
function switchTab(tab, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab'+tab.charAt(0).toUpperCase()+tab.slice(1)).classList.add('active');
  el.classList.add('active');
}

// ============================================================
// EDIT PROFILE
// ============================================================
function openEditModal() {
  document.getElementById('eFirst').value     = cu.firstName;
  document.getElementById('eLast').value      = cu.lastName;
  document.getElementById('eCourse').value    = cu.course;
  document.getElementById('eSection').value   = cu.section;
  document.getElementById('eStudentId').value = cu.studentId || '';
  const circle = document.getElementById('editPfpPreview');
  if (circle) { if (cu.pfp) { circle.innerHTML = `<img src="${cu.pfp}" alt="profile">`; } else { circle.textContent = initials(`${cu.firstName} ${cu.lastName}`); } }
  uploadedPfp = null; openModal('editModal');
}
function handlePfp(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => { uploadedPfp = ev.target.result; const circle = document.getElementById('editPfpPreview'); if (circle) circle.innerHTML = `<img src="${uploadedPfp}" alt="preview">`; };
  r.readAsDataURL(file);
}
function saveProfile() {
  const first     = document.getElementById('eFirst').value.trim();
  const last      = document.getElementById('eLast').value.trim();
  const course    = document.getElementById('eCourse').value;
  const section   = document.getElementById('eSection').value.trim();
  const studentId = document.getElementById('eStudentId').value.trim();
  if (!first||!last||!section) return showToast('Fill in all fields.');
  cu.firstName=first; cu.lastName=last; cu.course=course; cu.section=section; cu.studentId=studentId;
  if (uploadedPfp) cu.pfp = uploadedPfp;
  const idx = users.findIndex(u => u.id===cu.id);
  if (idx!==-1) users[idx]=cu;
  save('pup_users', users); save('pup_current', cu);
  if (db) { db.ref(`users/${cu.id}`).update({ firstName:cu.firstName, lastName:cu.lastName, course:cu.course, section:cu.section, studentId:cu.studentId, pfp:cu.pfp||null }).catch(err => console.warn('Firebase profile update failed:', err)); }
  updateHeaderAvatar(); closeModal('editModal'); renderProfile(); showToast('Profile updated!');
}
function updateHeaderAvatar() {
  const av = document.getElementById('headerAvatar');
  if (cu.pfp) { av.innerHTML=`<img src="${cu.pfp}" alt="avatar">`; } else { av.textContent=initials(`${cu.firstName} ${cu.lastName}`); }
}

// ============================================================
// CHAT
// ============================================================
function getChatId(a, b, pid) { return [...[a,b].sort(), pid].join('_'); }
function openChat(p) {
  if (!db)                { showToast('Not connected.'); return; }
  if (!p.sellerId)        { showToast('Seller has no account linked.'); return; }
  if (p.sellerId===cu.id) { showToast("That's your own listing!"); return; }
  const chatId     = getChatId(cu.id, p.sellerId, p.id);
  const myName     = `${cu.firstName} ${cu.lastName}`;
  const su         = users.find(u => u.id===p.sellerId);
  const sellerName = p.sellerName || (su ? `${su.firstName} ${su.lastName}` : 'Seller');
  currentChatMeta  = { chatId, productId:p.id, productName:p.name, productImage:getThumb(p), myId:cu.id, myName, otherId:p.sellerId, otherName:sellerName };
  db.ref(`userChats/${cu.id}/${chatId}/lastOpened`).set(Date.now());
  _openChatUI(chatId, p.name, getThumb(p), `\u20b1${Number(p.price).toLocaleString()}`);
  closeModal('productModal');
  setTimeout(() => openModal('chatModal'), 200);
}
function openChatFromInbox(chatId) {
  if (!db) { showToast('Not connected.'); return; }
  const meta = inboxCache.get(chatId);
  if (!meta) { showToast('Could not open conversation.'); return; }
  currentChatMeta = meta;
  db.ref(`userChats/${cu.id}/${meta.chatId}/lastOpened`).set(Date.now());
  _openChatUI(meta.chatId, meta.productName, meta.productImage, '');
  closeModal('inboxModal');
  setTimeout(() => openModal('chatModal'), 200);
}
function _openChatUI(chatId, productName, productImage, priceLabel) {
  document.getElementById('chatProductStrip').innerHTML = `
    <img src="${productImage}" onerror="this.src='https://picsum.photos/id/96/100/100'" style="width:38px;height:38px;border-radius:8px;object-fit:cover;flex-shrink:0;">
    <div style="min-width:0;">
      <div style="font-weight:700;font-size:0.82rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${productName}</div>
      ${priceLabel?`<div style="font-size:0.72rem;color:var(--orange);font-weight:700;">${priceLabel}</div>`:''}
    </div>`;
  const msgBox = document.getElementById('chatMessages');
  msgBox.innerHTML = '<div class="chat-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Connecting...</div>';
  document.getElementById('chatInput').value = '';
  if (activeChatRef) activeChatRef.off();
  const ref = db.ref(`chats/${chatId}/messages`);
  activeChatRef = ref;
  ref.on('value', snap => {
    const data = snap.val();
    if (!data) { msgBox.innerHTML = `<div class="chat-empty-state"><i class="fa-regular fa-comments"></i><p>No messages yet.<br>Say hi to start the conversation!</p></div>`; return; }
    const messages = Object.values(data).sort((a,b) => a.timestamp - b.timestamp);
    msgBox.innerHTML = messages.map((m, idx) => {
      const isMine = m.senderId === cu.id;
      const prev = messages[idx-1], next = messages[idx+1];
      const GROUP_MS = 5*60*1000;
      const groupedWithPrev = prev && prev.senderId===m.senderId && (m.timestamp-prev.timestamp)<GROUP_MS;
      const groupedWithNext = next && next.senderId===m.senderId && (next.timestamp-m.timestamp)<GROUP_MS;
      let bubbleExtra = '';
      if (groupedWithPrev && groupedWithNext) bubbleExtra = ' bubble-mid';
      else if (groupedWithPrev)              bubbleExtra = ' bubble-last';
      else if (groupedWithNext)              bubbleExtra = ' bubble-first';
      return `
        <div class="chat-msg-row ${isMine?'mine':'theirs'}${groupedWithPrev?' grouped':''}">
          ${!isMine ? `<div class="chat-bubble-avatar${groupedWithPrev?' invisible':''}">${!groupedWithPrev?initials(m.senderName):''}</div>` : ''}
          <div class="chat-bubble-wrap">
            ${!isMine && !groupedWithPrev ? `<div class="chat-sender-name">${m.senderName}</div>` : ''}
            <div class="chat-bubble ${isMine?'bubble-mine':'bubble-theirs'}${bubbleExtra}">${m.text}</div>
            ${!groupedWithNext ? `<div class="chat-time">${fmtTime(m.timestamp)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    msgBox.scrollTop = msgBox.scrollHeight;
  });
}
function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;
  if (!activeChatRef)  { showToast('Chat not ready. Try reopening.'); return; }
  if (!currentChatMeta){ showToast('Chat not ready. Try reopening.'); return; }
  input.value = '';
  const ts = Date.now(), meta = currentChatMeta;
  activeChatRef.push({ text, senderId:meta.myId, senderName:meta.myName, timestamp:ts })
    .then(() => {
      db.ref(`userChats/${meta.myId}/${meta.chatId}`).set({ chatId:meta.chatId, productId:meta.productId, productName:meta.productName, productImage:meta.productImage, otherUserId:meta.otherId, otherUserName:meta.otherName, lastMsg:text, lastTimestamp:ts, lastOpened:ts });
      db.ref(`userChats/${meta.otherId}/${meta.chatId}`).update({ chatId:meta.chatId, productId:meta.productId, productName:meta.productName, productImage:meta.productImage, otherUserId:meta.myId, otherUserName:meta.myName, lastMsg:text, lastTimestamp:ts });
      createNotification(meta.otherId, { type:'message', icon:'fa-comment-dots', iconColor:'var(--maroon)', title:meta.myName, body:text.length>60?text.slice(0,60)+'...':text, subtext:`Re: ${meta.productName}`, fromId:meta.myId, chatId:meta.chatId, productId:meta.productId, productName:meta.productName, productImage:meta.productImage, timestamp:ts, read:false });
    })
    .catch(err => { console.error('sendMessage error:', err); showToast('Message failed: ' + err.message); });
}
function closeChatCleanup() {
  if (activeChatRef) { activeChatRef.off(); activeChatRef = null; }
  currentChatMeta = null;
}

// ============================================================
// INBOX
// ============================================================
function listenToInbox() {
  if (!db) return;
  inboxRef = db.ref(`userChats/${cu.id}`);
  inboxRef.on('value', snap => {
    const data = snap.val(); if (!data) { updateInboxBadge(0); return; }
    const unread = Object.values(data).filter(c => c.lastTimestamp && (!c.lastOpened || c.lastTimestamp > c.lastOpened)).length;
    updateInboxBadge(unread);
  });
}
function updateInboxBadge(n) { const b = document.getElementById('inboxBadge'); if (!b) return; b.textContent = n>9?'9+':n; b.style.display = n>0?'flex':'none'; }
function openInbox() { openModal('inboxModal'); renderInbox(); }
function renderInbox() {
  if (!db) { document.getElementById('inboxList').innerHTML = '<div class="inbox-empty"><i class="fa-solid fa-wifi"></i><p>Not connected.</p></div>'; return; }
  db.ref(`userChats/${cu.id}`).once('value', snap => {
    const data = snap.val(), list = document.getElementById('inboxList');
    if (!data) { list.innerHTML = `<div class="inbox-empty"><i class="fa-regular fa-comments"></i><p>No conversations yet.<br>Click "Chat" on any listing.</p></div>`; return; }
    const chats = Object.values(data).filter(c=>c.lastTimestamp).sort((a,b)=>b.lastTimestamp-a.lastTimestamp);
    if (!chats.length) { list.innerHTML = `<div class="inbox-empty"><i class="fa-regular fa-comments"></i><p>No conversations yet.</p></div>`; return; }
    inboxCache.clear();
    chats.forEach(c => { inboxCache.set(c.chatId, { chatId:c.chatId, productId:c.productId||'', productName:c.productName||'Listing', productImage:c.productImage||'', myId:cu.id, myName:`${cu.firstName} ${cu.lastName}`, otherId:c.otherUserId, otherName:c.otherUserName||'User' }); });
    list.innerHTML = chats.map(c => {
      const unread = !c.lastOpened || c.lastTimestamp > c.lastOpened;
      return `
        <div class="inbox-item ${unread?'unread':''}" onclick="openChatFromInbox('${c.chatId}')">
          <img class="inbox-product-img" src="${c.productImage||''}" onerror="this.src='https://picsum.photos/id/96/100/100'" alt="">
          <div class="inbox-item-body">
            <div class="inbox-other-name">${c.otherUserName||'User'}</div>
            <div class="inbox-product-name">Re: ${c.productName||'a listing'}</div>
            <div class="inbox-last-msg">${c.lastMsg||''}</div>
          </div>
          <div class="inbox-item-meta">
            <div class="inbox-time">${fmtTime(c.lastTimestamp)}</div>
            <div class="inbox-unread-dot"></div>
          </div>
        </div>`;
    }).join('');
  });
}

// ============================================================
// NOTIFICATIONS
// ============================================================
function createNotification(userId, data) { if (!db) return; db.ref(`notifications/${userId}`).push(data).catch(err => console.error('createNotification error:', err)); }
function listenToNotifications() {
  if (!db) return;
  notifRef = db.ref(`notifications/${cu.id}`);
  notifRef.on('value', snap => { const data = snap.val(); if (!data) { updateNotifBadge(0); return; } updateNotifBadge(Object.values(data).filter(n => !n.read).length); });
}
function updateNotifBadge(n) { const b = document.getElementById('notifBadge'); if (!b) return; b.textContent = n>9?'9+':n; b.style.display = n>0?'flex':'none'; }
function openNotifications() { openModal('notifModal'); renderNotifications(); }
function renderNotifications() {
  if (!db) { document.getElementById('notifList').innerHTML = '<div class="notif-empty"><i class="fa-solid fa-wifi"></i><p>Not connected.</p></div>'; return; }
  db.ref(`notifications/${cu.id}`).once('value', snap => {
    const data = snap.val(), list = document.getElementById('notifList');
    if (!data) { list.innerHTML = `<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>No notifications yet.</p></div>`; return; }
    const notifs = Object.entries(data).map(([k,v]) => ({...v, _key:k})).sort((a,b) => b.timestamp-a.timestamp);
    window._notifMap = Object.fromEntries(notifs.map(n => [n._key, n]));
    list.innerHTML = notifs.map(n => {
      const iconColor = n.iconColor || (n.type==='message'?'var(--maroon)':n.type==='order'?'#10b981':'#6366f1');
      return `
        <div class="notif-item ${n.read?'':'unread'}" data-key="${n._key}" onclick="handleNotifClick('${n._key}')" style="background:${n.read?'transparent':'rgba(128,0,0,0.04)'}">
          <div class="notif-icon-wrap" style="background:${iconColor}15;color:${iconColor}"><i class="fa-solid ${n.icon||'fa-bell'}"></i></div>
          <div class="notif-body">
            <div class="notif-title">${n.title}</div>
            ${n.body    ? `<div class="notif-text">${n.body}</div>`       : ''}
            ${n.subtext ? `<div class="notif-subtext">${n.subtext}</div>` : ''}
            <div class="notif-time">${fmtTime(n.timestamp)}</div>
          </div>
          ${n.productImage ? `<img src="${n.productImage}" class="notif-thumb" onerror="this.style.display='none'">` : ''}
          ${!n.read ? `<div class="notif-dot"></div>` : ''}
        </div>`;
    }).join('');
  });
}
function handleNotifClick(key) {
  const notif = window._notifMap?.[key]; if (!notif) return;
  db.ref(`notifications/${cu.id}/${key}/read`).set(true);
  const el = document.querySelector(`[data-key="${key}"]`);
  if (el) { el.classList.remove('unread'); el.style.background = 'transparent'; const dot = el.querySelector('.notif-dot'); if (dot) dot.remove(); }
  if (notif.type === 'message' && notif.chatId) {
    closeModal('notifModal');
    currentChatMeta = { chatId:notif.chatId, productId:notif.productId||'', productName:notif.productName||'Listing', productImage:notif.productImage||'', myId:cu.id, myName:`${cu.firstName} ${cu.lastName}`, otherId:notif.fromId, otherName:notif.title };
    db.ref(`userChats/${cu.id}/${notif.chatId}/lastOpened`).set(Date.now());
    _openChatUI(notif.chatId, notif.productName||'Listing', notif.productImage||'', '');
    setTimeout(() => openModal('chatModal'), 200);
  }
  setTimeout(renderNotifications, 300);
}
function markAllNotifsRead() {
  if (!db) return;
  db.ref(`notifications/${cu.id}`).once('value', snap => {
    const data = snap.val(); if (!data) return;
    const updates = {}; Object.keys(data).forEach(k => { updates[`${k}/read`] = true; });
    db.ref(`notifications/${cu.id}`).update(updates);
    updateNotifBadge(0); renderNotifications();
  });
}

// ============================================================
// LOGOUT + FLASH TIMER
// ============================================================
function logout() { save('pup_current', null); window.location.href='login.html'; }

let secs = 2 * 3600;
setInterval(() => {
  secs--; if (secs<0) return;
  const el = document.getElementById('flashTimer');
  if (el) el.textContent = `${Math.floor(secs/3600)}h ${String(Math.floor((secs%3600)/60)).padStart(2,'0')}m`;
}, 1000);

// ============================================================
// INIT
// ============================================================
updateHeaderAvatar();
updateCartBadge();
renderCats();
listenToUsers();
listenToProducts();
listenToInbox();
listenToNotifications();
