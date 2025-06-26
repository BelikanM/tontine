import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { useParams } from "react-router-dom";

const TontineChat = () => {
  const { user } = useContext(AuthContext);
  const { tontineId } = useParams();
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  const token = localStorage.getItem("token");

  const fetchMessages = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${tontineId}/messages`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setMessages(data);
    } catch (err) {
      setError("Erreur de chargement des messages");
      console.error(err.message);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      setAvailableUsers(data.filter(u => u._id !== user._id));
    } catch (err) {
      setError("Erreur de chargement des utilisateurs");
      console.error(err.message);
    }
  };

  const handleSend = async () => {
    if (!content.trim()) return;

    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${tontineId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      setContent("");
      setMessages((prev) => [...prev, data]);
    } catch (err) {
      setError("Erreur d'envoi du message");
      console.error(err.message);
    }
  };

  const handleInviteUser = async (userId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/tontines/${tontineId}/invite`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      alert("Invitation envoyée avec succès !");
      setShowInviteModal(false);
    } catch (err) {
      setError("Erreur lors de l'envoi de l'invitation");
      console.error(err.message);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [tontineId]);

  const filteredUsers = availableUsers.filter(user => 
    user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3>💬 Discussion Tontine</h3>
        <button 
          onClick={() => {
            setShowInviteModal(true);
            fetchAvailableUsers();
          }} 
          style={styles.inviteButton}
        >
          Inviter des membres
        </button>
      </div>
      
      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.chatBox}>
        {messages.map((msg) => (
          <div
            key={msg._id}
            style={
              msg.sender._id === user._id ? styles.myMessage : styles.otherMessage
            }
          >
            <strong>{msg.sender.name}:</strong> <br />
            <span>{msg.content}</span>
            <div style={styles.timestamp}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.inputContainer}>
        <input
          type="text"
          placeholder="Écris ton message..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={styles.input}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
        />
        <button onClick={handleSend} style={styles.sendButton}>
          Envoyer
        </button>
      </div>

      {/* Modal d'invitation */}
      {showInviteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3>Inviter des membres</h3>
            <input
              type="text"
              placeholder="Rechercher un utilisateur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
            
            <div style={styles.userList}>
              {filteredUsers.length > 0 ? (
                filteredUsers.map((user) => (
                  <div key={user._id} style={styles.userItem}>
                    <div>
                      <strong>{user.name}</strong>
                      <br />
                      <small>{user.email}</small>
                    </div>
                    <button 
                      onClick={() => handleInviteUser(user._id)} 
                      style={styles.inviteUserButton}
                    >
                      Inviter
                    </button>
                  </div>
                ))
              ) : (
                <p>Aucun utilisateur trouvé</p>
              )}
            </div>
            
            <button 
              onClick={() => setShowInviteModal(false)} 
              style={styles.closeModalButton}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    maxWidth: 600,
    margin: "auto",
    padding: 20,
    background: "#f5f5f5",
    borderRadius: 10,
    position: "relative",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  inviteButton: {
    backgroundColor: "#25D366",
    color: "#fff",
    border: "none",
    padding: "8px 15px",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: "bold",
  },
  chatBox: {
    height: 400,
    overflowY: "scroll",
    padding: 10,
    background: "#fff",
    borderRadius: 10,
    marginBottom: 10,
    border: "1px solid #ddd",
  },
  inputContainer: {
    display: "flex",
    gap: 10,
  },
  input: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ccc",
  },
  sendButton: {
    backgroundColor: "#4caf50",
    color: "#fff",
    border: "none",
    padding: "10px 20px",
    borderRadius: 8,
    cursor: "pointer",
  },
  myMessage: {
    textAlign: "right",
    marginBottom: 10,
    padding: 8,
    background: "#dcf8c6",
    borderRadius: "8px 0 8px 8px",
  },
  otherMessage: {
    textAlign: "left",
    marginBottom: 10,
    padding: 8,
    background: "#f1f0f0",
    borderRadius: "0 8px 8px 8px",
  },
  timestamp: {
    fontSize: "0.75rem",
    color: "#888",
    marginTop: 4,
  },
  error: {
    color: "red",
    textAlign: "center",
  },
  // Modal styles
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 10,
    width: "90%",
    maxWidth: 500,
    maxHeight: "80vh",
    overflowY: "auto",
  },
  searchInput: {
    width: "100%",
    padding: 10,
    margin: "10px 0",
    borderRadius: 8,
    border: "1px solid #ccc",
  },
  userList: {
    margin: "15px 0",
  },
  userItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #eee",
  },
  inviteUserButton: {
    backgroundColor: "#25D366",
    color: "#fff",
    border: "none",
    padding: "5px 10px",
    borderRadius: 5,
    cursor: "pointer",
  },
  closeModalButton: {
    backgroundColor: "#ff4444",
    color: "#fff",
    border: "none",
    padding: "10px 15px",
    borderRadius: 5,
    cursor: "pointer",
    marginTop: 15,
    width: "100%",
  },
};

export default TontineChat;

