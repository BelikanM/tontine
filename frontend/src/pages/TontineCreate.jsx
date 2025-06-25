import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

const TontineCreate = () => {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    amount: "",
    frequency: "monthly",
  });

  const [tontines, setTontines] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const frequencies = [
    { value: "daily", label: "Quotidienne" },
    { value: "weekly", label: "Hebdomadaire" },
    { value: "monthly", label: "Mensuelle" },
  ];

  const token = localStorage.getItem("token");

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const fetchTontines = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/tontines", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTontines(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Erreur de récupération :", err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data.filter(u => u._id !== user._id) : []);
    } catch (err) {
      console.error("Erreur de récupération des utilisateurs :", err);
    }
  };

  useEffect(() => {
    fetchTontines();
    fetchUsers();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/tontines", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

  const handleDelete = async (id) => {
    if (!window.confirm("Confirmer la suppression de la tontine ?")) return;
    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchTontines();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleJoin = async (id) => {
    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      fetchTontines();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleInvite = async (receiverId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/invitations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ receiverId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      alert("Invitation envoyée !");
    } catch (err) {
      alert("Erreur lors de l'envoi de l'invitation : " + err.message);
    }
  };

  return (
    <div style={styles.container}>
      <form onSubmit={handleCreate} style={styles.form}>
        <h2 style={styles.title}>Créer une Tontine</h2>
        {error && <p style={styles.error}>{error}</p>}

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

      <div style={styles.list}>
        <h3 style={{ marginBottom: 10 }}>Mes Tontines</h3>
        {tontines.length === 0 && <p>Aucune tontine trouvée.</p>}

        {tontines.map((t) => (
          <div key={t._id} style={styles.card}>
            <div>
              <strong>{t.name}</strong> - {t.amount} FCFA ({t.frequency})
              <br />
              Admin: {t.admin?.name || "N/A"}
            </div>
            <div style={styles.actions}>
              {t.admin?._id === user._id ? (
                <button onClick={() => handleDelete(t._id)} style={styles.deleteBtn}>
                  Supprimer
                </button>
              ) : (
                <button onClick={() => handleJoin(t._id)} style={styles.joinBtn}>
                  Rejoindre
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40 }}>
        <h3>Utilisateurs inscrits</h3>
        {users.length === 0 ? (
          <p>Aucun autre utilisateur trouvé.</p>
        ) : (
          users.map((u) => (
            <div key={u._id} style={styles.userCard}>
              {u.name} ({u.email})
              <button onClick={() => handleInvite(u._id)} style={styles.inviteBtn}>
                Inviter
              </button>
            </div>
          ))
        )}
      </div>
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
  error: {
    color: "red",
    textAlign: "center",
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
  userCard: {
    background: "#fff",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    marginBottom: "10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inviteBtn: {
    background: "#FF9900",
    border: "none",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default TontineCreate;
