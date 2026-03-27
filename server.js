require('dotenv').config();

const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const fs = require('fs');
const path = require('path');

const ALLOWED_EMAIL = 'frankfu0714@gmail.com';
const DATA_FILE = path.join(__dirname, 'kanban-data.json');
const PORT = process.env.PORT || 3000;

const INITIAL_CARDS = [
  { id: 1, title: "Set up voice transcription", desc: "Integrate microphone input with Whisper or system STT API", icon: "🎙️", col: "done" },
  { id: 2, title: "Take desktop screenshot", desc: "Capture full screen or selection on demand", icon: "📸", col: "done" },
  { id: 3, title: "Calendar event parser", desc: "Read and summarize upcoming events from calendar", icon: "📅", col: "todo" },
  { id: 4, title: "Web search integration", desc: "Connect to search API for real-time lookup", icon: "🔍", col: "progress" },
  { id: 5, title: "File system watcher", desc: "Monitor directories for new or changed files", icon: "📁", col: "progress" },
  { id: 6, title: "Clipboard monitor", desc: "Watch clipboard and act on copied content", icon: "📋", col: "done" },
  { id: 7, title: "Shell command executor", desc: "Run terminal commands and capture output", icon: "⚙️", col: "done" },
  { id: 8, title: "Install ffmpeg (arm64)", desc: "", icon: "🎞️", col: "done" },
];

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_CARDS, null, 2));
}

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

app.use(passport.initialize());
app.use(passport.session());

const callbackURL = () =>
  `${process.env.PUBLIC_URL || `http://localhost:${PORT}`}/auth/google/callback`;

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL(),
  },
  (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (email !== ALLOWED_EMAIL) {
      return done(null, false, { message: 'unauthorized', email });
    }
    return done(null, {
      id: profile.id,
      email,
      name: profile.displayName,
      photo: profile.photos?.[0]?.value,
    });
  }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'board.html'));
});

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
  (req, res, next) => {
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        const params = info?.email
          ? `?email=${encodeURIComponent(info.email)}`
          : '';
        return res.redirect(`/unauthorized${params}`);
      }
      req.logIn(user, err2 => {
        if (err2) return next(err2);
        res.redirect('/');
      });
    })(req, res, next);
  }
);

app.get('/unauthorized', (req, res) => {
  const email = req.query.email || '';
  res.status(403).sendFile(path.join(__dirname, 'public', 'unauthorized.html'));
});

app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

// ── API ───────────────────────────────────────────────────────────────────────

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ name: req.user.name, email: req.user.email, photo: req.user.photo });
});

app.get('/api/cards', requireAuth, (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch {
    res.json([]);
  }
});

app.post('/api/cards', requireAuth, (req, res) => {
  const cards = req.body;
  if (!Array.isArray(cards)) {
    return res.status(400).json({ error: 'Expected an array of cards' });
  }
  fs.writeFileSync(DATA_FILE, JSON.stringify(cards, null, 2));
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  Kanban board running at http://localhost:${PORT}\n`);
});
