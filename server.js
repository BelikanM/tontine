const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// ================== MIDDLEWARE ==================
app.use(cors({
  origin: [process.env.CLIENT_URL, 'http://localhost:5173'], // Autoriser plusieurs origines pour dev
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'default_secret',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// ================== DB CONNECTION ==================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connecté'))
.catch((err) => console.error('❌ MongoDB erreur :', err));

// ================== MODELS ==================
const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  googleId: String
}));

const Tontine = mongoose.model('Tontine', new mongoose.Schema({
  name: String,
  amount: Number,
  frequency: String,
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}));

const Cotisation = mongoose.model('Cotisation', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tontine: { type: mongoose.Schema.Types.ObjectId, ref: 'Tontine' },
  date: Date,
  amount: Number,
}));

const Tour = mongoose.model('Tour', new mongoose.Schema({
  tontine: { type: mongoose.Schema.Types.ObjectId, ref: 'Tontine' },
  beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order: Number,
  date: Date,
  isPaid: Boolean,
}));

// ================== AUTH ==================
function generateToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: 'Token manquant' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Token invalide' });
    req.userId = decoded.id;
    next();
  });
}

// ================== ROUTES ==================

// Register
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ name, email, password: hash });
    res.json({ token: generateToken(user), user });
  } catch (err) {
    res.status(400).json({ error: 'Email déjà utilisé.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: 'Identifiants incorrects' });
  res.json({ token: generateToken(user), user });
});

// Get current user
app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(user);
});

// Create tontine
app.post('/api/tontines', authMiddleware, async (req, res) => {
  const { name, amount, frequency } = req.body;
  const tontine = await Tontine.create({
    name, amount, frequency,
    admin: req.userId,
    members: [req.userId]
  });
  res.json(tontine);
});

// Join tontine
app.post('/api/tontines/:id/join', authMiddleware, async (req, res) => {
  const tontine = await Tontine.findById(req.params.id);
  if (!tontine.members.includes(req.userId)) {
    tontine.members.push(req.userId);
    await tontine.save();
  }
  res.json(tontine);
});

// Get tontines for user
app.get('/api/tontines', authMiddleware, async (req, res) => {
  const tontines = await Tontine.find({ members: req.userId }).populate('admin');
  res.json(tontines);
});

// Add cotisation
app.post('/api/cotisations', authMiddleware, async (req, res) => {
  const { tontineId, amount } = req.body;
  const cotisation = await Cotisation.create({
    user: req.userId,
    tontine: tontineId,
    date: new Date(),
    amount,
  });
  res.json(cotisation);
});

// ================== GOOGLE AUTH ==================
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  let user = await User.findOne({ googleId: profile.id });
  if (!user) {
    user = await User.create({
      googleId: profile.id,
      name: profile.displayName,
      email: profile.emails[0].value
    });
  }
  return done(null, user);
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  const user = await User.findById(id);
  done(null, user);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/auth-success?token=${token}`);
  }
);

// ================== LAUNCH ==================
app.listen(port, () => {
  console.log(`🚀 Serveur prêt : http://localhost:${port}`);
});
