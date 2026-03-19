/*
  ============================================================
  ADMIN.JS — IskoMart Admin Dashboard
  ============================================================
  Sections:
    1. Firebase Init
    2. Admin Auth Guard
    3. Utilities
    4. Navigation
    5. Dashboard Overview
    6. User Management
    7. Product Management
    8. Category Management
    9. Order Management
   10. Announcements
   11. Promotions & Promo Codes
  ============================================================
*/

// ============================================================
// 1. FIREBASE CONFIGURATION
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
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
} catch(e) { console.warn('Firebase init error:', e); }

// ============================================================
// 2. ADMIN AUTH GUARD
// ============================================================
/*
  HOW ADMIN LOGIN WORKS
  ---------------------
  1. Admin logs in normally through login.html (same student account).
  2. Their user record in Firebase must have  role: "admin".
  3. This page reads that field and boots the dashboard if it matches.

  HOW TO GRANT ADMIN ACCESS
  --------------------------
  In Firebase Console → Realtime Database, find:
    /users/{your-user-id}/
  Add a field:  role  =  "admin"  (string)

  Your user ID is shown in your browser's localStorage under
  pup_current → id.  Open DevTools → Application → Local Storage
  to find it.

  FALLBACK
  --------
  If Firebase is unreachable, the page checks localStorage for
  a hardcoded admin email list so you can still get in during
  outages.  Add your email to ADMIN_EMAILS below.
*/

const ADMIN_EMAILS = [
  // Add your PUP email here as a fallback:
  // 'yourname@iskolarngbayan.pup.edu.ph',
];

let adminUser = null;

function initAdminAuth() {
  let user = null;
  try {
    const raw = localStorage.getItem('pup_current');
    if (!raw || raw === 'null') return kickOut('No session found.');
    user = JSON.parse(raw);
    if (!user || !user.id || !user.email) return kickOut('Invalid session.');
  } catch(e) { return kickOut('Session parse error.'); }

  if (!db) {
    // Firebase unreachable — fall back to email whitelist
    if (ADMIN_EMAILS.includes(user.email)) { adminUser = user; bootDashboard(); }
    else kickOut('Firebase unavailable and email not in whitelist.');
    return;
  }

  // Check Firebase for role: "admin"
  db.ref(`users/${user.id}`).once('value')
    .then(snap => {
      const fbUser = snap.val();

      // Accept if Firebase record has role:"admin"
      if (fbUser && fbUser.role === 'admin') {
        adminUser = { ...user, ...fbUser };
        bootDashboard();
        return;
      }

      // Fallback: email whitelist
      if (ADMIN_EMAILS.includes(user.email)) {
        adminUser = user;
        bootDashboard();
        return;
      }

      kickOut('Access denied. Your account does not have admin role.');
    })
    .catch(err => {
      console.warn('Firebase role check failed:', err);
      // Network error — try email whitelist
      if (ADMIN_EMAILS.includes(user.email)) { adminUser = user; bootDashboard(); }
      else kickOut('Could not verify admin role. Check your connection.');
    });
}

function kickOut(reason) {
  console.warn('Admin kickOut:', reason);
  window.location.href = 'login.html';
}

function bootDashboard() {
  const name = `${adminUser.firstName} ${adminUser.lastName}`;
  document.getElementById('adminName').textContent = name;
  const av = document.getElementById('adminAvatar');
  if (adminUser.pfp) av.innerHTML = `<img src="${adminUser.pfp}" alt="">`;
  else av.textContent = initials(name);

  const loader = document.getElementById('adminLoader');
  loader.style.opacity = '0';
  setTimeout(() => { loader.style.display = 'none'; }, 400);
  document.getElementById('adminLayout').style.display = 'flex';

  startClock();
  loadDashboard();
  loadUsers();
  loadProducts();
  loadCategories();
  loadOrders();
  loadPromos();
  loadAnnounceHistory();
}

function adminLogout() {
  localStorage.setItem('pup_current', null);
  window.location.href = 'login.html';
}

// ============================================================
// 3. UTILITIES
// ============================================================
function initials(n) {
  return (n || 'U').split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
}

function showToast(msg) {
  const t = document.getElementById('adminToast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const isToday = d.toDateString() === new Date().toDateString();
  return isToday
    ? d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function getThumb(p) {
  return (p && p.images && p.images.length) ? p.images[0] : (p && p.image ? p.image : 'https://picsum.photos/id/96/600/600');
}

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    document.body.style.overflow = ''; }

function startClock() {
  const el = document.getElementById('topbarTime');
  function tick() {
    el.textContent = new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick(); setInterval(tick, 1000);
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============================================================
// 4. NAVIGATION
// ============================================================
const SECTION_LABELS = {
  dashboard: 'Dashboard', users: 'User Management', products: 'Product Management',
  categories: 'Categories', orders: 'Orders', messages: 'Announcements', promos: 'Promotions'
};

function showSection(name, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const section = document.getElementById('section' + name.charAt(0).toUpperCase() + name.slice(1));
  if (section) section.classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('topbarTitle').textContent = SECTION_LABELS[name] || name;
  document.getElementById('sidebar').classList.remove('open');
}

// ============================================================
// 5. DASHBOARD
// ============================================================
let allUsersData    = {};
let allProductsData = {};
let allOrdersData   = {};

function loadDashboard() {
  db.ref('users').on('value', snap => {
    allUsersData = snap.val() || {};
    document.getElementById('statTotalUsers').textContent = Object.keys(allUsersData).length;
    updateUserBadge();
  });

  db.ref('products').on('value', snap => {
    allProductsData = snap.val() || {};
    const prods = Object.values(allProductsData);
    document.getElementById('statTotalProducts').textContent = prods.length;
    const lowStock = prods.filter(p => p.stock != null && Number(p.stock) < 5);
    const lsEl = document.getElementById('navBadgeLowStock');
    if (lowStock.length) { lsEl.textContent = lowStock.length; lsEl.style.display = 'inline-flex'; }
    else lsEl.style.display = 'none';
    renderDashLowStock(lowStock);
  });

  db.ref('orders').on('value', snap => {
    allOrdersData = snap.val() || {};
    const orders = Object.values(allOrdersData);
    document.getElementById('statTotalOrders').textContent   = orders.length;
    const pending = orders.filter(o => o.status === 'Pending');
    document.getElementById('statPendingOrders').textContent = pending.length;
    const bp = document.getElementById('navBadgePending');
    if (pending.length) { bp.textContent = pending.length; bp.style.display = 'inline-flex'; }
    else bp.style.display = 'none';
    renderDashOrders(orders.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5));
  });
}

function renderDashOrders(orders) {
  const el = document.getElementById('dashRecentOrders');
  if (!orders.length) { el.innerHTML = '<div class="table-empty">No orders yet.<br><small style="color:#94a3b8;">Orders appear here when students check out.</small></div>'; return; }
  el.innerHTML = orders.map(o => `
    <div class="dash-order-item">
      <div class="dash-order-id">#${(o.id || '').slice(-6).toUpperCase()}</div>
      <div class="dash-order-user">${o.userName || '—'}</div>
      <div class="dash-order-total">₱${Number(o.total || 0).toLocaleString()}</div>
      <span class="status-badge status-${(o.status||'pending').toLowerCase()}">${o.status || 'Pending'}</span>
    </div>`).join('');
}

function renderDashLowStock(items) {
  const el = document.getElementById('dashLowStock');
  if (!items.length) { el.innerHTML = '<div class="table-empty">All products have sufficient stock.</div>'; return; }
  el.innerHTML = items.map(p => `
    <div class="low-stock-item">
      <img class="mini-thumb" src="${getThumb(p)}" onerror="this.src='https://picsum.photos/id/96/60/60'">
      <span class="low-stock-name">${p.name}</span>
      <span class="low-stock-count">${Number(p.stock || 0)} left</span>
    </div>`).join('');
}

// ============================================================
// 6. USER MANAGEMENT
// ============================================================
let allUsers = [];

function updateUserBadge() {
  const el = document.getElementById('navBadgeUsers');
  const inactive = Object.values(allUsersData).filter(u => u.active === false).length;
  if (inactive) { el.textContent = inactive + ' inactive'; el.style.display = 'inline-flex'; }
  else el.style.display = 'none';
}

function loadUsers() {
  db.ref('users').on('value', snap => {
    const data = snap.val() || {};
    allUsers = Object.values(data);
    document.getElementById('userCount').textContent = `${allUsers.length} users`;
    renderUsersTable(allUsers);
  });
}

function filterUsers() {
  const term = document.getElementById('userSearch').value.toLowerCase();
  const filtered = allUsers.filter(u => {
    const name = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
    return name.includes(term)
      || (u.email     || '').toLowerCase().includes(term)
      || (u.course    || '').toLowerCase().includes(term)
      || (u.studentId || '').toLowerCase().includes(term);
  });
  renderUsersTable(filtered);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!users.length) { tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No users found.</td></tr>'; return; }
  tbody.innerHTML = users.map(u => {
    const name     = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown';
    const isActive = u.active !== false;
    const isAdmin  = u.role === 'admin';
    return `
      <tr>
        <td>
          <div class="cell-user">
            <div class="mini-avatar">${u.pfp ? `<img src="${u.pfp}" alt="">` : initials(name)}</div>
            <div>
              <div class="cell-name">${name} ${isAdmin ? '<span class="status-badge badge-featured" style="font-size:0.6rem;padding:1px 6px;">admin</span>' : ''}</div>
            </div>
          </div>
        </td>
        <td style="font-size:0.82rem;">${u.email || '—'}</td>
        <td>${u.course || '—'} ${u.section || ''}</td>
        <td>${u.studentId || '—'}</td>
        <td>${u.joined || '—'}</td>
        <td>
          <span class="status-badge ${isActive ? 'status-active' : 'status-inactive'}">
            <i class="fa-solid fa-circle" style="font-size:0.5rem;"></i>
            ${isActive ? 'Active' : 'Inactive'}
          </span>
        </td>
        <td>
          <div class="action-btns">
            ${!isAdmin ? `
              <button class="btn-icon" title="Make Admin" onclick="grantAdmin('${u.id}')">
                <i class="fa-solid fa-shield"></i>
              </button>` : `
              <button class="btn-icon" title="Remove Admin" onclick="revokeAdmin('${u.id}')">
                <i class="fa-solid fa-shield-halved" style="color:var(--maroon);"></i>
              </button>`}
            <button class="btn-icon" title="${isActive ? 'Deactivate' : 'Activate'}" onclick="toggleUserStatus('${u.id}', ${isActive})">
              <i class="fa-solid ${isActive ? 'fa-ban' : 'fa-check'}"></i>
            </button>
            <button class="btn-icon danger" title="Delete User" onclick="confirmDeleteUser('${u.id}', '${name.replace(/'/g, "\\'")}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function grantAdmin(uid) {
  db.ref(`users/${uid}/role`).set('admin')
    .then(() => showToast('Admin role granted.'))
    .catch(() => showToast('Failed to grant admin.'));
}

function revokeAdmin(uid) {
  if (uid === adminUser.id) { showToast("You can't revoke your own admin role."); return; }
  db.ref(`users/${uid}/role`).remove()
    .then(() => showToast('Admin role removed.'))
    .catch(() => showToast('Failed to revoke admin.'));
}

function toggleUserStatus(uid, currentlyActive) {
  db.ref(`users/${uid}/active`).set(!currentlyActive)
    .then(() => showToast(currentlyActive ? 'User deactivated.' : 'User activated.'))
    .catch(() => showToast('Failed to update user.'));
}

function confirmDeleteUser(uid, name) {
  document.getElementById('confirmMsg').textContent = `Delete user "${name}"? They will be removed from the database.`;
  document.getElementById('confirmActionBtn').onclick = () => deleteUser(uid);
  openModal('confirmModal');
}

function deleteUser(uid) {
  db.ref(`users/${uid}`).remove()
    .then(() => { closeModal('confirmModal'); showToast('User deleted.'); })
    .catch(() => showToast('Failed to delete user.'));
}

// ============================================================
// 7. PRODUCT MANAGEMENT
// ============================================================
let allProducts = [];

function loadProducts() {
  db.ref('products').on('value', snap => {
    const data = snap.val() || {};
    allProducts = Object.values(data).sort((a, b) => new Date(b.date) - new Date(a.date));
    renderProductsTable(allProducts);
    renderFeaturedGrid(allProducts);
    populateCatFilter(allProducts);
  });
}

function filterProducts() {
  const term = document.getElementById('productSearch').value.toLowerCase();
  const cat  = document.getElementById('productCatFilter').value;
  let f = allProducts;
  if (cat)  f = f.filter(p => p.category === cat);
  if (term) f = f.filter(p => ((p.name||'') + (p.category||'') + (p.sellerName||'')).toLowerCase().includes(term));
  renderProductsTable(f);
}

function populateCatFilter(prods) {
  const cats = [...new Set(prods.map(p => p.category).filter(Boolean))];
  const sel  = document.getElementById('productCatFilter');
  const cur  = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>' + cats.map(c => `<option ${c===cur?'selected':''}>${c}</option>`).join('');
}

function renderProductsTable(prods) {
  const tbody = document.getElementById('productsTableBody');
  if (!prods.length) { tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No products found.</td></tr>'; return; }
  tbody.innerHTML = prods.map(p => {
    const stock    = p.stock != null ? Number(p.stock) : '—';
    const lowStock = typeof stock === 'number' && stock < 5;
    const badges   = [
      p.featured ? '<span class="status-badge badge-featured"><i class="fa-solid fa-star"></i> Featured</span>' : '',
      p.onSale   ? '<span class="status-badge badge-sale"><i class="fa-solid fa-tag"></i> On Sale</span>' : '',
      lowStock   ? '<span class="status-badge badge-lowstock"><i class="fa-solid fa-triangle-exclamation"></i> Low Stock</span>' : ''
    ].filter(Boolean).join('');
    return `
      <tr>
        <td>
          <div class="cell-product">
            <img class="mini-thumb" src="${getThumb(p)}" onerror="this.src='https://picsum.photos/id/96/60/60'">
            <div>
              <div class="cell-name">${p.name}</div>
              <div class="cell-sub">${fmtDate(p.date)}</div>
            </div>
          </div>
        </td>
        <td>${p.category || '—'}</td>
        <td>
          ₱${Number(p.price).toLocaleString()}
          ${p.onSale && p.salePrice ? `<br><span style="color:var(--danger);font-size:0.72rem;font-weight:700;">Sale: ₱${Number(p.salePrice).toLocaleString()}</span>` : ''}
        </td>
        <td><span style="color:${lowStock?'var(--danger)':'var(--text)'};font-weight:${lowStock?'700':'400'};">${stock}</span></td>
        <td>${p.sellerName || p.seller || '—'}</td>
        <td><div class="badges-cell">${badges || '<span style="color:var(--muted);font-size:0.75rem;">—</span>'}</div></td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="Edit" onclick="openEditProductModal('${p.id}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn-icon" title="${p.featured?'Unfeature':'Feature'}" onclick="toggleFeatured('${p.id}', ${!!p.featured})">
              <i class="fa-solid fa-star" style="color:${p.featured?'#f59e0b':'inherit'};"></i>
            </button>
            <button class="btn-icon danger" title="Delete" onclick="confirmDeleteProduct('${p.id}', '${p.name.replace(/'/g,"\\'")}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function toggleFeatured(pid, currentlyFeatured) {
  db.ref(`products/${pid}/featured`).set(!currentlyFeatured)
    .then(() => showToast(currentlyFeatured ? 'Removed from featured.' : 'Marked as featured!'))
    .catch(() => showToast('Failed to update.'));
}

function confirmDeleteProduct(pid, name) {
  document.getElementById('confirmMsg').textContent = `Delete product "${name}"? This cannot be undone.`;
  document.getElementById('confirmActionBtn').onclick = () => deleteProduct(pid);
  openModal('confirmModal');
}

function deleteProduct(pid) {
  db.ref(`products/${pid}`).remove()
    .then(() => { closeModal('confirmModal'); showToast('Product deleted.'); })
    .catch(() => showToast('Failed to delete product.'));
}

function openAddProductModal() {
  document.getElementById('productModalTitle').textContent = 'Add Product';
  document.getElementById('editProductId').value = '';
  ['pName','pPrice','pStock','pDesc','pImage','pSalePrice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pCat').value       = '';
  document.getElementById('pCondition').value = 'Brand New';
  document.getElementById('pFeatured').checked = false;
  document.getElementById('pOnSale').checked   = false;
  document.getElementById('salePriceGroup').style.display = 'none';
  openModal('productModal');
}

function openEditProductModal(pid) {
  const p = allProducts.find(x => x.id === pid); if (!p) return;
  document.getElementById('productModalTitle').textContent = 'Edit Product';
  document.getElementById('editProductId').value = pid;
  document.getElementById('pName').value       = p.name      || '';
  document.getElementById('pCat').value        = p.category  || '';
  document.getElementById('pCondition').value  = p.condition || 'Brand New';
  document.getElementById('pPrice').value      = p.price     || '';
  document.getElementById('pStock').value      = p.stock != null ? p.stock : '';
  document.getElementById('pDesc').value       = p.desc      || '';
  document.getElementById('pImage').value      = p.image     || '';
  document.getElementById('pFeatured').checked = !!p.featured;
  document.getElementById('pOnSale').checked   = !!p.onSale;
  document.getElementById('pSalePrice').value  = p.salePrice || '';
  document.getElementById('salePriceGroup').style.display = p.onSale ? 'block' : 'none';
  openModal('productModal');
}

function toggleSalePrice() {
  document.getElementById('salePriceGroup').style.display =
    document.getElementById('pOnSale').checked ? 'block' : 'none';
}

function saveProduct() {
  const pid      = document.getElementById('editProductId').value;
  const name     = document.getElementById('pName').value.trim();
  const cat      = document.getElementById('pCat').value;
  const cond     = document.getElementById('pCondition').value;
  const price    = document.getElementById('pPrice').value;
  const stock    = document.getElementById('pStock').value;
  const desc     = document.getElementById('pDesc').value.trim();
  const imageUrl = document.getElementById('pImage').value.trim();
  const featured = document.getElementById('pFeatured').checked;
  const onSale   = document.getElementById('pOnSale').checked;
  const salePrice= document.getElementById('pSalePrice').value;

  if (!name || !cat || !price) return showToast('Fill in all required fields.');
  if (isNaN(price) || Number(price) <= 0) return showToast('Enter a valid price.');

  const data = {
    name, category: cat, condition: cond,
    price: Number(price),
    stock: stock !== '' ? Number(stock) : null,
    desc, featured, onSale,
    salePrice: onSale && salePrice ? Number(salePrice) : null,
  };
  if (imageUrl) { data.image = imageUrl; data.images = [imageUrl]; }

  if (pid) {
    db.ref(`products/${pid}`).update(data)
      .then(() => { closeModal('productModal'); showToast('Product updated!'); })
      .catch(() => showToast('Failed to update product.'));
  } else {
    const newId    = 'p' + Date.now();
    const fallback = 'https://picsum.photos/id/100/600/600';
    if (!imageUrl) { data.image = fallback; data.images = [fallback]; }
    db.ref(`products/${newId}`).set({
      id: newId, ...data,
      seller: 'Admin',
      sellerName: `${adminUser.firstName} ${adminUser.lastName}`,
      sellerId: adminUser.id,
      date: new Date().toISOString(), ratings: []
    }).then(() => { closeModal('productModal'); showToast('Product added!'); })
      .catch(() => showToast('Failed to add product.'));
  }
}

// ============================================================
// 8. CATEGORY MANAGEMENT
// ============================================================
let allCategories = {};
const DEFAULT_CATS = [
  { id:'cat_books',     name:'Books',     icon:'fa-book' },
  { id:'cat_gadgets',   name:'Gadgets',   icon:'fa-mobile-screen' },
  { id:'cat_uniforms',  name:'Uniforms',  icon:'fa-shirt' },
  { id:'cat_food',      name:'Food',      icon:'fa-utensils' },
  { id:'cat_notes',     name:'Notes',     icon:'fa-note-sticky' },
  { id:'cat_furniture', name:'Furniture', icon:'fa-couch' },
  { id:'cat_other',     name:'Other',     icon:'fa-box' },
];

function loadCategories() {
  db.ref('categories').once('value', snap => {
    if (!snap.exists()) {
      const obj = {}; DEFAULT_CATS.forEach(c => { obj[c.id] = c; }); db.ref('categories').set(obj);
    }
  });
  db.ref('categories').on('value', snap => {
    allCategories = snap.val() || {};
    renderCatsGrid();
  });
}

function renderCatsGrid() {
  const grid = document.getElementById('catsGrid');
  const cats = Object.values(allCategories);
  if (!cats.length) { grid.innerHTML = '<div class="table-empty">No categories yet.</div>'; return; }
  grid.innerHTML = cats.map(c => {
    const count = Object.values(allProductsData).filter(p => p.category === c.name).length;
    return `
      <div class="cat-card">
        <div class="cat-icon-wrap"><i class="fa-solid ${c.icon || 'fa-tag'}"></i></div>
        <div class="cat-name">${c.name}</div>
        <div class="cat-count">${count} product${count !== 1 ? 's' : ''}</div>
        <div class="cat-actions">
          <button class="btn-icon" onclick="openEditCatModal('${c.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-icon danger" onclick="confirmDeleteCat('${c.id}', '${c.name.replace(/'/g,"\\'")}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');
}

function openAddCatModal() {
  document.getElementById('catModalTitle').textContent = 'Add Category';
  document.getElementById('editCatId').value  = '';
  document.getElementById('catName').value    = '';
  document.getElementById('catIcon').value    = '';
  openModal('catModal');
}

function openEditCatModal(id) {
  const cat = allCategories[id]; if (!cat) return;
  document.getElementById('catModalTitle').textContent = 'Edit Category';
  document.getElementById('editCatId').value = id;
  document.getElementById('catName').value   = cat.name || '';
  document.getElementById('catIcon').value   = cat.icon || '';
  openModal('catModal');
}

function saveCat() {
  const id   = document.getElementById('editCatId').value;
  const name = document.getElementById('catName').value.trim();
  const icon = document.getElementById('catIcon').value.trim() || 'fa-tag';
  if (!name) return showToast('Category name is required.');
  const catId = id || 'cat_' + name.toLowerCase().replace(/\s+/g,'_') + '_' + Date.now();
  db.ref(`categories/${catId}`).set({ id: catId, name, icon })
    .then(() => { closeModal('catModal'); showToast(id ? 'Category updated!' : 'Category added!'); })
    .catch(() => showToast('Failed to save category.'));
}

function confirmDeleteCat(id, name) {
  document.getElementById('confirmMsg').textContent = `Delete category "${name}"? Products won't be affected.`;
  document.getElementById('confirmActionBtn').onclick = () => deleteCat(id);
  openModal('confirmModal');
}

function deleteCat(id) {
  db.ref(`categories/${id}`).remove()
    .then(() => { closeModal('confirmModal'); showToast('Category deleted.'); })
    .catch(() => showToast('Failed to delete category.'));
}

// ============================================================
// 9. ORDER MANAGEMENT
// ============================================================
let allOrders = [];

function loadOrders() {
  db.ref('orders').on('value', snap => {
    const data = snap.val() || {};
    allOrders = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
    renderOrdersTable(allOrders);
  });
}

function filterOrders() {
  const term   = document.getElementById('orderSearch').value.toLowerCase();
  const status = document.getElementById('orderStatusFilter').value;
  let f = allOrders;
  if (status) f = f.filter(o => o.status === status);
  if (term)   f = f.filter(o =>
    (o.userName  || '').toLowerCase().includes(term) ||
    (o.userEmail || '').toLowerCase().includes(term) ||
    (o.id        || '').toLowerCase().includes(term)
  );
  renderOrdersTable(f);
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!orders.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty">No orders found.<br>
      <small style="color:#94a3b8;">Orders appear here when students check out in IskoMart.</small></td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const statusClass = (o.status || 'pending').toLowerCase().replace(' ','');
    const shortId     = (o.id || 'N/A').slice(-8).toUpperCase();
    const itemCount   = o.items ? o.items.length : (o.count || 0);
    return `
      <tr>
        <td><span style="font-family:'Sora',sans-serif;font-weight:700;font-size:0.78rem;color:var(--maroon);">#${shortId}</span></td>
        <td>
          <div class="cell-name">${o.userName  || '—'}</div>
          <div class="cell-sub">${o.userEmail || ''}</div>
        </td>
        <td>${itemCount} item${itemCount !== 1 ? 's' : ''}</td>
        <td style="font-weight:700;">₱${Number(o.total || 0).toLocaleString()}</td>
        <td>${fmtDate(o.timestamp)}</td>
        <td><span class="status-badge status-${statusClass}">${o.status || 'Pending'}</span></td>
        <td>
          <div class="action-btns">
            <button class="btn-icon" title="View Details" onclick="openOrderDetail('${o.id}')">
              <i class="fa-solid fa-eye"></i>
            </button>
            <select class="status-select" onchange="updateOrderStatus('${o.id}', this.value)">
              ${['Pending','Processing','Completed','Cancelled'].map(s =>
                `<option ${s === o.status ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function updateOrderStatus(orderId, newStatus) {
  db.ref(`orders/${orderId}/status`).set(newStatus)
    .then(() => showToast(`Order marked as ${newStatus}.`))
    .catch(() => showToast('Failed to update order status.'));
}

function openOrderDetail(orderId) {
  const o = allOrders.find(x => x.id === orderId); if (!o) return;
  const items   = o.items || [];
  const shortId = (o.id || '').slice(-8).toUpperCase();
  document.getElementById('orderDetailBody').innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:4px;">Order ID</div>
      <div style="font-family:'Sora',sans-serif;font-weight:800;color:var(--maroon);">#${shortId}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div>
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:2px;">Student</div>
        <div style="font-weight:600;">${o.userName || '—'}</div>
        <div style="font-size:0.78rem;color:var(--muted);">${o.userEmail || ''}</div>
      </div>
      <div>
        <div style="font-size:0.72rem;color:var(--muted);margin-bottom:2px;">Date</div>
        <div style="font-weight:600;">${fmtDate(o.timestamp)}</div>
      </div>
    </div>
    <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">Items</div>
    ${items.length ? items.map(item => `
      <div class="order-detail-item">
        <img class="order-detail-img" src="${getThumb(item)}" onerror="this.src='https://picsum.photos/id/96/80/80'">
        <div class="order-detail-name">${item.name}</div>
        <div class="order-detail-price">₱${Number(item.price || 0).toLocaleString()}</div>
      </div>`).join('') : '<div class="table-empty">No item details.</div>'}
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:2px solid var(--border);">
      <span style="font-weight:700;">Total</span>
      <span style="font-family:'Sora',sans-serif;font-weight:800;font-size:1.2rem;color:var(--maroon);">₱${Number(o.total || 0).toLocaleString()}</span>
    </div>
    <div style="margin-top:16px;">
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:6px;">Update Status</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${['Pending','Processing','Completed','Cancelled'].map(s => `
          <button class="btn-primary btn-sm" style="background:${s===o.status?'var(--maroon)':'#94a3b8'};"
            onclick="updateOrderStatus('${o.id}','${s}');closeModal('orderModal');showToast('Order marked as ${s}.');">
            ${s}
          </button>`).join('')}
      </div>
    </div>`;
  openModal('orderModal');
}

// ============================================================
// 10. ANNOUNCEMENTS
// ============================================================
function loadAnnounceHistory() {
  db.ref('announcements').on('value', snap => {
    const data = snap.val() || {};
    const list = Object.values(data).sort((a, b) => b.timestamp - a.timestamp);
    renderAnnounceHistory(list);
  });
}

function renderAnnounceHistory(list) {
  const el = document.getElementById('announceHistory');
  if (!list.length) { el.innerHTML = '<div class="table-empty">No announcements sent yet.</div>'; return; }
  el.innerHTML = list.map(a => `
    <div class="announce-item">
      <div class="announce-icon"><i class="fa-solid ${a.icon || 'fa-bullhorn'}"></i></div>
      <div>
        <div class="announce-title">${a.title}</div>
        <div class="announce-body">${a.body}</div>
        <div class="announce-time">${fmtTime(a.timestamp)} — Sent to ${a.sentTo || 0} users</div>
      </div>
    </div>`).join('');
}

async function sendAnnouncement() {
  const title    = document.getElementById('announceTitle').value.trim();
  const body     = document.getElementById('announceBody').value.trim();
  const icon     = document.getElementById('announceIcon').value;
  const resultEl = document.getElementById('announceResult');

  if (!title || !body) return showToast('Please fill in title and message.');

  resultEl.innerHTML = '<span style="color:var(--muted);font-size:0.85rem;"><i class="fa-solid fa-circle-notch fa-spin"></i> Sending...</span>';

  const snap  = await db.ref('users').once('value');
  const users = snap.val() || {};
  const uids  = Object.keys(users);
  const ts    = Date.now();

  const notifPayload = {
    type:'announcement', icon, iconColor:'var(--maroon)',
    title, body, timestamp:ts, read:false
  };

  const writes = uids.map(uid => db.ref(`notifications/${uid}`).push(notifPayload));
  await Promise.all(writes);
  await db.ref('announcements').push({ title, body, icon, timestamp:ts, sentTo:uids.length });

  document.getElementById('announceTitle').value = '';
  document.getElementById('announceBody').value  = '';
  resultEl.innerHTML = `<span style="color:var(--success);font-size:0.85rem;"><i class="fa-solid fa-check"></i> Sent to ${uids.length} students!</span>`;
  showToast(`Announcement sent to ${uids.length} users!`);
}

// ============================================================
// 11. PROMOTIONS
// ============================================================
let allPromos = {};

function loadPromos() {
  db.ref('promoCodes').on('value', snap => {
    allPromos = snap.val() || {};
    renderPromoCodesList();
  });
}

function renderPromoCodesList() {
  const el    = document.getElementById('promoCodesList');
  const codes = Object.values(allPromos);
  if (!codes.length) { el.innerHTML = '<div class="table-empty">No promo codes yet.</div>'; return; }
  el.innerHTML = codes.map(c => `
    <div class="promo-item">
      <span class="promo-code-badge">${c.code}</span>
      <div class="promo-info">
        <div class="promo-discount">${c.type === 'percent' ? c.discount + '% off' : '₱' + c.discount + ' off'}</div>
        <div class="promo-uses">${c.uses || 0} uses · ${c.active ? 'Active' : 'Inactive'}</div>
      </div>
      <button class="btn-icon" title="${c.active ? 'Deactivate' : 'Activate'}" onclick="togglePromo('${c.code}', ${!!c.active})">
        <i class="fa-solid ${c.active ? 'fa-pause' : 'fa-play'}"></i>
      </button>
      <button class="btn-icon danger" title="Delete" onclick="deletePromo('${c.code}')">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>`).join('');
}

function createPromoCode() {
  const code     = document.getElementById('promoCode').value.trim().toUpperCase();
  const discount = document.getElementById('promoDiscount').value;
  const type     = document.getElementById('promoType').value;
  if (!code || !discount) return showToast('Fill in all promo fields.');
  if (isNaN(discount) || Number(discount) <= 0) return showToast('Enter a valid discount value.');
  db.ref(`promoCodes/${code}`).set({ code, discount:Number(discount), type, active:true, uses:0, created:Date.now() })
    .then(() => { document.getElementById('promoCode').value = ''; document.getElementById('promoDiscount').value = ''; showToast(`Promo code "${code}" created!`); })
    .catch(() => showToast('Failed to create promo code.'));
}

function togglePromo(code, currentlyActive) {
  db.ref(`promoCodes/${code}/active`).set(!currentlyActive)
    .then(() => showToast(currentlyActive ? 'Promo paused.' : 'Promo activated.'));
}

function deletePromo(code) {
  db.ref(`promoCodes/${code}`).remove()
    .then(() => showToast(`Promo code "${code}" deleted.`))
    .catch(() => showToast('Failed to delete promo.'));
}

function renderFeaturedGrid(prods) {
  const grid = document.getElementById('featuredProductsGrid');
  if (!prods.length) { grid.innerHTML = '<div class="table-empty">No products yet.</div>'; return; }
  grid.innerHTML = prods.map(p => `
    <div class="feature-card">
      <img class="feature-img" src="${getThumb(p)}" onerror="this.src='https://picsum.photos/id/96/300/200'">
      <div class="feature-body">
        <div class="feature-name" title="${p.name}">${p.name}</div>
        <div class="feature-price">₱${Number(p.price).toLocaleString()}</div>
        <div class="feature-toggle">
          <span style="font-size:0.72rem;">Featured</span>
          <label class="toggle-switch">
            <input type="checkbox" ${p.featured ? 'checked' : ''} onchange="toggleFeatured('${p.id}', ${!!p.featured})">
            <span class="toggle-track"></span>
          </label>
        </div>
      </div>
    </div>`).join('');
}

// ============================================================
// BOOT
// ============================================================
initAdminAuth();
