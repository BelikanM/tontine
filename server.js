const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const session = require("express-session");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const webPush = require("web-push");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [process.env.CLIENT_URL, "http://localhost:5173"],
    credentials: true,
  },
});

// ================== MIDDLEWARE ==================
app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:5173"],
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret123",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

// ================== DATABASE ==================
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connecté"))
  .catch((err) => console.error("❌ MongoDB erreur :", err));

// ================== MODELS ==================
const User = mongoose.model(
  "User",
  new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    googleId: String,
    role: { type: String, default: "member" },
    pushSubscription: { type: Object }, // Nouveau champ pour stocker l'abonnement push
  })
);

const Tontine = mongoose.model(
  "Tontine",
  new mongoose.Schema({
    name: String,
    amount: Number,
    frequency: String,
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  })
);

const Cotisation = mongoose.model(
  "Cotisation",
  new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    tontine: { type: mongoose.Schema.Types.ObjectId, ref: "Tontine" },
    date: Date,
    amount: Number,
    paid: { type: Boolean, default: true },
  })
);

const Tour = mongoose.model(
  "Tour",
  new mongoose.Schema({
    tontine: { type: mongoose.Schema.Types.ObjectId, ref: "Tontine" },
    beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    order: Number,
    date: Date,
    isPaid: { type: Boolean, default: false },
  })
);

const Message = mongoose.model(
  "Message",
  new mongoose.Schema({
    tontine: { type: mongoose.Schema.Types.ObjectId, ref: "Tontine" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    content: String,
    timestamp: { type: Date, default: Date.now },
  })
);

const Invitation = mongoose.model(
  "Invitation",
  new mongoose.Schema({
    tontine: { type: mongoose.Schema.Types.ObjectId, ref: "Tontine", required: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    toUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    createdAt: { type: Date, default: Date.now },
  })
);

const Action = mongoose.model(
  "Action",
  new mongoose.Schema({
    tontine: { type: mongoose.Schema.Types.ObjectId, ref: "Tontine", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "create_tontine",
        "join_tontine",
        "invite_user",
        "accept_invitation",
        "reject_invitation",
        "add_cotisation",
        "pay_tour",
        "update_tontine",
        "delete_tontine",
        "create_tour",
      ],
      required: true,
    },
    description: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  })
);

// ================== WEB PUSH CONFIG ==================
webPush.setVapidDetails(
  "mailto:your-email@example.com",
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ================== HELPERS ==================
function generateToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
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

// Fonction pour envoyer une notification push
async function sendPushNotification(userId, payload) {
  try {
    const user = await User.findById(userId);
    if (!user || !user.pushSubscription) return;

    await webPush.sendNotification(user.pushSubscription, JSON.stringify(payload));
    console.log(`Notification push envoyée à ${user.email}`);
  } catch (err) {
    console.error("Erreur envoi notification push:", err);
  }
}

// ================== SOCKET.IO ==================
io.on("connection", (socket) => {
  console.log("Utilisateur connecté:", socket.id);

  socket.on("joinTontine", (tontineId) => {
    socket.join(tontineId);
    console.log(`Utilisateur a rejoint la tontine ${tontineId}`);
  });

  socket.on("newMessage", (data) => {
    io.to(data.tontineId).emit("message", data);
  });

  socket.on("newInvitation", (data) => {
    io.to(data.userId).emit("invitation", data);
  });

  socket.on("newAction", (data) => {
    io.to(data.tontineId).emit("action", data);
  });

  socket.on("disconnect", () => {
    console.log("Utilisateur déconnecté:", socket.id);
  });
});

// ================== AUTH ROUTES ==================
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash });
    res.json({ token: generateToken(user), user });
  } catch (err) {
    console.error("Erreur inscription:", err);
    res.status(400).json({ error: "Email déjà utilisé ou erreur" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }
    res.json({ token: generateToken(user), user });
  } catch (err) {
    console.error("Erreur login:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json(user);
  } catch (err) {
    console.error("Erreur récupération utilisateur:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== PUSH SUBSCRIPTION ==================
app.post("/api/push/subscribe", authMiddleware, async (req, res) => {
  try {
    const subscription = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });

    user.pushSubscription = subscription;
    await user.save();
    res.json({ message: "Abonnement push enregistré" });
  } catch (err) {
    console.error("Erreur abonnement push:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== TONTINE ROUTES ==================
app.post("/api/tontines", authMiddleware, async (req, res) => {
  try {
    const { name, amount, frequency } = req.body;
    const user = await User.findById(req.userId);
    const tontine = await Tontine.create({
      name,
      amount,
      frequency,
      admin: req.userId,
      members: [req.userId],
    });

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "create_tontine",
      description: `Utilisateur ${user.name} a créé la tontine ${name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push à l'admin
    await sendPushNotification(req.userId, {
      title: "Nouvelle Tontine",
      body: `Vous avez créé la tontine ${name}.`,
    });

    res.json(tontine);
  } catch (err) {
    console.error("Erreur création tontine:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/tontines", authMiddleware, async (req, res) => {
  try {
    const tontines = await Tontine.find({ members: req.userId }).populate("admin");
    res.json(tontines);
  } catch (err) {
    console.error("Erreur récupération tontines:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.put("/api/tontines/:id", authMiddleware, async (req, res) => {
  try {
    const { name, amount, frequency } = req.body;
    const user = await User.findById(req.userId);
    const tontine = await Tontine.findById(req.params.id);
    if (!tontine || tontine.admin.toString() !== req.userId) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    tontine.name = name ?? tontine.name;
    tontine.amount = amount ?? tontine.amount;
    tontine.frequency = frequency ?? tontine.frequency;
    await tontine.save();

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "update_tontine",
      description: `Utilisateur ${user.name} a mis à jour la tontine ${tontine.name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push aux membres
    for (const memberId of tontine.members) {
      await sendPushNotification(memberId, {
        title: "Mise à jour Tontine",
        body: `La tontine ${tontine.name} a été mise à jour.`,
      });
    }

    res.json(tontine);
  } catch (err) {
    console.error("Erreur mise à jour tontine:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/tontines/:id", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const tontine = await Tontine.findById(req.params.id);
    if (!tontine || tontine.admin.toString() !== req.userId) {
      return res.status(403).json({ error: "Suppression refusée" });
    }
    await tontine.deleteOne();

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "delete_tontine",
      description: `Utilisateur ${user.name} a supprimé la tontine ${tontine.name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push aux membres
    for (const memberId of tontine.members) {
      await sendPushNotification(memberId, {
        title: "Tontine Supprimée",
        body: `La tontine ${tontine.name} a été supprimée.`,
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Erreur suppression tontine:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/tontines/:id/join", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const tontine = await Tontine.findById(req.params.id);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });

    if (!tontine.members.includes(req.userId)) {
      tontine.members.push(req.userId);
      await tontine.save();

      const action = await Action.create({
        tontine: tontine._id,
        user: req.userId,
        type: "join_tontine",
        description: `Utilisateur ${user.name} a rejoint la tontine ${tontine.name}`,
      });

      io.to(tontine._id).emit("action", {
        tontineId: tontine._id,
        userId: req.userId,
        type: action.type,
        description: action.description,
        timestamp: action.timestamp,
      });

      // Envoyer une notification push aux membres
      for (const memberId of tontine.members) {
        await sendPushNotification(memberId, {
          title: "Nouveau Membre",
          body: `${user.name} a rejoint la tontine ${tontine.name}.`,
        });
      }
    }
    res.json(tontine);
  } catch (err) {
    console.error("Erreur rejoindre tontine:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== COTISATIONS ==================
app.post("/api/cotisations", authMiddleware, async (req, res) => {
  try {
    const { tontineId, amount } = req.body;
    const user = await User.findById(req.userId);
    const tontine = await Tontine.findById(tontineId);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });

    const cotisation = await Cotisation.create({
      user: req.userId,
      tontine: tontineId,
      date: new Date(),
      amount,
    });

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "add_cotisation",
      description: `Utilisateur ${user.name} a ajouté une cotisation de ${amount} FCFA à la tontine ${tontine.name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push aux membres
    for (const memberId of tontine.members) {
      await sendPushNotification(memberId, {
        title: "Nouvelle Cotisation",
        body: `${user.name} a cotisé ${amount} FCFA à la tontine ${tontine.name}.`,
      });
    }

    res.json(cotisation);
  } catch (err) {
    console.error("Erreur création cotisation:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/cotisations", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { user: userId } : { user: req.userId };
    const cotisations = await Cotisation.find(filter).populate("tontine");
    res.json(cotisations);
  } catch (err) {
    console.error("Erreur récupération cotisations:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/tontines/:id/cotisations", authMiddleware, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ tontine: req.params.id }).populate("user");
    res.json(cotisations);
  } catch (err) {
    console.error("Erreur récupération cotisations tontine:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== TOURS ==================
app.post("/api/tontines/:id/tours", authMiddleware, async (req, res) => {
  try {
    const { beneficiaryId, order, date } = req.body;
    const user = await User.findById(req.userId);
    const tontine = await Tontine.findById(req.params.id);
    if (!tontine || tontine.admin.toString() !== req.userId) {
      return res.status(403).json({ error: "Non autorisé" });
    }
    const tour = await Tour.create({
      tontine: tontine._id,
      beneficiary: beneficiaryId,
      order,
      date,
      isPaid: false,
    });

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "create_tour",
      description: `Utilisateur ${user.name} a créé un tour pour la tontine ${tontine.name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push aux membres
    for (const memberId of tontine.members) {
      await sendPushNotification(memberId, {
        title: "Nouveau Tour",
        body: `Un nouveau tour a été créé pour la tontine ${tontine.name}.`,
      });
    }

    res.json(tour);
  } catch (err) {
    console.error("Erreur création tour:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/tontines/:id/tours", authMiddleware, async (req, res) => {
  try {
    const tours = await Tour.find({ tontine: req.params.id })
      .populate("beneficiary")
      .sort("order");
    res.json(tours);
  } catch (err) {
    console.error("Erreur récupération tours:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.put("/api/tours/:id/pay", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const tour = await Tour.findById(req.params.id).populate("tontine");
    if (!tour || tour.tontine.admin.toString() !== req.userId) {
      return res.status(403).json({ error: "Non autorisé" });
    }
    tour.isPaid = true;
    await tour.save();

    const action = await Action.create({
      tontine: tour.tontine._id,
      user: req.userId,
      type: "pay_tour",
      description: `Utilisateur ${user.name} a marqué un tour comme payé dans la tontine ${tour.tontine.name}`,
    });

    io.to(tour.tontine._id).emit("action", {
      tontineId: tour.tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push aux membres
    for (const memberId of tour.tontine.members) {
      await sendPushNotification(memberId, {
        title: "Tour Payé",
        body: `Un tour a été marqué comme payé dans la tontine ${tour.tontine.name}.`,
      });
    }

    res.json(tour);
  } catch (err) {
    console.error("Erreur paiement tour:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== MESSAGES ==================
app.post("/api/tontines/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const user = await User.findById(req.userId);
    const tontine = await Tontine.findById(req.params.id);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });

    const message = await Message.create({
      tontine: req.params.id,
      sender: req.userId,
      content,
    });
    await message.populate("sender");

    io.to(req.params.id).emit("message", {
      _id: message._id,
      tontine: message.tontine,
      sender: { _id: message.sender._id, name: message.sender.name },
      content: message.content,
      timestamp: message.timestamp,
    });

    // Envoyer une notification push aux membres (sauf l'expéditeur)
    for (const memberId of tontine.members) {
      if (memberId.toString() !== req.userId) {
        await sendPushNotification(memberId, {
          title: "Nouveau Message",
          body: `${user.name} a envoyé un message dans ${tontine.name}: ${content}`,
        });
      }
    }

    res.json(message);
  } catch (err) {
    console.error("Erreur création message:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/tontines/:id/messages", authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({ tontine: req.params.id })
      .populate("sender")
      .sort({ timestamp: 1 });
    res.json(messages);
  } catch (err) {
    console.error("Erreur récupération messages:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== INVITATIONS ==================
app.post("/api/tontines/:id/invite", authMiddleware, async (req, res) => {
  try {
    const tontineId = req.params.id;
    const { userId } = req.body;
    const user = await User.findById(req.userId);
    const toUser = await User.findById(userId);
    const tontine = await Tontine.findById(tontineId);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });
    if (tontine.admin.toString() !== req.userId)
      return res.status(403).json({ error: "Non autorisé" });
    if (tontine.members.includes(userId))
      return res.status(400).json({ error: "Utilisateur déjà membre" });

    const existing = await Invitation.findOne({
      tontine: tontineId,
      toUser: userId,
      status: "pending",
    });
    if (existing)
      return res.status(400).json({ error: "Invitation déjà envoyée" });

    const invitation = await Invitation.create({
      tontine: tontineId,
      fromUser: req.userId,
      toUser: userId,
    });
    await invitation.populate("fromUser tontine");

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "invite_user",
      description: `Utilisateur ${user.name} a invité ${toUser.name} à la tontine ${tontine.name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    io.to(userId).emit("invitation", {
      _id: invitation._id,
      tontine: { _id: tontine._id, name: tontine.name },
      fromUser: { name: user.name },
    });

    // Envoyer une notification push au destinataire
    await sendPushNotification(userId, {
      title: "Nouvelle Invitation",
      body: `${user.name} vous a invité à rejoindre la tontine ${tontine.name}.`,
    });

    res.json(invitation);
  } catch (err) {
    console.error("Erreur invitation:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/invitations", authMiddleware, async (req, res) => {
  try {
    const invitations = await Invitation.find({ toUser: req.userId, status: "pending" })
      .populate("tontine", "name")
      .populate("fromUser", "name");
    res.json(invitations);
  } catch (err) {
    console.error("Erreur récupération invitations:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/invitations/:id/accept", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const invitationId = req.params.id;
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) return res.status(404).json({ error: "Invitation introuvable" });
    if (invitation.toUser.toString() !== req.userId)
      return res.status(403).json({ error: "Non autorisé" });
    if (invitation.status !== "pending")
      return res.status(400).json({ error: "Invitation déjà traitée" });

    const tontine = await Tontine.findById(invitation.tontine);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });

    if (!tontine.members.includes(req.userId)) {
      tontine.members.push(req.userId);
      await tontine.save();
    }

    invitation.status = "accepted";
    await invitation.save();

    const action = await Action.create({
      tontine: tontine._id,
      user: req.userId,
      type: "accept_invitation",
      description: `Utilisateur ${user.name} a accepté une invitation pour la tontine ${tontine.name}`,
    });

    io.to(tontine._id).emit("action", {
      tontineId: tontine._id,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push aux membres
    for (const memberId of tontine.members) {
      await sendPushNotification(memberId, {
        title: "Nouveau Membre",
        body: `${user.name} a accepté une invitation pour rejoindre la tontine ${tontine.name}.`,
      });
    }

    res.json({ message: "Invitation acceptée, vous êtes ajouté à la tontine" });
  } catch (err) {
    console.error("Erreur acceptation invitation:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/invitations/:id/reject", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const invitationId = req.params.id;
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) return res.status(404).json({ error: "Invitation introuvable" });
    if (invitation.toUser.toString() !== req.userId)
      return res.status(403).json({ error: "Non autorisé" });
    if (invitation.status !== "pending")
      return res.status(400).json({ error: "Invitation déjà traitée" });

    invitation.status = "rejected";
    await invitation.save();

    const tontine = await Tontine.findById(invitation.tontine);
    const action = await Action.create({
      tontine: invitation.tontine,
      user: req.userId,
      type: "reject_invitation",
      description: `Utilisateur ${user.name} a rejeté une invitation pour la tontine ${tontine.name}`,
    });

    io.to(invitation.tontine).emit("action", {
      tontineId: invitation.tontine,
      userId: req.userId,
      type: action.type,
      description: action.description,
      timestamp: action.timestamp,
    });

    // Envoyer une notification push à l'admin
    await sendPushNotification(tontine.admin, {
      title: "Invitation Rejetée",
      body: `${user.name} a rejeté votre invitation pour la tontine ${tontine.name}.`,
    });

    res.json({ message: "Invitation rejetée" });
  } catch (err) {
    console.error("Erreur rejet invitation:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== HISTORIQUE DES ACTIONS ==================
app.get("/api/tontines/:id/actions", authMiddleware, async (req, res) => {
  try {
    const tontine = await Tontine.findById(req.params.id);
    if (!tontine) return res.status(404).json({ error: "Tontine introuvable" });
    if (!tontine.members.includes(req.userId))
      return res.status(403).json({ error: "Non autorisé" });

    const actions = await Action.find({ tontine: req.params.id })
      .populate("user", "name")
      .sort({ timestamp: -1 });
    res.json(actions);
  } catch (err) {
    console.error("Erreur récupération actions:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== USERS ==================
app.get("/api/users", authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.userId } }, "name email");
    res.json(users);
  } catch (err) {
    console.error("Erreur récupération utilisateurs:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ================== GOOGLE AUTH ==================
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value,
          });
        }
        return done(null, user);
      } catch (err) {
        console.error("Erreur Google auth:", err);
        return done(err, null);
      }
    }
  )
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/auth-success?token=${token}`);
  }
);

// ================== START SERVER ==================
server.listen(process.env.PORT || 5000, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${process.env.PORT || 5000}`);
});
