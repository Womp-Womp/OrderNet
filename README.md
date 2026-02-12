# OrderNet

Encrypted, local-first, IRC-style P2P chat with CLI and web clients.

This repository is a Node.js monorepo:
- `packages/core`: libp2p node, crypto, trust, and local SQLite storage
- `packages/cli`: terminal client
- `packages/web`: Fastify + WebSocket web UI

## Current Status

- Upstream tracked: `https://github.com/Womp-Womp/OrderNet`
- Local storage is on your machine (`~/.ordernet/ordernet.db` by default)
- Peer discovery is **manual-first** by default (mDNS is off unless enabled)
- The "always-on server" is your own node on your own machine at startup; peers run their own nodes.
- Web UI now groups channels into:
  - Public
  - Private/DM (invite-only channels)
  - Both groups are collapsible in the sidebar

## Prerequisites

- Node.js `>=20`
- npm `>=10`
- Git

## Quick Setup

### PowerShell (Windows)

```powershell
.\scripts\setup.ps1 -Target all
```

Optional: install global CLI command (`ordernet`):

```powershell
.\scripts\setup.ps1 -Target cli -InstallCli
```

### Bash (Linux/macOS)

```bash
chmod +x ./scripts/setup.sh ./scripts/run-web.sh
./scripts/setup.sh all
```

Optional: install global CLI command:

```bash
INSTALL_CLI=1 ./scripts/setup.sh cli
```

## Running

### Web server

```powershell
npm run start --workspace @ordernet/web -- --http-port 3000 --port 7001 --nick alice
```

Open `http://localhost:3000`.

### CLI

```powershell
npm run start --workspace @ordernet/cli -- --port 7001 --nick alice
```

## Manual Address Sharing (Recommended)

OrderNet now defaults to manual peer bootstrap:
1. Start node A and copy one of its printed multiaddrs.
2. Start node B with `--bootstrap <multiaddr>`.
3. Repeat for every node that should connect.

Example:

```powershell
npm run start --workspace @ordernet/web -- --port 7002 --nick bob --bootstrap "/ip4/192.168.1.10/tcp/7001/p2p/12D3KooW..."
```

If you want LAN auto-discovery, add `--mdns`.

## Auto-Update Web Start

### PowerShell

```powershell
.\scripts\run-web.ps1 -AutoUpdate -HttpPort 3000 -P2pPort 7001 -Nickname alice
```

Add one or more manually shared peers:

```powershell
.\scripts\run-web.ps1 -AutoUpdate -BootstrapPeers "/ip4/192.168.1.10/tcp/7001/p2p/12D3KooW..." ,"/ip4/192.168.1.11/tcp/7001/p2p/12D3KooZ..."
```

### Bash

```bash
AUTO_UPDATE=1 HTTP_PORT=3000 P2P_PORT=7001 NICKNAME=alice ./scripts/run-web.sh
```

With peers:

```bash
AUTO_UPDATE=1 BOOTSTRAP_PEERS="/ip4/192.168.1.10/tcp/7001/p2p/12D3...,/ip4/192.168.1.11/tcp/7001/p2p/12D3..." ./scripts/run-web.sh
```

`AutoUpdate`/`AUTO_UPDATE=1` runs on startup only.

## Private Access Rules

Private access is now enforced in core policy:
- Public channels: open local creation and messaging
- Private group channels: invite-only allowlist
- DM channels: invite-only allowlist between 2 peers
- Messages from non-allowed senders are rejected

Create private group:

```text
/private #team <peerPubKeyHex1>,<peerPubKeyHex2>
```

Invite a peer to an existing channel:

```text
/invitepeer <peerPubKeyHex> [#channel]
```

Generate a portable invite code (share manually out-of-band):

```text
/invitecode [#channel]
```

Accept an invite code:

```text
/accept <invite-code>
```

Create/open DM:

```text
/dm <peerPubKeyHex>
```

## Channel Organization in Web UI

- Public channels: default list
- Private channels: channels with `accessMode=private|dm` or `inviteOnly=true`
- Both sections are collapsible in the left sidebar

## CLI Commands

- `/join #channel`
- `/private #group pub1,pub2`
- `/invitepeer <pubkey> [#channel]`
- `/invitecode [#channel]`
- `/accept <invite-code>`
- `/dm <peer-pubkey-hex>`
- `/leave [#channel]`
- `/nick <name>`
- `/vouch <pubkey>`
- `/members`
- `/trust`
- `/invite`
- `/channels`
- `/peers`
- `/help`

## Data and Privacy Notes

- Data is local by default in `~/.ordernet/ordernet.db`
- No central server is required for message storage
- Address sharing is manual unless `--mdns` is explicitly enabled
