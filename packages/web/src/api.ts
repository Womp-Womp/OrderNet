import type { OrderNetNode, PlainMessage, OrderNetEvent } from '@ordernet/core';
import type { WebSocket } from '@fastify/websocket';

interface WsMessage {
  type: string;
  [key: string]: any;
}

export class WebSocketBridge {
  private clients = new Set<WebSocket>();

  constructor(private node: OrderNetNode) {
    this.setupNodeEvents();
  }

  private setupNodeEvents(): void {
    this.node.on('event', (event: OrderNetEvent) => {
      switch (event.type) {
        case 'message':
          this.broadcast({
            type: 'message',
            message: serializePlainMessage(event.message),
          });
          break;
        case 'peer-joined':
          this.broadcast({ type: 'peer_joined', pubKey: event.pubKey, nickname: event.nickname });
          break;
        case 'peer-left':
          this.broadcast({ type: 'peer_left', pubKey: event.pubKey });
          break;
        case 'join-request':
          this.broadcast({
            type: 'join_request',
            channelId: event.request.channelId,
            requesterPubKey: Buffer.from(event.request.requesterPubKey).toString('hex'),
          });
          break;
        case 'key-received':
          this.broadcast({ type: 'key_received', channelId: event.channelId });
          break;
      }
    });
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);

    ws.on('message', async (data: Buffer) => {
      try {
        const msg: WsMessage = JSON.parse(data.toString());
        await this.handleClientMessage(ws, msg);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', error: String(err) }));
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    // Send initial state
    const identity = this.node.getIdentity();
    ws.send(JSON.stringify({
      type: 'init',
      identity: {
        nickname: identity.nickname,
        fingerprint: identity.fingerprint,
        pubKeyHex: identity.pubKeyHex,
      },
      channels: this.node.getChannels(),
      peerCount: this.node.getPeerCount(),
    }));
  }

  private async handleClientMessage(ws: WebSocket, msg: WsMessage): Promise<void> {
    switch (msg.type) {
      case 'send_message': {
        const plain = await this.node.sendMessage(msg.channel, msg.content);
        if (plain) {
          // Echo back to sender
          ws.send(JSON.stringify({
            type: 'message',
            message: serializePlainMessage(plain),
          }));
        }
        break;
      }

      case 'join_channel': {
        this.node.createChannel(msg.channel);
        ws.send(JSON.stringify({
          type: 'channel_joined',
          channelId: msg.channel,
          channels: this.node.getChannels(),
        }));
        break;
      }

      case 'leave_channel': {
        this.node.leaveChannel(msg.channel);
        ws.send(JSON.stringify({
          type: 'channel_left',
          channelId: msg.channel,
          channels: this.node.getChannels(),
        }));
        break;
      }

      case 'set_nick': {
        this.node.setNickname(msg.nickname);
        ws.send(JSON.stringify({
          type: 'nick_changed',
          nickname: msg.nickname,
        }));
        break;
      }

      case 'get_history': {
        const history = await this.node.getChannelHistory(msg.channel, msg.limit || 100);
        ws.send(JSON.stringify({
          type: 'history',
          channel: msg.channel,
          messages: history.map(serializePlainMessage),
        }));
        break;
      }

      case 'get_peers': {
        const peers = this.node.getOnlinePeers();
        const peerList: Array<{ pubKey: string; nickname: string }> = [];
        for (const [key, info] of peers) {
          peerList.push({ pubKey: key, nickname: info.nickname });
        }
        ws.send(JSON.stringify({ type: 'peers', peers: peerList }));
        break;
      }

      case 'get_channels': {
        ws.send(JSON.stringify({
          type: 'channels',
          channels: this.node.getChannels(),
        }));
        break;
      }
    }
  }

  private broadcast(data: object): void {
    const json = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(json);
      }
    }
  }
}

function serializePlainMessage(msg: PlainMessage) {
  return {
    content: msg.content,
    senderPubKey: Buffer.from(msg.senderPubKey).toString('hex'),
    senderNick: msg.senderNick,
    timestamp: msg.timestamp,
    channelId: msg.channelId,
    messageId: msg.messageId,
  };
}
