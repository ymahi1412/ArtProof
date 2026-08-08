# ArtProof Frontend

React + Vite + ethers.js. Talks directly to the ArtProof contracts on-chain —
no backend server.

## Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Then edit `.env` and add your free Pinata JWT (see the setup steps in the comment
at the top of `src/utils/ipfs.js` — takes about 2 minutes, no credit card needed).

```bash
npm run dev
```

Opens at `http://localhost:5173`. You'll need MetaMask installed, connected to
either **Sepolia** (already deployed, works immediately) or **Hardhat Local**
(needs the addresses filled in first, see below).

## Connecting to a network

Contract addresses live in `src/utils/contracts.js`, in the `DEPLOYMENTS` object,
keyed by chain ID:

- `11155111` (Sepolia) — already filled in, points at the live deployment.
- `31337` (Hardhat Local) — **you must fill this in yourself** every time you
  restart `npx hardhat node`, since local deployments get fresh addresses each
  time. Run `npx hardhat run scripts/deploy.js --network localhost` from the
  project root, copy the two printed addresses, and paste them into
  `DEPLOYMENTS[31337]` in `contracts.js`.

If MetaMask is on a network other than these two, the Navbar shows "Unsupported
network" and contract reads/writes will fail — switch networks in MetaMask.

## How it's organized

- `src/hooks/useWallet.jsx` — MetaMask connection state (account, chainId,
  signer), exposed app-wide via React context. Every page reads wallet state
  from `useWallet()`, never from `window.ethereum` directly.
- `src/utils/contracts.js` — contract addresses, ABIs, and factory functions
  (`getArtProofContract`, `getMarketplaceContract`) that return ready-to-use
  ethers.js `Contract` instances for the current network.
- `src/components/ArtworkPanel.jsx` — shared read-only artwork display
  (summary, provenance, exhibitions), reused by both the Verify and Artwork
  Details pages so there's one place that owns "how we display a token."
- `src/pages/` — one file per route, matching the pages listed in the project
  spec (Home, Register, Dashboard, Marketplace, Verify, Artwork Details).

## Status of each page

| Page | Status |
|---|---|
| Home | Done |
| Verify | Done — free, read-only, no wallet required |
| Artwork Details | Done — includes exhibition-logging form for authorized institutions |
| Register | Done — real IPFS upload (image + JSON metadata) via Pinata's free tier, then mints on-chain |
| Dashboard | Working — reconstructs owned/created tokens from on-chain events (see comment in `Dashboard.jsx` for why) |
| Marketplace | Working — list-for-resale + buy flow, listings reconstructed from events |

The main remaining gap is called out in a code comment:
1. **Event-scanning performance** on a long-lived deployment — Dashboard/Marketplace
   scan from block 0, which is fine for this fresh deployment but wouldn't scale
   to a mainnet contract with years of history (would need a fromBlock cutoff or
   a proper indexer at that point — out of scope for this MVP).
2. **Client-side IPFS key exposure** — since there's no backend, the Pinata JWT is
   visible in browser devtools. Fine for a scoped, free-tier demo key on a student
   project; a real production app would proxy uploads through a backend instead.
   See the comment at the top of `src/utils/ipfs.js` for detail.
