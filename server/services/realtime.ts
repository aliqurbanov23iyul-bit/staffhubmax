import type { Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { computeBreakTiming, formatOverdueAlertMessage } from '../core/breaks';
import type { AppNotification, UserRole } from '../core/types';
import { store } from '../database/store';
import {
  parseCookies,
  resolveSessionFromToken,
  SESSION_COOKIE_NAME,
} from '../middleware/auth';

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  role: UserRole;
  displayName: string;
}

class RealtimeService {
  private wss: WebSocketServer | null = null;
  private clients = new Set<ConnectedClient>();
  private breakMonitorInterval: NodeJS.Timeout | null = null;

  public init(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url || '/ws', 'http://localhost');
      const queryToken = url.searchParams.get('token');
      const cookies = parseCookies(req.headers.cookie);
      const token = queryToken || cookies[SESSION_COOKIE_NAME] || null;
      const resolved = resolveSessionFromToken(token);

      if (!resolved) {
        ws.close(4001, 'Yetkisiz bağlantı');
        return;
      }

      const client: ConnectedClient = {
        ws,
        userId: resolved.user.id,
        role: resolved.user.role,
        displayName: resolved.user.displayName,
      };
      this.clients.add(client);
      this.broadcastPresence();

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg?.type === 'chat:typing' && typeof msg.channelId === 'string') {
            this.broadcastAll('chat:typing', {
              channelId: msg.channelId,
              userId: client.userId,
              displayName: client.displayName,
            });
          }
        } catch {
          // Ignore malformed WS payloads
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
        this.broadcastPresence();
      });
    });

    // Periodic break checker (runs every 15s) for overdue & break-due alerts
    this.breakMonitorInterval = setInterval(() => {
      this.checkBreaksAndNotify();
    }, 15_000);
  }

  public getOnlineUserIds(): string[] {
    const set = new Set<string>();
    for (const c of this.clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        set.add(c.userId);
      }
    }
    return Array.from(set);
  }

  public broadcastPresence(): void {
    this.broadcastAll('presence:update', {
      onlineUserIds: this.getOnlineUserIds(),
    });
  }

  public broadcastAll(event: string, payload: unknown): void {
    const serialized = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (const c of this.clients) {
      if (c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(serialized);
      }
    }
  }

  public sendToUser(userId: string, event: string, payload: unknown): void {
    const serialized = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (const c of this.clients) {
      if (c.userId === userId && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(serialized);
      }
    }
  }

  public sendToRoles(roles: UserRole[], event: string, payload: unknown): void {
    const serialized = JSON.stringify({ event, payload, timestamp: new Date().toISOString() });
    for (const c of this.clients) {
      if (roles.includes(c.role) && c.ws.readyState === WebSocket.OPEN) {
        c.ws.send(serialized);
      }
    }
  }

  public pushNotification(notification: AppNotification): void {
    store.notifications.unshift(notification);
    if (store.notifications.length > 600) store.notifications.length = 600;
    this.sendToUser(notification.userId, 'notification:new', notification);
  }

  private checkBreaksAndNotify(): void {
    const now = new Date();
    for (const session of store.breakSessions) {
      const timing = computeBreakTiming(session, now);
      if (timing.isOverdue && !session.overdueAlertSent && session.status !== 'Tamamlandı') {
        session.status = 'Gecikti';
        session.overdueAlertSent = true;
        const alertMsg = formatOverdueAlertMessage(session, timing);

        // Notify the employee
        this.pushNotification({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: session.userId,
          type: 'break_overdue',
          title: 'Mola Süreniz Doldu!',
          description: `${session.breakNumber}. Mola süreniz aşıldı. Lütfen molanızı sonlandırın.`,
          linkPage: 'breaks',
          linkEntityId: session.id,
          isRead: false,
          createdAt: now.toISOString(),
        });

        // Notify admins
        const admins = store.users.filter((u) =>
          ['Super Admin', 'İşlem Admini', 'Takım Lideri'].includes(u.role),
        );
        for (const admin of admins) {
          this.pushNotification({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: admin.id,
            type: 'break_overdue',
            title: 'MOLA SÜRESİ AŞILDI',
            description: alertMsg,
            linkPage: 'break-control',
            linkEntityId: session.id,
            isRead: false,
            createdAt: now.toISOString(),
          });
        }

        this.broadcastAll('break:overdue', { session, timing, message: alertMsg });
      }
    }
  }

  public dispose(): void {
    if (this.breakMonitorInterval) clearInterval(this.breakMonitorInterval);
    this.wss?.close();
  }
}

export const realtime = new RealtimeService();
