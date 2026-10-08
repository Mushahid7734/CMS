import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaV3Provider
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  query,
  orderByChild,
  equalTo,
  get,
  set,
  update,
  remove,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBmbm53LAtQVYi_LWtoFg6eOb1RpkbDh3s",
  authDomain: "authentication-app-ccc42.firebaseapp.com",
  databaseURL: "https://authentication-app-ccc42-default-rtdb.firebaseio.com",
  projectId: "authentication-app-ccc42",
  storageBucket: "authentication-app-ccc42.firebasestorage.app",
  messagingSenderId: "885391442345",
  appId: "1:885391442345:web:01aa305e896d90072684b8"
};

// Admin account (must match the email in the Firebase Realtime Database rules)
const ADMIN_EMAIL = "mushahidsyed1994@gmail.com";

// Firebase App Check (optional but recommended). Paste your reCAPTCHA v3 SITE key here.
const RECAPTCHA_SITE_KEY = "";

const REPLY_LABEL = "Reply from Mason Carter";
const ABOUT_SLUG = "about-mason-carter";
const ABOUT_TITLE = "About Mason Carter";
const PAGE_SIZE = 6;

// Which subject this page shows: "all", "about-mason-carter", or a book ID
const PAGE_SUBJECT = String(window.MC_REVIEWS_SUBJECT || 'all').trim().toLowerCase();
const MODE_ALL = PAGE_SUBJECT === 'all';

const app = initializeApp(firebaseConfig);
if (RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true
  });
}
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// State
let currentUser = null;
let selectedRating = 5;
let allReviews = [];
let subjects = [];                 // [{slug, title, order}]
let subjectMap = new Map();        // slug -> {slug, title, order}
let subjectsLoaded = false;
let filterSlug = 'all';
let visibleCount = PAGE_SIZE;
let editingReplyKey = null;

// DOM Elements
const btnOpenModal = document.getElementById('btn-open-modal');
const authModal = document.getElementById('auth-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnGoogleLogin = document.getElementById('btn-google-login');
const inlineReviewBox = document.getElementById('inline-review-box');
const inlineUserAvatar = document.getElementById('inline-user-avatar');
const inlineUserName = document.getElementById('inline-user-name');
const btnLogout = document.getElementById('btn-logout');
const reviewForm = document.getElementById('review-form');
const starPicker = document.getElementById('star-picker');
const reviewComment = document.getElementById('review-comment');
const formError = document.getElementById('form-error');
const formModeLabel = document.getElementById('form-mode-label');
const btnSubmitReview = document.getElementById('btn-submit-review');
const reviewGrid = document.getElementById('mc-review-grid');
const btnLoadMore = document.getElementById('btn-load-more');
const summaryBox = document.getElementById('mc-summary');
const subjectRow = document.getElementById('subject-row');
const subjectSelect = document.getElementById('review-subject');
const filterBar = document.getElementById('mc-filter-bar');
const filterSelect = document.getElementById('filter-subject');
const adminPanel = document.getElementById('mc-admin-panel');
const adminPanelTitle = document.getElementById('admin-panel-title');
const adminTitleInput = document.getElementById('admin-subject-title');
const adminSlugInput = document.getElementById('admin-subject-slug');
const adminAddBtn = document.getElementById('admin-subject-add');
const adminMsg = document.getElementById('admin-subject-msg');

// ---------- Helpers ----------
const BADGE_SVG = `<svg class="mc-verified-badge" viewBox="0 0 24 24" aria-hidden="true"><title>Signed in with Google</title><path fill="#1DA1F2" d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.79-4-4-4-.495 0-.965.084-1.4.238C14.55 2.475 13.18 1.6 11.6 1.6c-1.58 0-2.95.875-3.6 2.148-.435-.154-.905-.238-1.4-.238-2.21 0-4 1.79-4 4 0 .495.084.965.238 1.4C1.575 9.55.7 10.92.7 12.5c0 1.58.875 2.95 2.148 3.6-.154.435-.238.905-.238 1.4 0 2.21 1.79 4 4 4 .495 0 .965-.084 1.4-.238 1.05 1.273 2.42 2.148 4 2.148 1.58 0 2.95-.875 3.6-2.148.435.154.905.238 1.4.238 2.21 0 4-1.79 4-4 0-.495-.084-.965-.238-1.4 1.273-1.05 2.148-2.42 2.148-4z"/><path fill="#FFFFFF" d="M10.2 16.2l-3.5-3.5 1.4-1.4 2.1 2.1 5.3-5.3 1.4 1.4z"/></svg>`;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// Local initials avatar (inline SVG) - used when a photo is missing or fails to load
function initialsAvatar(name) {
  const n = String(name || 'Reader').trim() || 'Reader';
  const parts = n.split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] || 'R')[0] || 'R';
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1])[0] || '') : '';
  const initials = (first + last).toUpperCase();
  const colors = ['#6B4F3A', '#8A6A4F', '#A0522D', '#5E6B4F', '#4F5E6B', '#7A5C6B', '#8C6D3F'];
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const bg = colors[h % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="32" text-anchor="middle" dominant-baseline="central" font-family="Georgia,serif" font-size="26" font-weight="700" fill="#ffffff">${escapeHtml(initials)}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function safePhoto(url) {
  return (typeof url === 'string' && /^https:\/\//i.test(url)) ? url : '';
}
function avatarFor(name, photo) {
  return safePhoto(photo) || initialsAvatar(name);
}

inlineUserAvatar.addEventListener('error', () => {
  if (inlineUserAvatar.dataset.fb) return;
  inlineUserAvatar.dataset.fb = '1';
  inlineUserAvatar.src = initialsAvatar(inlineUserAvatar.getAttribute('alt'));
});
reviewGrid.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.classList.contains('mc-r-avatar') && !t.dataset.fb) {
    t.dataset.fb = '1';
    t.src = initialsAvatar(t.getAttribute('alt'));
  }
}, true);

function isAdminUser() {
  return !!(
    currentUser &&
    currentUser.email &&
    ADMIN_EMAIL &&
    currentUser.email.trim().toLowerCase() === ADMIN_EMAIL.trim().toLowerCase()
  );
}

function normalizeReview(key, v) {
  const rating = Math.max(1, Math.min(5, Math.round(Number(v.rating)) || 5));
  const reply = (v.reply && typeof v.reply.text === 'string' && v.reply.text)
    ? { text: v.reply.text, timestamp: Number(v.reply.timestamp) || 0 }
    : null;
  return {
    key,
    uid: typeof v.uid === 'string' ? v.uid : '',
    subject: typeof v.subject === 'string' ? v.subject : '',
    userName: typeof v.userName === 'string' && v.userName ? v.userName : 'Reader',
    userPhoto: typeof v.userPhoto === 'string' ? v.userPhoto : '',
    rating,
    comment: typeof v.comment === 'string' ? v.comment : '',
    timestamp: Number(v.timestamp) || 0,
    editedAt: Number(v.editedAt) || 0,
    reply
  };
}

function titleFor(slug) {
  if (!slug) return 'General';
  const s = subjectMap.get(slug);
  return s ? s.title : slug;
}

// Which subject the review form is currently writing to
function formSubject() {
  return MODE_ALL ? (subjectSelect.value || '') : PAGE_SUBJECT;
}
function canPost() {
  const s = formSubject();
  return !!(s && subjectMap.has(s));
}
function reviewKey(subject, uid) {
  return `${subject}__${uid}`;
}
// The signed-in user's own review for the subject shown in the form
function findMyReview() {
  if (!currentUser) return null;
  const s = formSubject();
  if (!s) return null;
  const key = reviewKey(s, currentUser.uid);
  return allReviews.find(r => r.key === key) || null;
}
function getFiltered() {
  if (MODE_ALL && filterSlug !== 'all') return allReviews.filter(r => r.subject === filterSlug);
  return allReviews;
}

// ---------- Modal ----------
btnOpenModal.addEventListener('click', () => {
  if (currentUser) {
    inlineReviewBox.scrollIntoView({ behavior: 'smooth' });
    reviewComment.focus();
  } else {
    authModal.style.display = 'flex';
  }
});
btnCloseModal.addEventListener('click', () => { authModal.style.display = 'none'; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') authModal.style.display = 'none';
});

// ---------- Auth ----------
btnGoogleLogin.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
    authModal.style.display = 'none';
  } catch (err) {
    console.error("Auth Error:", err);
    alert("Sign-in failed: " + err.message);
  }
});
btnLogout.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  editingReplyKey = null;
  if (user) {
    const name = user.displayName || 'Reader';
    inlineUserAvatar.dataset.fb = '';
    inlineUserAvatar.alt = name;
    inlineUserAvatar.src = avatarFor(name, user.photoURL);
    inlineUserName.innerHTML = escapeHtml(name) + BADGE_SVG;
    inlineReviewBox.style.display = 'block';
  } else {
    inlineReviewBox.style.display = 'none';
  }
  syncForm();
  renderReviews();
  updateAdminPanel();
  await ensureAboutSubject();
});

// ---------- Star rating picker ----------
const starSpans = Array.from(starPicker.querySelectorAll('span'));
function setRating(n) {
  selectedRating = n;
  starSpans.forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.star, 10) <= n);
  });
}
starSpans.forEach(span => {
  span.addEventListener('click', () => setRating(parseInt(span.dataset.star, 10)));
});

// Fill the form with the user's existing review for the chosen subject (edit mode) or reset it
function syncForm() {
  const mine = findMyReview();
  if (mine) {
    setRating(mine.rating);
    reviewComment.value = mine.comment;
    btnSubmitReview.textContent = 'Update Review';
  } else {
    setRating(5);
    reviewComment.value = '';
    btnSubmitReview.textContent = 'Post Review';
  }
  const base = mine ? 'Edit your review' : 'Write a review';
  const pageTitle = (!MODE_ALL && subjectMap.has(PAGE_SUBJECT)) ? subjectMap.get(PAGE_SUBJECT).title : '';
  formModeLabel.textContent = pageTitle ? `${base} \u00b7 ${pageTitle}` : base;

  const ok = canPost();
  btnSubmitReview.disabled = !ok;
  if (!ok && subjectsLoaded) {
    formError.textContent = MODE_ALL ? 'Reviews are not open yet.' : 'Reviews are not open for this page yet.';
    formError.style.display = 'block';
  } else {
    formError.style.display = 'none';
  }
}
subjectSelect.addEventListener('change', syncForm);

filterSelect.addEventListener('change', () => {
  filterSlug = filterSelect.value || 'all';
  visibleCount = PAGE_SIZE;
  renderSummary();
  renderReviews();
});

// ---------- Submit / update review ----------
reviewForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser) return;

  const commentText = reviewComment.value.trim();
  if (!commentText) return;

  const subject = formSubject();
  if (!subject || !subjectMap.has(subject)) {
    formError.textContent = 'Please choose what you are reviewing.';
    formError.style.display = 'block';
    return;
  }

  const uid = currentUser.uid;
  const key = reviewKey(subject, uid);
  const existing = allReviews.find(r => r.key === key);
  btnSubmitReview.disabled = true;

  try {
    if (existing) {
      // Edit: only touch rating, comment and editedAt (keeps date + admin reply)
      await update(ref(db, `reviews/${key}`), {
        rating: selectedRating,
        comment: commentText,
        editedAt: serverTimestamp()
      });
    } else {
      // New review: one per user per subject
      await set(ref(db, `reviews/${key}`), {
        uid,
        subject,
        userName: (currentUser.displayName || 'Reader').slice(0, 200),
        userPhoto: safePhoto(currentUser.photoURL),
        rating: selectedRating,
        comment: commentText,
        timestamp: serverTimestamp()
      });
    }
    formError.style.display = 'none';
    await loadReviews();
  } catch (err) {
    console.error("Write Error:", err);
    formError.textContent = "Error submitting review: " + err.message;
    formError.style.display = 'block';
  } finally {
    btnSubmitReview.disabled = !canPost();
  }
});

// ---------- Subjects (books / about) ----------
function setSubjects(list) {
  subjects = list.sort((a, b) => {
    if (a.slug === ABOUT_SLUG) return -1;
    if (b.slug === ABOUT_SLUG) return 1;
    return (a.order - b.order) || a.title.localeCompare(b.title);
  });
  subjectMap = new Map(subjects.map(s => [s.slug, s]));
  populateSelects();
}

function populateSelects() {
  if (!MODE_ALL) return;
  const opts = subjects.map(s => `<option value="${escapeHtml(s.slug)}">${escapeHtml(s.title)}</option>`).join('');

  const prevForm = subjectSelect.value;
  subjectSelect.innerHTML = opts;
  if (subjectMap.has(prevForm)) subjectSelect.value = prevForm;

  const prevFilter = filterSelect.value || 'all';
  filterSelect.innerHTML = `<option value="all">All reviews</option>` + opts;
  filterSelect.value = (prevFilter === 'all' || subjectMap.has(prevFilter)) ? prevFilter : 'all';
  filterSlug = filterSelect.value;

  subjectRow.style.display = 'flex';
  filterBar.style.display = 'flex';
}

// Admin: make sure "About Mason Carter" always exists as the first subject
async function ensureAboutSubject() {
  if (!subjectsLoaded || !isAdminUser() || subjectMap.has(ABOUT_SLUG)) return;
  try {
    await set(ref(db, `subjects/${ABOUT_SLUG}`), { title: ABOUT_TITLE, order: 0 });
    setSubjects([...subjects, { slug: ABOUT_SLUG, title: ABOUT_TITLE, order: 0 }]);
    syncForm();
    renderReviews();
    updateAdminPanel();
  } catch (err) {
    console.error("Could not create About subject:", err);
  }
}

function updateAdminPanel() {
  const show = isAdminUser() && subjectsLoaded && (MODE_ALL || !subjectMap.has(PAGE_SUBJECT));
  adminPanel.style.display = show ? 'block' : 'none';
  if (!show) return;
  if (!MODE_ALL) {
    adminPanelTitle.textContent = 'Admin \u00b7 This page is not registered yet';
    adminSlugInput.value = PAGE_SUBJECT;
    adminSlugInput.readOnly = true;
  }
}

adminTitleInput.addEventListener('input', () => {
  if (MODE_ALL && !adminSlugInput.dataset.manual) adminSlugInput.value = slugify(adminTitleInput.value);
});
adminSlugInput.addEventListener('input', () => { adminSlugInput.dataset.manual = '1'; });

adminAddBtn.addEventListener('click', async () => {
  if (!isAdminUser()) return;
  const title = adminTitleInput.value.trim();
  const slug = slugify(MODE_ALL ? (adminSlugInput.value || title) : PAGE_SUBJECT);
  if (!title) { adminMsg.textContent = 'Please enter a title.'; return; }
  if (!slug || slug === 'all') { adminMsg.textContent = 'Please choose a different page ID.'; return; }
  if (subjectMap.has(slug)) { adminMsg.textContent = 'That page ID already exists.'; return; }

  const order = subjects.reduce((m, s) => Math.max(m, s.order), 0) + 1;
  try {
    await set(ref(db, `subjects/${slug}`), { title, order });
    adminMsg.innerHTML = `Added \u201c${escapeHtml(title)}\u201d. On its page, set <code>window.MC_REVIEWS_SUBJECT = "${escapeHtml(slug)}";</code>`;
    adminTitleInput.value = '';
    if (MODE_ALL) { adminSlugInput.value = ''; delete adminSlugInput.dataset.manual; }
    await loadReviews();
  } catch (err) {
    adminMsg.textContent = 'Failed to add: ' + err.message;
  }
});

// ---------- Load reviews ----------
async function loadReviews() {
  try {
    const reviewsRef = ref(db, 'reviews');
    const q = MODE_ALL
      ? reviewsRef
      : query(reviewsRef, orderByChild('subject'), equalTo(PAGE_SUBJECT));
    const [subSnap, revSnap] = await Promise.all([get(ref(db, 'subjects')), get(q)]);

    const subList = [];
    subSnap.forEach(child => {
      const v = child.val();
      if (v && typeof v === 'object') {
        subList.push({
          slug: child.key,
          title: String(v.title || child.key),
          order: Number(v.order) || 0
        });
      }
    });
    setSubjects(subList);
    subjectsLoaded = true;

    const list = [];
    revSnap.forEach(child => {
      const v = child.val();
      if (v && typeof v === 'object') list.push(normalizeReview(child.key, v));
    });
    list.sort((a, b) => b.timestamp - a.timestamp);
    allReviews = list;

    syncForm();
    renderSummary();
    updateHeaderRating();
    renderReviews();
    updateAdminPanel();
    await ensureAboutSubject();
  } catch (err) {
    console.error("Firebase Database Read Error:", err);
    reviewGrid.innerHTML = `<div class="mc-review-loader">Unable to load reviews right now. (${escapeHtml(err.message)})</div>`;
  }
}

// ---------- Rating summary ----------
function renderSummary() {
  const list = getFiltered();
  const total = list.length;
  if (!total) { summaryBox.style.display = 'none'; summaryBox.innerHTML = ''; return; }

  const counts = [0, 0, 0, 0, 0, 0];
  let sum = 0;
  list.forEach(r => { counts[r.rating]++; sum += r.rating; });
  const avg = sum / total;
  const fillPct = (avg / 5) * 100;

  const rows = [5, 4, 3, 2, 1].map(n => {
    const pct = (counts[n] / total) * 100;
    return `
      <div class="mc-sum-row">
        <span class="mc-sum-label">${n} <span>\u2605</span></span>
        <div class="mc-sum-track"><div class="mc-sum-fill" style="width:${pct}%"></div></div>
        <span class="mc-sum-num">${counts[n]}</span>
      </div>`;
  }).join('');

  summaryBox.innerHTML = `
    <div class="mc-sum-left">
      <div class="mc-sum-avg">${avg.toFixed(1)}</div>
      <div class="mc-star-bar" aria-label="${avg.toFixed(1)} out of 5 stars">
        <span class="mc-star-bg">\u2605\u2605\u2605\u2605\u2605</span>
        <span class="mc-star-fg" style="width:${fillPct}%">\u2605\u2605\u2605\u2605\u2605</span>
      </div>
      <div class="mc-sum-count">${total} review${total === 1 ? '' : 's'}</div>
    </div>
    <div class="mc-sum-bars">${rows}</div>`;
  summaryBox.style.display = 'flex';
}

// Book pages only: fills the star rating near the book title and the "Reviews (n)" tab label.
// Does nothing if those elements are not on the page.
function updateHeaderRating() {
  if (MODE_ALL) return;
  const total = allReviews.length;
  const tabBtn = document.querySelector('.book-showcase-mc__tab[data-tab="reviews"]');
  if (tabBtn) tabBtn.textContent = total ? `Reviews (${total})` : 'Reviews';

  const box = document.getElementById('mc-header-rating');
  if (!box) return;
  const fg = box.querySelector('.book-showcase-mc__rating-fg');
  const txt = box.querySelector('.book-showcase-mc__rating-text');
  if (total) {
    const avg = allReviews.reduce((s, r) => s + r.rating, 0) / total;
    fg.style.width = (avg / 5 * 100) + '%';
    txt.textContent = `${avg.toFixed(1)} \u00b7 ${total} review${total === 1 ? '' : 's'}`;
    box.setAttribute('aria-label', `Rated ${avg.toFixed(1)} out of 5 from ${total} review${total === 1 ? '' : 's'}. See reviews`);
  } else {
    fg.style.width = '0%';
    txt.textContent = 'No reviews yet \u00b7 Be the first to review';
  }
  box.style.display = 'inline-flex';
}

// ---------- Reply HTML (admin writes, everyone reads) ----------
function buildReplyHtml(r, isAdmin) {
  const key = escapeHtml(r.key);

  if (isAdmin && editingReplyKey === r.key) {
    return `
      <div class="mc-reply-editor">
        <textarea class="mc-reply-input" data-reply-input="${key}" rows="3" maxlength="1000" placeholder="Write your reply...">${r.reply ? escapeHtml(r.reply.text) : ''}</textarea>
        <div class="mc-reply-actions">
          <button type="button" class="mc-reply-btn mc-reply-save" data-reply-save="${key}">Post Reply</button>
          <button type="button" class="mc-reply-btn mc-reply-cancel" data-reply-cancel="${key}">Cancel</button>
        </div>
      </div>`;
  }

  if (r.reply) {
    const adminControls = isAdmin ? `
        <div class="mc-reply-actions">
          <button type="button" class="mc-reply-link" data-reply-edit="${key}">Edit</button>
          <button type="button" class="mc-reply-link" data-reply-delete="${key}">Delete</button>
        </div>` : '';
    return `
      <div class="mc-reply-box">
        <div class="mc-reply-label">\u21b3 ${escapeHtml(REPLY_LABEL)}</div>
        <p class="mc-reply-text">${escapeHtml(r.reply.text)}</p>
        ${adminControls}
      </div>`;
  }
  return '';
}

// ---------- Render reviews ----------
function renderReviews() {
  const list = getFiltered();
  if (list.length === 0) {
    reviewGrid.innerHTML = '<div class="mc-review-loader">No reviews yet. Be the first to post one!</div>';
    btnLoadMore.style.display = 'none';
    return;
  }

  const isAdmin = isAdminUser();
  const visible = list.slice(0, visibleCount);

  reviewGrid.innerHTML = visible.map(r => {
    const starsHtml = '\u2605'.repeat(r.rating) + '\u2606'.repeat(5 - r.rating);
    const dateStr = r.timestamp
      ? new Date(r.timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    const editedTag = r.editedAt ? ' <span class="mc-edited">\u00b7 edited</span>' : '';

    const isOwner = !!(currentUser && r.uid && r.uid === currentUser.uid);
    const canDelete = isAdmin || isOwner;
    const deleteBtnHtml = canDelete
      ? `<button class="mc-admin-delete" data-key="${escapeHtml(r.key)}" title="Delete Review" type="button">&times;</button>`
      : '';

    const canEdit = !!(currentUser && r.subject && r.key === reviewKey(r.subject, currentUser.uid));
    const actions = [];
    if (canEdit) actions.push(`<button type="button" class="mc-reply-link" data-edit-mine="${escapeHtml(r.subject)}">Edit my review</button>`);
    if (isAdmin && !r.reply && editingReplyKey !== r.key) {
      actions.push(`<button type="button" class="mc-reply-link" data-reply-edit="${escapeHtml(r.key)}">Reply</button>`);
    }
    const actionsHtml = actions.length ? `<div class="mc-r-actions">${actions.join('')}</div>` : '';

    const tagHtml = MODE_ALL ? `<div><span class="mc-subject-tag">${escapeHtml(titleFor(r.subject))}</span></div>` : '';

    return `
      <article class="mc-r-card${isOwner ? ' mc-mine' : ''}">
        ${deleteBtnHtml}
        <div>
          <div class="mc-r-header">
            <img src="${escapeHtml(avatarFor(r.userName, r.userPhoto))}" alt="${escapeHtml(r.userName)}" class="mc-r-avatar" referrerpolicy="no-referrer" loading="lazy" />
            <div class="mc-r-author-info">
              <span class="mc-name-line">${escapeHtml(r.userName)}${BADGE_SVG}</span>
              <span class="mc-r-date">${dateStr}${editedTag}</span>
            </div>
          </div>
          ${tagHtml}
          <div class="mc-stars">${starsHtml}</div>
          <p class="mc-r-text">\u201c${escapeHtml(r.comment)}\u201d</p>
          ${buildReplyHtml(r, isAdmin)}
          ${actionsHtml}
        </div>
      </article>
    `;
  }).join('');

  btnLoadMore.style.display = list.length > visibleCount ? 'inline-block' : 'none';
}

btnLoadMore.addEventListener('click', () => {
  visibleCount += PAGE_SIZE;
  renderReviews();
});

// ---------- Click handling for card buttons (one delegated listener) ----------
reviewGrid.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  // Own review: jump to the edit form
  if (btn.hasAttribute('data-edit-mine')) {
    const subj = btn.getAttribute('data-edit-mine');
    if (MODE_ALL && subjectMap.has(subj)) subjectSelect.value = subj;
    syncForm();
    inlineReviewBox.scrollIntoView({ behavior: 'smooth' });
    reviewComment.focus();
    return;
  }

  // Delete review (admin: any, user: own). Firebase rules are the real security control.
  if (btn.classList.contains('mc-admin-delete')) {
    if (!currentUser) { alert("Please sign in first."); return; }
    const key = btn.getAttribute('data-key');
    if (!confirm("Are you sure you want to delete this review?")) return;
    try {
      await remove(ref(db, `reviews/${key}`));
      await loadReviews();
    } catch (err) {
      alert("Failed to delete review: " + err.message);
    }
    return;
  }

  // Admin reply controls
  if (!isAdminUser()) return;
  const editKey = btn.getAttribute('data-reply-edit');
  const cancelKey = btn.getAttribute('data-reply-cancel');
  const saveKey = btn.getAttribute('data-reply-save');
  const deleteKey = btn.getAttribute('data-reply-delete');

  if (editKey) {
    editingReplyKey = editKey;
    renderReviews();
  } else if (cancelKey) {
    editingReplyKey = null;
    renderReviews();
  } else if (saveKey) {
    const input = Array.from(document.querySelectorAll('[data-reply-input]'))
      .find(el => el.getAttribute('data-reply-input') === saveKey);
    const text = input ? input.value.trim() : '';
    if (!text) { alert("Please write a reply first."); return; }
    try {
      const reply = { text, timestamp: Date.now() };
      await set(ref(db, `reviews/${saveKey}/reply`), reply);
      const item = allReviews.find(x => x.key === saveKey);
      if (item) item.reply = reply;
      editingReplyKey = null;
      renderReviews();
    } catch (err) {
      alert("Failed to save reply: " + err.message);
    }
  } else if (deleteKey) {
    if (!confirm("Delete your reply to this review?")) return;
    try {
      await remove(ref(db, `reviews/${deleteKey}/reply`));
      const item = allReviews.find(x => x.key === deleteKey);
      if (item) item.reply = null;
      renderReviews();
    } catch (err) {
      alert("Failed to delete reply: " + err.message);
    }
  }
});

// Initialize
loadReviews();
