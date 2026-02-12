// @ts-nocheck
const state = {
  identity: null,
  channels: [],
  currentChannel: 'general',
  messages: new Map(),
  peers: [],
  peerCount: 0,
};

let ws;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.onopen = () => {
    addSystemMessage('Connected to OrderNet');
  };

  ws.onclose = () => {
    addSystemMessage('Disconnected. Reconnecting...');
    setTimeout(connect, 3000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
  };
}

function handleServerMessage(data) {
  switch (data.type) {
    case 'init':
      state.identity = data.identity;
      state.channels = data.channels;
      state.peerCount = data.peerCount;
      if (state.channels.length > 0 && !state.channels.find(c => c.id === state.currentChannel)) {
        state.currentChannel = state.channels[0].id;
      }
      send({ type: 'get_history', channel: state.currentChannel });
      render();
      break;

    case 'message':
      addMessage(data.message.channelId, data.message);
      break;

    case 'history':
      state.messages.set(data.channel, data.messages);
      render();
      break;

    case 'peer_joined':
      state.peerCount++;
      state.peers.push({ pubKey: data.pubKey, nickname: data.nickname });
      addSystemMessage(`${data.nickname} joined`);
      break;

    case 'peer_left':
      state.peerCount--;
      state.peers = state.peers.filter(p => p.pubKey !== data.pubKey);
      render();
      break;

    case 'channel_joined':
      state.channels = data.channels;
      state.currentChannel = data.channelId;
      send({ type: 'get_history', channel: data.channelId });
      render();
      break;

    case 'channel_left':
      state.channels = data.channels;
      if (state.channels.length > 0) {
        state.currentChannel = state.channels[0].id;
      }
      render();
      break;

    case 'peers':
      state.peers = data.peers;
      render();
      break;

    case 'nick_changed':
      if (state.identity) state.identity.nickname = data.nickname;
      addSystemMessage(`Nickname changed to ${data.nickname}`);
      break;

    case 'channels':
      state.channels = data.channels;
      render();
      break;
  }
}

function send(data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function addMessage(channelId, msg) {
  const msgs = state.messages.get(channelId) || [];
  msgs.push(msg);
  state.messages.set(channelId, msgs);
  render();
  scrollToBottom();
}

function addSystemMessage(content) {
  const msgs = state.messages.get(state.currentChannel) || [];
  msgs.push({ content, system: true, timestamp: Date.now() });
  state.messages.set(state.currentChannel, msgs);
  render();
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.messages');
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function switchChannel(channelId) {
  state.currentChannel = channelId;
  send({ type: 'get_history', channel: channelId });
  render();
}

function handleInput(value) {
  if (value.startsWith('/')) {
    handleCommand(value);
  } else {
    send({
      type: 'send_message',
      channel: state.currentChannel,
      content: value,
    });
  }
}

function handleCommand(input) {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'join': {
      const name = args[0];
      if (!name) { addSystemMessage('Usage: /join #channel'); return; }
      const id = name.startsWith('#') ? name.slice(1) : name;
      send({ type: 'join_channel', channel: id });
      break;
    }
    case 'leave': {
      const name = args[0] || state.currentChannel;
      const id = name.startsWith('#') ? name.slice(1) : name;
      send({ type: 'leave_channel', channel: id });
      break;
    }
    case 'nick': {
      const nick = args[0];
      if (!nick) { addSystemMessage('Usage: /nick <name>'); return; }
      send({ type: 'set_nick', nickname: nick });
      break;
    }
    case 'peers':
      send({ type: 'get_peers' });
      break;
    case 'help':
      addSystemMessage(
        'Commands: /join #ch, /leave, /nick <name>, /peers, /help'
      );
      break;
    default:
      addSystemMessage(`Unknown command: /${cmd}`);
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function render() {
  const app = document.getElementById('app');
  const currentMessages = state.messages.get(state.currentChannel) || [];
  const ch = state.channels.find(c => c.id === state.currentChannel);
  const channelName = ch ? ch.name : '';

  app.innerHTML = `
    <div class="header">
      <h1>OrderNet</h1>
      ${state.identity ? `<span class="identity">${state.identity.nickname} | ${state.identity.fingerprint}</span>` : ''}
    </div>
    <div class="main">
      <div class="sidebar-left">
        <h2>Channels</h2>
        ${state.channels.map(ch => `
          <div class="channel-item ${ch.id === state.currentChannel ? 'active' : ''}"
               onclick="window.__switchChannel('${ch.id}')">
            ${ch.name}
          </div>
        `).join('')}
        <div class="join-input">
          <input type="text" id="join-input" placeholder="#channel" />
          <button onclick="window.__joinChannel()">+</button>
        </div>
      </div>
      <div class="chat-area">
        <div class="channel-header">${channelName || 'No channel'}</div>
        <div class="messages">
          ${currentMessages.map(msg => {
            if (msg.system) {
              return `<div class="message system">* ${escapeHtml(msg.content)}</div>`;
            }
            return `<div class="message">
              <span class="time">[${formatTime(msg.timestamp)}]</span>
              <span class="nick">&lt;${escapeHtml(msg.senderNick)}&gt;</span>
              ${escapeHtml(msg.content)}
            </div>`;
          }).join('')}
        </div>
        <div class="input-area">
          <input type="text" id="msg-input" placeholder="Type a message... (/help for commands)"
                 onkeydown="if(event.key==='Enter')window.__sendMessage()" />
        </div>
      </div>
      <div class="sidebar-right">
        <h2>Users</h2>
        ${state.identity ? `<div class="member-item me">* ${escapeHtml(state.identity.nickname)}</div>` : ''}
        ${state.peers.map(p => `
          <div class="member-item">${escapeHtml(p.nickname)}</div>
        `).join('')}
      </div>
    </div>
    <div class="status-bar">
      <span class="peers">peers: ${state.peerCount}</span>
      <span class="fingerprint">${state.identity ? state.identity.fingerprint : '...'}</span>
    </div>
  `;

  const input = document.getElementById('msg-input');
  if (input) input.focus();

  scrollToBottom();
}

window.__switchChannel = switchChannel;
window.__sendMessage = () => {
  const input = document.getElementById('msg-input');
  if (input.value.trim()) {
    handleInput(input.value.trim());
    input.value = '';
  }
};
window.__joinChannel = () => {
  const input = document.getElementById('join-input');
  if (input.value.trim()) {
    const name = input.value.trim();
    const id = name.startsWith('#') ? name.slice(1) : name;
    send({ type: 'join_channel', channel: id });
    input.value = '';
  }
};

connect();
