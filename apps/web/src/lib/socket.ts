import { io, type Socket } from 'socket.io-client';

import { WS_URL } from './config';
import { getGuestToken } from './storage';

let socketRef: Socket | null = null;

export function getSocket(): Socket {
  if (socketRef) {
    return socketRef;
  }

  socketRef = io(WS_URL, {
    path: '/socket.io',
    withCredentials: true,
    transports: ['websocket', 'polling'],
    auth: {
      guestToken: getGuestToken(),
    },
  });

  return socketRef;
}

export function resetSocket(): void {
  if (socketRef) {
    socketRef.disconnect();
    socketRef = null;
  }
}
