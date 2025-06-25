import React, { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { useParams } from "react-router-dom";

const TontineChat = () => {
  const { user } = useContext(AuthContext);
  const { tontineId } = useParams();
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

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
      setMessages((prev) => [...prev, data]); // Optimiste
    } catch (err) {
      setError("Erreur d’envoi du message");
      console.error(err.message);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000); // Rafraîchissement toutes les 5s
    return () => clearInterval(interval);
  }, [tontineId]);

  return (
    <div style={styles.container}>
      <h3>💬 Discussion Tontine</h3>
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
        />
        <button onClick={handleSend} style={styles.sendButton}>
          Envoyer
        </button>
      </div>
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
};

export default TontineChat;
