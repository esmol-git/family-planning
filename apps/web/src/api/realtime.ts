import { io, type Socket } from 'socket.io-client';
import { getStoredToken } from './client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export type FamilyRealtimePayload = {
  familyId: string;
  action?: string;
  at: string;
};

type Handlers = {
  onEventsChanged?: (payload: FamilyRealtimePayload) => void;
  onMembersChanged?: (payload: FamilyRealtimePayload) => void;
  onCategoriesChanged?: (payload: FamilyRealtimePayload) => void;
  onFamilyChanged?: (payload: FamilyRealtimePayload) => void;
  onNotificationNew?: (payload: unknown) => void;
};

let socket: Socket | null = null;
let joinedFamilyId: string | null = null;
let handlers: Handlers = {};

function bindHandlers(s: Socket) {
  s.off('events:changed');
  s.off('members:changed');
  s.off('categories:changed');
  s.off('family:changed');
  s.off('notification:new');

  s.on('events:changed', (payload: FamilyRealtimePayload) => {
    handlers.onEventsChanged?.(payload);
  });
  s.on('members:changed', (payload: FamilyRealtimePayload) => {
    handlers.onMembersChanged?.(payload);
  });
  s.on('categories:changed', (payload: FamilyRealtimePayload) => {
    handlers.onCategoriesChanged?.(payload);
  });
  s.on('family:changed', (payload: FamilyRealtimePayload) => {
    handlers.onFamilyChanged?.(payload);
  });
  s.on('notification:new', (payload: unknown) => {
    handlers.onNotificationNew?.(payload);
  });
}

export function setRealtimeHandlers(next: Handlers) {
  handlers = { ...handlers, ...next };
  if (socket) bindHandlers(socket);
}

export function connectRealtime(token = getStoredToken()) {
  if (!token) {
    disconnectRealtime();
    return null;
  }

  if (socket?.connected) {
    return socket;
  }

  if (socket) {
    socket.auth = { token };
    socket.connect();
    return socket;
  }

  socket = io(`${API_URL}/realtime`, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  bindHandlers(socket);

  socket.on('connect', () => {
    if (joinedFamilyId) {
      socket?.emit('family:join', { familyId: joinedFamilyId });
    }
  });

  return socket;
}

export function joinFamilyRoom(familyId: string) {
  joinedFamilyId = familyId;
  const s = connectRealtime();
  if (!s) return;
  if (s.connected) {
    s.emit('family:join', { familyId });
  }
}

export function leaveFamilyRoom() {
  if (joinedFamilyId && socket?.connected) {
    socket.emit('family:leave', { familyId: joinedFamilyId });
  }
  joinedFamilyId = null;
}

export function disconnectRealtime() {
  leaveFamilyRoom();
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function isRealtimeConnected() {
  return Boolean(socket?.connected);
}
