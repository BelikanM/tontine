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
  origin: [process.env.CLIENT_URL, 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret123',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// ================== DATABASE ==================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB connecté'))
  .catch(err => console.error('❌ MongoDB erreur :', err));

// ================== MODELS ==================
const User = mongoose.model('User', new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  googleId: String,
  role: { type: String, default: 'member' }
}));

const Tontine = mongoose.model('Tontine', new mongoose.Schema({
  name: String,
  amount: Number,
  frequency: String,
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}));

const Cotisation = mongoose.model('Cotisation', new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  tontine: { type: mongoose.Schema.Types.ObjectId, ref: 'Tontine' },
  date: Date,
  amount: Number,
  paid: { type: Boolean, default: true }
}));

const Tour = mongoose.model('Tour', new mongoose.Schema({
  tontine: { type: mongoose.Schema.Types.ObjectId, ref: 'Tontine' },
  beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order: Number,
  date: Date,
  isPaid: { type: Boolean, default: false }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
  tontine: { type: mongoose.Schema.Types.ObjectId, ref: 'Tontine' },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: String,
  timestamp: { type: Date, default: Date.now }
}));

// Invitation Model
const Invitation = mongoose.model('Invitation', new mongoose.Schema({
  tontine: { type: mongoose.Schema.Types.ObjectId, ref: 'Tontine', required: true },
  fromUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

// ================== HELPERS ==================
function generateToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token manquant" });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: "Token invalide" });
    req.userId = decoded.id;
    next();
  });
}

// ================== AUTH ROUTES ==================
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ name, email, password: hash });
    res.json({ token: generateToken(user), user });
  } catch {
    res.status(400).json({ error: "Email déjà utilisé." });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.status(401).json({ error: "Identifiants incorrects" });
  res.json({ token: generateToken(user), user });
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  res.json(user);
});

// ================== TONTINE ROUTES ==================
app.post('/api/tontines', authMiddleware, async (req, res) => {
  const { name, amount, frequency } = req.body;
  const tontine = await Tontine.create({
    name, amount, frequency,
    admin: req.userId,
    members: [req.userId]
  });
  res.json(tontine);
});

app.get('/api/tontines', authMiddleware, async (req, res) => {
  const tontines = await Tontine.find({ members: req.userId }).populate('admin');
  res.json(tontines);
});

app.put('/api/tontines/:id', authMiddleware, async (req, res) => {
  const { name, amount, frequency } = req.body;
  const tontine = await Tontine.findById(req.params.id);
  if (!tontine || tontine.admin.toString() !== req.userId)
    return res.status(403).json({ error: "Accès refusé" });

  tontine.name = name ?? tontine.name;
  tontine.amount = amount ?? tontine.amount;
  tontine.frequency = frequency ?? tontine.frequency;
  await tontine.save();
  res.json(tontine);
});

app.delete('/api/tontines/:id', authMiddleware, async (req, res) => {
  const tontine = await Tontine.findById(req.params.id);
  if (!tontine || tontine.admin.toString() !== req.userId)
    return res.status(403).json({ error: "Suppression refusée" });
  await tontine.deleteOne();
  res.json({ success: true });
});

app.post('/api/tontines/:id/join', authMiddleware, async (req, res) => {
  const tontine = await Tontine.findById(req.params.id);
  if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });

  if (!tontine.members.includes(req.userId)) {
    tontine.members.push(req.userId);
    await tontine.save();
  }

  res.json(tontine);
});

// ================== COTISATIONS ==================
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

app.get('/api/cotisations', authMiddleware, async (req, res) => {
  const cotisations = await Cotisation.find({ user: req.userId }).populate('tontine');
  res.json(cotisations);
});

app.get('/api/tontines/:id/cotisations', authMiddleware, async (req, res) => {
  const cotisations = await Cotisation.find({ tontine: req.params.id }).populate('user');
  res.json(cotisations);
});

// ================== TOURS ==================
app.post('/api/tontines/:id/tours', authMiddleware, async (req, res) => {
  const { beneficiaryId, order, date } = req.body;
  const tontine = await Tontine.findById(req.params.id);
  if (!tontine || tontine.admin.toString() !== req.userId)
    return res.status(403).json({ error: "Non autorisé" });

  const tour = await Tour.create({
    tontine: tontine._id,
    beneficiary: beneficiaryId,
    order,
    date,
    isPaid: false
  });

  res.json(tour);
});

app.get('/api/tontines/:id/tours', authMiddleware, async (req, res) => {
  const tours = await Tour.find({ tontine: req.params.id }).populate('beneficiary').sort("order");
  res.json(tours);
});

app.put('/api/tours/:id/pay', authMiddleware, async (req, res) => {
  const tour = await Tour.findById(req.params.id).populate("tontine");
  if (!tour || tour.tontine.admin.toString() !== req.userId)
    return res.status(403).json({ error: "Non autorisé" });

  tour.isPaid = true;
  await tour.save();
  res.json(tour);
});

// ================== MESSAGES ==================
app.post('/api/tontines/:id/messages', authMiddleware, async (req, res) => {
  const { content } = req.body;
  const message = await Message.create({
    tontine: req.params.id,
    sender: req.userId,
    content
  });
  res.json(message);
});

app.get('/api/tontines/:id/messages', authMiddleware, async (req, res) => {
  const messages = await Message.find({ tontine: req.params.id }).populate('sender').sort({ timestamp: 1 });
  res.json(messages);
});

// ================== INVITATIONS ==================

// Inviter un utilisateur dans une tontine (admin seulement)
app.post('/api/tontines/:id/invite', authMiddleware, async (req, res) => {
  const tontineId = req.params.id;
  const { userId } = req.body;

  try {
    const tontine = await Tontine.findById(tontineId);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });
    if (tontine.admin.toString() !== req.userId) return res.status(403).json({ error: "Non autorisé" });

    if (tontine.members.includes(userId))
      return res.status(400).json({ error: "Utilisateur déjà membre" });

    const existing = await Invitation.findOne({
      tontine: tontineId,
      toUser: userId,
      status: 'pending'
    });
    if (existing)
      return res.status(400).json({ error: "Invitation déjà envoyée" });

    const invitation = await Invitation.create({
      tontine: tontineId,
      fromUser: req.userId,
      toUser: userId
    });

    res.json(invitation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Liste des invitations reçues par l'utilisateur connecté
app.get('/api/invitations', authMiddleware, async (req, res) => {
  try {
    const invitations = await Invitation.find({ toUser: req.userId, status: 'pending' })
      .populate('tontine', 'name')
      .populate('fromUser', 'name');
    res.json(invitations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Accepter une invitation
app.post('/api/invitations/:id/accept', authMiddleware, async (req, res) => {
  const invitationId = req.params.id;
  try {
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) return res.status(404).json({ error: "Invitation introuvable" });
    if (invitation.toUser.toString() !== req.userId) return res.status(403).json({ error: "Non autorisé" });
    if (invitation.status !== 'pending') return res.status(400).json({ error: "Invitation déjà traitée" });

    const tontine = await Tontine.findById(invitation.tontine);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });

    if (!tontine.members.includes(req.userId)) {
      tontine.members.push(req.userId);
      await tontine.save();
    }

    invitation.status = 'accepted';
    await invitation.save();

    res.json({ message: "Invitation acceptée, vous êtes ajouté à la tontine" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Liste tous les utilisateurs sauf soi-même (pour inviter)
app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }, 'name email');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
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

// ================== START SERVER ==================
app.listen(port, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${port}`);
});
