// service-worker.js
self.addEventListener("push", (event) => {
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon.png", // Optionnel : ajoutez une icône dans /public
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("/tontine") // Redirige vers la page des tontines
  );
});
