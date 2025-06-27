import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import * as tf from "@tensorflow/tfjs";
import { io } from "socket.io-client";

const TontineCreate = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const socket = io("http://localhost:5000");

  // --- FORM STATE ---
  const [form, setForm] = useState({
    name: "",
    amount: "",
    frequency: "monthly",
  });

  // --- TONTINES LIST ---
  const [tontines, setTontines] = useState([]);

  // --- USERS LIST (pour inviter) ---
  const [users, setUsers] = useState([]);

  // --- INVITATIONS ---
  const [invitations, setInvitations] = useState([]);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");

  // --- CHAT STATE ---
  const [selectedTontine, setSelectedTontine] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // --- MISC ---
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // --- RELIABILITY SCORES ---
  const [reliabilityScores, setReliabilityScores] = useState({});

  const token = localStorage.getItem("token");

  const frequencies = [
    { value: "daily", label: "Quotidienne" },
    { value: "weekly", label: "Hebdomadaire" },
    { value: "monthly", label: "Mensuelle" },
  ];

  // --- NOTIFICATIONS PUSH ---
  const subscribeToPush = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.log("Permission de notification refusée");
        return;
      }

      const registration = await navigator.serviceWorker.register("/service-worker.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.REACT_APP_VAPID_PUBLIC_KEY, // Ajoutez la clé publique VAPID dans .env
      });

      await fetch("http://localhost:5000/api/push/subscribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(subscription),
      });
      console.log("Abonnement push enregistré");
    } catch (err) {
      console.error("Erreur abonnement push:", err);
    }
  };

  // --- HANDLERS ---
  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  // --- FETCH TONTINES ---
  const fetchTontines = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/tontines", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setTontines(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur de récupération des tontines :", err);
      setError("Erreur de récupération des tontines");
    }
  };

  // --- FETCH USERS ---
  const fetchUsers = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setUsers(Array.isArray(data) ? data.filter((u) => u._id !== user._id) : []);
      await fetchReliabilityScores(data.filter((u) => u._id !== user._id));
    } catch (err) {
      console.error("Erreur de récupération des utilisateurs :", err);
      setError("Erreur de récupération des utilisateurs");
    }
  };

  // --- FETCH INVITATIONS ---
  const fetchInvitations = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/invitations", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setInvitations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur de récupération des invitations :", err);
      setError("Erreur de récupération des invitations");
    }
  };

  // --- FETCH MESSAGES pour une tontine ---
  const fetchMessages = async (tontineId) => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/tontines/${tontineId}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur de récupération des messages :", err);
      setError("Erreur de récupération des messages");
    }
  };

  // --- FETCH COTISATIONS pour un utilisateur ---
  const fetchUserCotisations = async (userId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/cotisations?userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error("Erreur de récupération des cotisations :", err);
      return [];
    }
  };

  // --- PREDIRE LA FIABILITE DES UTILISATEURS ---
  const fetchReliabilityScores = async (users) => {
    const scores = {};
    for (const u of users) {
      const cotisations = await fetchUserCotisations(u._id);
      const score = await predictReliability(cotisations);
      scores[u._id] = score;
    }
    setReliabilityScores(scores);
  };

  // --- MODELE TensorFlow.js POUR PREDICTION DE FIABILITE ---
  const predictReliability = async (cotisations) => {
    try {
      const totalCotisations = cotisations.length;
      const paidOnTime = cotisations.filter((c) => c.paid).length;
      const paymentRate = totalCotisations > 0 ? paidOnTime / totalCotisations : 0;

      const model = tf.sequential();
      model.add(tf.layers.dense({ units: 10, inputShape: [1], activation: "relu" }));
      model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

      model.compile({
        optimizer: tf.train.adam(0.01),
        loss: "binaryCrossentropy",
        metrics: ["accuracy"],
      });

      const xs = tf.tensor2d([[0.0], [0.2], [0.4], [0.6], [0.8], [1.0]]);
      const ys = tf.tensor2d([[0], [0], [0], [1], [1], [1]]);

      await model.fit(xs, ys, {
        epochs: 50,
        verbose: 0,
      });

      const input = tf.tensor2d([[paymentRate]]);
      const prediction = model.predict(input);
      const score = (await prediction.data())[0];
      input.dispose();
      prediction.dispose();
      model.dispose();

      return Math.round(score * 100);
    } catch (err) {
      console.error("Erreur de prédiction de fiabilité :", err);
      return 50;
    }
  };

  // --- CREER TONTINE ---
  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/tontines", {
        method: "POST",
        headers: {
          "Content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          amount: parseFloat(form.amount),
          frequency: form.frequency,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur inconnue");

      setForm({ name: "", amount: "", frequency: "monthly" });
      fetchTontines();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- SUPPRIMER TONTINE ---
  const handleDelete = async (id) => {
    if (!window.confirm("Confirmer la suppression de la tontine ?")) return;
    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      fetchTontines();
      if (selectedTontine === id) setSelectedTontine(null);
    } catch (err) {
      setError(err.message);
    }
  };

  // --- REJOINDRE TONTINE ---
  const handleJoin = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      fetchTontines();
    } catch (err) {
      setError(err.message);
    }
  };

  // --- INVITER UTILISATEUR ---
  const handleInvite = async (toUserId) => {
    if (!selectedTontine) {
      setInviteError("Veuillez sélectionner une tontine avant d'envoyer une invitation.");
      return;
    }

    try {
      const res = await fetch(
        `http://localhost:5000/api/tontines/${selectedTontine}/invite`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-type": "application/json",
          },
          body: JSON.stringify({ userId: toUserId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setInviteSuccess("Invitation envoyée avec succès !");
      setInviteError("");
      fetchInvitations();
    } catch (err) {
      setInviteError("Erreur lors de l'envoi de l'invitation : " + err.message);
      setInviteSuccess("");
    }
  };

  // --- ACCEPTER INVITATION ---
  const handleAcceptInvitation = async (invitationId) => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/invitations/${invitationId}/accept`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setInviteSuccess("Invitation acceptée ! Vous avez rejoint la tontine.");
      setInviteError("");
      fetchTontines();
      fetchInvitations();
    } catch (err) {
      setInviteError("Erreur lors de l'acceptation : " + err.message);
      setInviteSuccess("");
    }
  };

  // --- REJETER INVITATION ---
  const handleRejectInvitation = async (invitationId) => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/invitations/${invitationId}/reject`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setInviteSuccess("Invitation rejetée.");
      setInviteError("");
      fetchInvitations();
    } catch (err) {
      setInviteError("Erreur lors du rejet : " + err.message);
      setInviteSuccess("");
    }
  };

  // --- ENVOYER MESSAGE ---
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const res = await fetch(
        `http://localhost:5000/api/tontines/${selectedTontine}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-type": "application/json",
          },
          body: JSON.stringify({ content: newMessage }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setNewMessage("");
      fetchMessages(selectedTontine);
    } catch (err) {
      setError("Erreur envoi message : " + err.message);
    }
  };

  // --- SELECTIONNER TONTINE POUR CHAT ---
  const selectTontine = (tontine) => {
    setSelectedTontine(tontine._id);
    fetchMessages(tontine._id);
    socket.emit("joinTontine", tontine._id);
  };

  // --- CHARGEMENT INITIAL ---
  useEffect(() => {
    fetchTontines();
    fetchUsers();
    fetchInvitations();
    subscribeToPush(); // Demander l'abonnement aux notifications push

    socket.on("message", (data) => {
      if (data.tontine === selectedTontine) {
        setMessages((prev) => [...prev, data]);
      }
    });

    socket.on("invitation", (data) => {
      fetchInvitations();
    });

    return () => {
      socket.off("message");
      socket.off("invitation");
    };
  }, []);

  // --- RECHARGER MESSAGES quand on change de tontine en chat ---
  useEffect(() => {
    if (selectedTontine) fetchMessages(selectedTontine);
  }, [selectedTontine]);

  return (
    <div style={styles.container}>
      {/* === NOTIFICATIONS === */}
      {inviteSuccess && <p style={styles.success}>{inviteSuccess}</p>}
      {inviteError && <p style={styles.error}>{inviteError}</p>}
      {error && <p style={styles.error}>{error}</p>}

      {/* === FORM CREATION TONTINE === */}
      <form onSubmit={handleCreate} style={styles.form}>
        <h2 style={styles.title}>Créer une Tontine</h2>
        <input
          type="text"
          name="name"
          placeholder="Nom de la tontine"
          value={form.name}
          onChange={handleChange}
          required
          style={styles.input}
        />
        <input
          type="number"
          name="amount"
          placeholder="Montant par tour"
          value={form.amount}
          onChange={handleChange}
          required
          style={styles.input}
        />
        <select
          name="frequency"
          value={form.frequency}
          onChange={handleChange}
          style={styles.input}
        >
          {frequencies.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? "Création..." : "Créer"}
        </button>
      </form>

      {/* === LISTE TONTINES === */}
      <div style={styles.list}>
        <h3 style={{ marginBottom: 10 }}>Mes Tontines</h3>
        {tontines.length === 0 && <p>Aucune tontine trouvée.</p>}
        {tontines.map((t) => (
          <div
            key={t._id}
            style={{
              ...styles.card,
              backgroundColor: selectedTontine === t._id ? "#d1e7dd" : "#fff",
              cursor: "pointer",
            }}
            onClick={() => selectTontine(t)}
          >
            <div>
              <strong>{t.name}</strong> - {t.amount} FCFA ({t.frequency})
              <br />
              Admin: {t.admin?.name || "N/A"}
            </div>
            <div style={styles.actions}>
              {t.admin?._id === user._id ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(t._id);
                  }}
                  style={styles.deleteBtn}
                >
                  Supprimer
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJoin(t._id);
                  }}
                  style={styles.joinBtn}
                >
                  Rejoindre
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* === LISTE INVITATIONS RECUES === */}
      <div style={{ marginTop: 40 }}>
        <h3>Invitations reçues</h3>
        {invitations.length === 0 ? (
          <p>Aucune invitation en attente.</p>
        ) : (
          invitations.map((inv) => (
            <div key={inv._id} style={styles.invitationCard}>
              <div>
                Invitation de <strong>{inv.fromUser?.name}</strong> pour la tontine{" "}
                <strong>{inv.tontine?.name}</strong>
              </div>
              <div style={styles.actions}>
                <button
                  onClick={() => handleAcceptInvitation(inv._id)}
                  style={styles.acceptBtn}
                >
                  Accepter
                </button>
                <button
                  onClick={() => handleRejectInvitation(inv._id)}
                  style={styles.rejectBtn}
                >
                  Rejeter
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* === LISTE UTILISATEURS POUR INVITATION === */}
      <div style={{ marginTop: 40 }}>
        <h3>Inviter des utilisateurs</h3>
        {users.length === 0 ? (
          <p>Aucun autre utilisateur trouvé.</p>
        ) : (
          users.map((u) => (
            <div key={u._id} style={styles.userCard}>
              <div>
                {u.name} ({u.email})
                <br />
                Fiabilité :{" "}
                <span
                  style={{
                    color: reliabilityScores[u._id] >= 70 ? "green" : "red",
                  }}
                >
                  {reliabilityScores[u._id] || "Calcul en cours..."}%
                </span>
              </div>
              <button
                onClick={() => handleInvite(u._id)}
                style={styles.inviteBtn}
                disabled={!selectedTontine}
                title={
                  selectedTontine
                    ? "Inviter cet utilisateur"
                    : "Sélectionnez une tontine pour inviter"
                }
              >
                Inviter
              </button>
            </div>
          ))
        )}
      </div>

      {/* === CHAT MESSAGES === */}
      {selectedTontine && (
        <div style={{ marginTop: 40 }}>
          <h3>Chat de la tontine sélectionnée</h3>
          <div style={styles.chatBox}>
            {messages.length === 0 ? (
              <p>Aucun message pour cette tontine.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg._id}
                  style={{
                    ...styles.message,
                    alignSelf: msg.sender._id === user._id ? "flex-end" : "flex-start",
                    backgroundColor: msg.sender._id === user._id ? "#25D366" : "#eee",
                    color: msg.sender._id === user._id ? "white" : "black",
                  }}
                >
                  <small>{msg.sender.name}</small>
                  <p>{msg.content}</p>
                  <small style={{ fontSize: 10 }}>
                    {new Date(msg.timestamp).toLocaleString()}
                  </small>
                </div>
              ))
            )}
          </div>
          <div style={styles.chatInputContainer}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Écrire un message..."
              style={styles.chatInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendMessage();
              }}
            />
            <button onClick={handleSendMessage} style={styles.button}>
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ========== STYLES ==========
const styles = {
  container: {
    padding: "40px 20px",
    maxWidth: "800px",
    margin: "auto",
  },
  form: {
    background: "#fff",
    padding: "25px",
    borderRadius: "10px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
    marginBottom: "30px",
    display: "flex",
    flexDirection: "column",
    gap: "15px",
  },
  title: {
    textAlign: "center",
    color: "#333",
  },
  input: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "16px",
  },
  button: {
    background: "#25D366",
    color: "#fff",
    border: "none",
    padding: "12px",
    borderRadius: "8px",
    fontWeight: "bold",
    fontSize: "16px",
    cursor: "pointer",
  },
  success: {
    color: "green",
    textAlign: "center",
    marginBottom: "10px",
  },
  error: {
    color: "red",
    textAlign: "center",
    marginBottom: "10px",
  },
  list: {
    background: "#fafafa",
    padding: "20px",
    borderRadius: "10px",
  },
  card: {
    background: "#fff",
    border: "1px solid #eee",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  invitationCard: {
    background: "#fff",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    marginBottom: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actions: {
    display: "flex",
    gap: "10px",
  },
  deleteBtn: {
    background: "#e63946",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  joinBtn: {
    background: "#007bff",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  acceptBtn: {
    background: "#25D366",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  rejectBtn: {
    background: "#e63946",
    color: "#fff",
    border: "none",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
  },
  userCard: {
    background: "#fff",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    marginBottom: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  inviteBtn: {
    background: "#FF9900",
    border: "none",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  chatBox: {
    display: "flex",
    flexDirection: "column",
    maxHeight: "300px",
    overflowY: "auto",
    padding: "10px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    backgroundColor: "#f9f9f9",
    marginBottom: "10px",
  },
  message: {
    padding: "8px 12px",
    borderRadius: "15px",
    maxWidth: "70%",
    marginBottom: "8px",
  },
  chatInputContainer: {
    display: "flex",
    gap: "10px",
  },
  chatInput: {
    flexGrow: 1,
    padding: "10px",
    fontSize: "16px",
    borderRadius: "8px",
    border: "1px solid #ccc",
  },
};

export default TontineCreate;
