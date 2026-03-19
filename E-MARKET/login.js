/*
  ============================================================
  LOGIN.JS — Logic for the Login Page
  ============================================================
  Handles:
    - Checking if user is already logged in (auto-redirect)
    - Showing/hiding password text
    - Validating and submitting the login form
    - Clearing corrupted localStorage data
  ============================================================
*/

/*
  ============================================================
  WHAT IS localStorage?
  ============================================================
  localStorage is like a mini database built into the browser.
  It stores data as key-value pairs (like a dictionary).
  The data survives page refreshes and closing the browser.

  We use 2 keys:
    'pup_users'   — array of ALL registered user accounts
    'pup_current' — the ONE user who is currently logged in

  JSON.stringify() converts a JS object → storable string
  JSON.parse()     converts a string    → JS object
  ============================================================
*/

/*
  getValidSession()
  -----------------
  Checks if someone is already logged in AND their account
  actually exists in pup_users (double-check to prevent
  stale data from old versions causing instant redirects).

  Returns the user object if valid, or null if not logged in.
*/
function getValidSession() {
  try {
    const raw = localStorage.getItem('pup_current');
    if (!raw || raw === 'null') return null; // nothing stored

    const cu = JSON.parse(raw); // convert string → object
    if (!cu || !cu.id || !cu.email) {
      localStorage.removeItem('pup_current'); // delete bad data
      return null;
    }

    // Cross-check: does this user exist in pup_users?
    const users = JSON.parse(localStorage.getItem('pup_users') || '[]');
    const found = users.find(u => u.id === cu.id);
    if (!found) {
      localStorage.removeItem('pup_current'); // stale session, wipe it
      return null;
    }

    return found; // ✅ valid session
  } catch (e) {
    localStorage.removeItem('pup_current'); // corrupted data, wipe it
    return null;
  }
}

// If already logged in, skip the login page and go to the market
if (getValidSession()) {
  window.location.href = 'market.html';
}

/*
  togglePw(id, icon)
  ------------------
  Shows or hides the password text when the eye icon is clicked.

  input.type = 'password' → text is hidden (shows dots)
  input.type = 'text'     → text is visible

  We also swap the icon between open-eye and crossed-eye.
*/
function togglePw(id, icon) {
  const input = document.getElementById(id);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  icon.innerHTML = isText
    ? '<i class="fa-solid fa-eye"></i>'
    : '<i class="fa-solid fa-eye-slash"></i>';
}

/*
  showError(msg)
  --------------
  Displays a red error message box above the Sign In button.
  Resets the shake animation each time so it plays even if
  the same error appears twice in a row.
*/
function showError(msg) {
  const el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.animation = 'none';
  el.offsetHeight; // forces browser to reset the animation
  el.style.animation = 'shake 0.3s ease';
}

/*
  login()
  -------
  Called when the Sign In button is clicked (or Enter is pressed).

  Steps:
    1. Read email and password from the input fields
    2. Check they are not empty
    3. Show the loading spinner on the button
    4. After a short delay, search pup_users for a match
    5. If found → save to pup_current → go to market.html
    6. If not found → show error message
*/
function login() {
  const email    = document.getElementById('email').value.trim(); // .trim() removes extra spaces
  const password = document.getElementById('password').value;
  const btn      = document.getElementById('loginBtn');

  if (!email || !password) {
    return showError('Please fill in all fields.');
  }

  btn.classList.add('loading'); // show spinner, hide label text

  /*
    setTimeout delays the check by 700ms to give a realistic feel.
    In a real app with a server, this would be an API call.
  */
  setTimeout(() => {
    const users = JSON.parse(localStorage.getItem('pup_users') || '[]');

    /*
      .find() loops through the array and returns the FIRST item
      where BOTH email AND password match.
      Returns undefined if nothing matches.
    */
    const user = users.find(u => u.email === email && u.password === password);

    if (!user) {
      btn.classList.remove('loading'); // restore button
      return showError('Incorrect email or password. Please try again.');
    }

    // ✅ Login successful! Save session and redirect.
    localStorage.setItem('pup_current', JSON.stringify(user));
    window.location.href = 'market.html';

  }, 700); // 0.7 second delay
}

/*
  Listen for Enter key press anywhere on the page
  so users don't have to click the button
*/
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});

/*
  clearAndReset()
  ---------------
  Emergency button that wipes ALL localStorage data.
  Useful when there's stale/corrupted data from an old version.
*/
function clearAndReset() {
  if (confirm('This will clear all saved accounts and data. Continue?')) {
    localStorage.clear(); // delete everything from localStorage
    location.reload();    // refresh the page
  }
}