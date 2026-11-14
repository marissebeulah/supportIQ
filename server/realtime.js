const clients = new Set();

export function addClient(user, res) {
  const client = { user, res };
  clients.add(client);
  return client;
}

export function removeClient(client) {
  clients.delete(client);
}

export function publish(type, payload = {}, audience = null) {
  const data = JSON.stringify({ type, ...payload, at: new Date().toISOString() });
  let delivered = 0;
  for (const client of clients) {
    if (audience && !audience(client.user)) continue;
    try {
      client.res.write(`data: ${data}\n\n`);
      delivered += 1;
    } catch {
      clients.delete(client);
    }
  }
  return delivered;
}

/** True when the user has at least one open realtime stream. */
export function isUserOnline(userId) {
  for (const client of clients) {
    if (client.user.id === userId) return true;
  }
  return false;
}

export function ticketAudience({ customerId, assigneeId, coAssigneeId = null }) {
  return (user) =>
    user.role === "admin" ||
    user.id === customerId ||
    (assigneeId != null && user.id === assigneeId) ||
    (coAssigneeId != null && user.id === coAssigneeId);
}

export function clientCount() {
  return clients.size;
}
