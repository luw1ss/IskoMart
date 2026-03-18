/*
  ============================================================
  REGISTER.JS — Logic for the Register Page
  ============================================================
  Handles:
    - Auto-redirect if already logged in
    - 3-step wizard navigation
    - Live input validation
    - Password strength meter
    - Account creation — saved to localStorage AND Firebase
  ============================================================
*/

/* Same session check as login.js — skip register if already logged in */
function getValidSession() {
  try {
    const raw = localStorage.getItem('pup_current');
    if (!raw || raw === 'null') return null;
    const cu = JSON.parse(raw);
    if (!cu || !cu.id || !cu.email) { localStorage.removeItem('pup_current'); return null; }
    const users = JSON.parse(localStorage.getItem('pup_users') || '[]');
    const found = users.find(u => u.id === cu.id);
    if (!found) { localStorage.removeItem('pup_current'); return null; }
    return found;
  } catch (e) { localStorage.removeItem('pup_current'); return null; }
}
if (getValidSession()) window.location.href = 'market.html';

/* Tracks which step the user is currently on (1, 2, or 3) */
let currentStep = 1;

/*
  goStep(n) — moves the wizard to step n
  ----------------------------------------
  Validates the current step before going forward.
  Steps: 1 → personal info, 2 → academic info, 3 → password
*/
function goStep(n) {
  if (n > currentStep) {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
  }

  document.getElementById('errorMsg').style.display = 'none';
  document.getElementById('step' + currentStep).classList.remove('active');
  currentStep = n;
  document.getElementById('step' + n).classList.add('active');
  updateProgress();
}

/*
  updateProgress() — updates the 3 progress bar colors
  done = already passed, active = current, plain = not reached
*/
function updateProgress() {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('prog' + i);
    el.className = 'prog-step' + (
      i < currentStep   ? ' done'   :
      i === currentStep ? ' active' :
      ''
    );
  }
}

/*
  validateStep1() — checks name fields before moving to step 2
*/
function validateStep1() {
  const first = document.getElementById('firstName').value.trim();
  const last  = document.getElementById('lastName').value.trim();
  if (!first || first.length < 2) { showError('Please enter your first name (at least 2 characters).'); return false; }
  if (!last  || last.length  < 2) { showError('Please enter your last name (at least 2 characters).');  return false; }
  return true;
}

/*
  validateStep2() — checks email, course, section before moving to step 3
*/
function validateStep2() {
  const email   = document.getElementById('email').value.trim();
  const course  = document.getElementById('course').value;
  const section = document.getElementById('section').value.trim();

  if (!email) { showError('Please enter your email address.'); return false; }
  if (!email.endsWith('@iskolarngbayan.pup.edu.ph')) { showError('Only @iskolarngbayan.pup.edu.ph email addresses are allowed.'); return false; }

  const users = JSON.parse(localStorage.getItem('pup_users') || '[]');
  if (users.find(u => u.email === email)) { showError('This email is already registered.'); return false; }

  if (!course)  { showError('Please select your course.');          return false; }
  if (!section) { showError('Please enter your year and section.'); return false; }
  return true;
}

/*
  validateField(input, fn, errMsg) — generic live validator
  ----------------------------------------------------------
  Called with oninput on input fields.
  fn = test function returning true/false.
  Adds .field-ok or .field-err border and shows a message below.
*/
function validateField(input, fn, errMsg) {
  const val   = input.value.trim();
  const msgEl = document.getElementById(input.id + 'Msg');
  const ok    = val && fn(val);

  input.className = ok ? 'field-ok' : (val ? 'field-err' : '');

  if (msgEl) {
    msgEl.textContent = ok ? '' : (val ? errMsg : '');
    msgEl.className   = 'field-msg ' + (ok ? 'ok' : 'err');
  }
}

/*
  validateEmail() — live validator for the email field
  Checks @iskolarngbayan.pup.edu.ph domain and duplicate accounts.
*/
function validateEmail() {
  const val   = document.getElementById('email').value.trim();
  const el    = document.getElementById('email');
  const msg   = document.getElementById('emailMsg');
  const users = JSON.parse(localStorage.getItem('pup_users') || '[]');
  const taken = users.find(u => u.email === val);

  if (!val) { el.className = ''; msg.textContent = ''; return; }

  if (!val.endsWith('@iskolarngbayan.pup.edu.ph')) {
    el.className    = 'field-err';
    msg.textContent = 'Must be a @iskolarngbayan.pup.edu.ph email';
    msg.className   = 'field-msg err';
  } else if (taken) {
    el.className    = 'field-err';
    msg.textContent = 'Email already registered';
    msg.className   = 'field-msg err';
  } else {
    el.className    = 'field-ok';
    msg.textContent = '✓ Valid PUP email';
    msg.className   = 'field-msg ok';
  }
}

/*
  checkStrength() — updates the 4 password strength bars
  -------------------------------------------------------
  Score 0-4:
    +1 if 6+ characters
    +1 if 10+ characters
    +1 if has uppercase AND numbers
    +1 if has special characters
*/
function checkStrength() {
  const val   = document.getElementById('password').value;
  const bars  = [1,2,3,4].map(i => document.getElementById('pwBar' + i));
  const label = document.getElementById('pwLabel');

  let score = 0;
  if (val.length >= 6)                         score++;
  if (val.length >= 10)                        score++;
  if (/[A-Z]/.test(val) && /[0-9]/.test(val)) score++;
  if (/[^a-zA-Z0-9]/.test(val))               score++;

  const colors = ['#ef4444','#f97316','#eab308','#22c55e'];
  const labels = ['Weak','Fair','Good','Strong'];

  bars.forEach((b, i) => {
    b.style.background = i < score ? colors[score - 1] : '#e5e7eb';
  });

  label.textContent = val ? (labels[Math.min(score, 4) - 1] || 'Too weak') : 'Enter a password';
  label.style.color = (val && score) ? colors[score - 1] : '#9ca3af';
}

/*
  validateConfirm() — checks if both password fields match
*/
function validateConfirm() {
  const pw  = document.getElementById('password').value;
  const cpw = document.getElementById('confirmPw').value;
  const msg = document.getElementById('confirmMsg');
  const el  = document.getElementById('confirmPw');

  if (!cpw) { el.className = ''; msg.textContent = ''; return; }

  if (pw === cpw) {
    el.className    = 'field-ok';
    msg.textContent = '✓ Passwords match';
    msg.className   = 'field-msg ok';
  } else {
    el.className    = 'field-err';
    msg.textContent = "Passwords don't match";
    msg.className   = 'field-msg err';
  }
}

/* Toggle password visibility */
function togglePw(id, icon) {
  const input = document.getElementById(id);
  input.type  = input.type === 'text' ? 'password' : 'text';
  icon.innerHTML = input.type === 'text'
    ? '<i class="fa-solid fa-eye-slash"></i>'
    : '<i class="fa-solid fa-eye"></i>';
}

/* Show error message and scroll into view */
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/*
  register()
  ----------
  Creates the account and saves to BOTH localStorage AND Firebase.

  Saving to Firebase is the key fix that makes cross-device chat
  work — without it, each browser only knows about accounts
  registered on that specific device.

  Note: password is intentionally NOT saved to Firebase.
*/
function register() {
  const pw  = document.getElementById('password').value;
  const cpw = document.getElementById('confirmPw').value;

  if (!pw || pw.length < 6) return showError('Password must be at least 6 characters.');
  if (pw !== cpw)           return showError("Passwords don't match.");

  const btn = document.getElementById('submitBtn');
  btn.classList.add('loading');

  setTimeout(() => {
    const user = {
      id:        'u' + Date.now(),
      firstName: document.getElementById('firstName').value.trim(),
      lastName:  document.getElementById('lastName').value.trim(),
      studentId: document.getElementById('studentId').value.trim(),
      email:     document.getElementById('email').value.trim(),
      course:    document.getElementById('course').value,
      section:   document.getElementById('section').value.trim(),
      password:  pw,
      cart:      [],
      joined:    new Date().toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })
    };

    // Save to localStorage (for offline session + login check)
    const users = JSON.parse(localStorage.getItem('pup_users') || '[]');
    users.push(user);
    localStorage.setItem('pup_users', JSON.stringify(users));
    localStorage.setItem('pup_current', JSON.stringify(user));

    /*
      Save public profile to Firebase so ALL devices can see this user.
      Password is intentionally excluded — only public info goes here.
      This is what makes cross-device chat and people search work.
    */
    try {
      const db = firebase.database();
      db.ref(`users/${user.id}`).set({
        id:        user.id,
        firstName: user.firstName,
        lastName:  user.lastName,
        studentId: user.studentId,
        email:     user.email,
        course:    user.course,
        section:   user.section,
        joined:    user.joined,
        pfp:       null
        // password intentionally not saved to Firebase
      }).catch(err => console.warn('Firebase user save failed:', err));
    } catch(e) {
      console.warn('Firebase not available during register:', e);
    }

    // Show success screen and redirect
    document.getElementById('mainForm').style.display     = 'none';
    document.getElementById('switchLink').style.display   = 'none';
    document.getElementById('successScreen').style.display = 'block';

    requestAnimationFrame(() => {
      document.getElementById('redirectBar').style.width = '100%';
    });

    setTimeout(() => window.location.href = 'market.html', 2100);

  }, 800);
}