# ArtProof

**Blockchain Provenance & Royalty Infrastructure for Physical Art**
KBA (Kerala Blockchain Academy) Blockchain Developer Internship Project

---

## 1. Project Overview

ArtProof gives a physical artwork a permanent, verifiable digital passport on Ethereum.
It addresses two real problems in the physical art market:

- **Fragmented provenance** — ownership history today lives in paper certificates and
  gallery filing cabinets, with no shared source of truth. This makes forged provenance
  and disputed authenticity possible.
- **Unenforced resale royalties** — artists are typically entitled to nothing (or an
  unenforced legal right) when their work resells for a higher price later.

ArtProof mints an ERC-721 "certificate" token per artwork. Every transfer is logged
on-chain as a provenance record. Resales that go through the ArtProof marketplace
contract automatically split payment between the artist (royalty, via EIP-2981) and
the seller, in the same transaction as the ownership transfer — so the royalty payment
is enforced by code, not by hoping a marketplace chooses to honor it. Museums and
galleries can also log exhibition/custody periods without ever changing recorded
ownership.

### On-chain vs. off-chain vs. physical — read this before treating any of it as proof of authenticity

| Layer | What it actually guarantees |
|---|---|
| **On-chain** (token ownership, provenance log, royalty %, exhibition records) | What was recorded, by whom, and when. It does **not** verify that the recorded facts (e.g. "this address is the real artist," "this was the true sale price") are true. |
| **Off-chain** (IPFS metadata — title, description, image) | Content-addressed storage: if the content changes, the address (CID) changes, so tampering is detectable. It does **not** verify that the claims *inside* that metadata are truthful. |
| **Physical artwork** | Linked only by a tag ID field the registering artist chooses to enter. There is no hardware/cryptographic bridge in this MVP — the physical-to-digital link is asserted, not proven. |

ArtProof is a working prototype/MVP, **not** a legally binding art registry, and ERC-721
ownership of the token is not the same thing as legal ownership of the physical object.

---

## 2. Team Members

- Mahi Yadav — Blockchain Developer Intern, Kerala Blockchain Academy

---

## 3. Current Implementation Status

This is being built in stages. As of this submission:

**✅ Implemented and tested**
- `ArtProof.sol` — ERC-721 certificate contract: minting, EIP-2981 royalty, on-chain
  provenance log, exhibition/custody log, access control.
- `ArtProofMarketplace.sol` — resale contract with automatic on-chain royalty/seller
  payment split, reentrancy protection, stale-listing and approval-revocation checks.
- Full Hardhat test suite (deployment, minting, transfers, resale, royalty math,
  exhibition records, access control, invalid inputs, and a dedicated reentrancy-attack
- Deployed live on Sepolia public testnet:
  - ArtProof: `0xc82ee9D616F9a22387D1B47Aace2f4B8bb9750bc`
  - ArtProofMarketplace: `0x174597CC27DdD8A3ddec7b552555132Fe625332a`
  - View on Etherscan: 
https://sepolia.etherscan.io/address/0xc82ee9D616F9a22387D1B47Aace2f4B8bb9750bc
  test) — see `test/`.
- Local deployment script (`scripts/deploy.js`) and an end-to-end scripted demo
  (`scripts/demo.js`) that walks through the entire workflow on a local Hardhat node.

**🚧 Roadmap / not yet built (planned next)**
- React frontend (Home, Connect Wallet, Artist Dashboard, Register Artwork, Artwork
  Details, Marketplace, Verification, Ownership History, Exhibition/Custody pages).
- Real IPFS upload flow for metadata + images (currently the demo script uses a
  placeholder `ipfs://` URI to keep the contract layer testable independently of an
  IPFS pinning step).
- Public Sepolia testnet deployment + Etherscan verification.

This staged approach — proving the contract layer works correctly first, with
real automated tests, before building the UI on top of it — is intentional: it
means the hardest-to-get-right part (money movement and access control) is the
most rigorously verified part.

---

## 4. Architecture

```
                 MetaMask (wallet)
                        │
              Ethers.js (frontend, upcoming)
                        │
        ┌───────────────┴────────────────┐
        │                                 │
  ArtProof.sol                  ArtProofMarketplace.sol
  (ERC-721 + EIP-2981            (listings, payment
   + provenance + exhibitions)    splitting, reentrancy guard)
        │
   IPFS (metadata + images, upcoming)

Deployment targets: local Hardhat network (now) → Sepolia public testnet (later)
```

No backend server or database is used — the blockchain plus IPFS are the only
sources of truth, which keeps the architecture appropriately simple for an
internship-scale MVP.

---

## 5. Prerequisites

- **Node.js v24 (LTS)** — [nodejs.org](https://nodejs.org). Check with `node --version`.
- **npm** (bundled with Node).
- **Git** (to clone/push the repo).
- **MetaMask** browser extension — only needed once we reach the frontend/testnet stage.
- No paid accounts, API keys, or subscriptions are required for anything in this repo.

---

## 6. Installation

```bash
git clone <this-repo-url>
cd ArtProof
npm install
```

This installs Hardhat, OpenZeppelin Contracts, ethers.js, and the Hardhat testing
toolchain (all free, open-source packages).

---

## 7. Configuration

Local development and testing need **no configuration at all** — skip this section
until you actually want to deploy to the Sepolia public testnet.

For Sepolia deployment only:

```bash
cp .env.example .env
```

Then fill in `.env`:
- `PRIVATE_KEY` — private key of a throwaway MetaMask wallet funded with free Sepolia
  faucet ETH (never your real wallet's key).
- `SEPOLIA_RPC_URL` — optional; a free public RPC is already configured as a default
  in `hardhat.config.js`, no signup required.
- `ETHERSCAN_API_KEY` — optional, only needed for `npx hardhat verify`.

`.env` is git-ignored and is never committed.

---

## 8. How to Run and Test

**Compile the contracts:**
```bash
npx hardhat compile
```

**Run the full automated test suite:**
```bash
npx hardhat test
```
This runs every test in `test/ArtProof.test.js` and `test/ArtProofMarketplace.test.js`
— deployment, minting, ownership transfer, resale royalty math, exhibition logging,
access control on every restricted function, invalid-input handling, and a simulated
reentrancy attack against the marketplace.

**Run the end-to-end demo on a local blockchain (recommended way to "see it work"):**

Terminal 1 — start a local Ethereum node:
```bash
npx hardhat node
```
Leave this running. It gives you 20 test accounts pre-funded with fake ETH.

Terminal 2 — deploy and run the scripted demo:
```bash
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/demo.js --network localhost
```
`demo.js` walks through the entire ArtProof workflow end-to-end and prints each step:
register → first sale → resale with automatic royalty split → verification →
exhibition/custody logging — using Hardhat's built-in test accounts to play the roles
of artist, Collector A, Collector B, and a museum.

**(Optional, later) Deploy to the free Sepolia public testnet:**
```bash
npx hardhat run scripts/deploy.js --network sepolia
```
Requires `.env` to be filled in as described above, and free faucet Sepolia ETH in
the deploying wallet (e.g. from the [Google Cloud Sepolia faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)
or [Sepolia PoW faucet](https://sepolia-faucet.pk910.de/)).

---

## 9. Smart Contract Reference

### `ArtProof.sol`
| Function | Who can call | What it does |
|---|---|---|
| `mintCertificate(uri, royaltyBps)` | Anyone | Mints a new certificate; caller becomes the artist of record |
| `transferOwnership(to, tokenId, salePrice)` | Current token owner | Direct transfer (e.g. artist's first sale), logs provenance |
| `marketplaceTransfer(from, to, tokenId, salePrice)` | Registered marketplace contract only | Moves the token as part of a marketplace-settled resale |
| `getHistory(tokenId)` | Anyone (free, read-only) | Full provenance log |
| `getExhibitions(tokenId)` | Anyone (free, read-only) | Full exhibition/custody log |
| `logCustody(tokenId, institution, custodian, start, end)` | Authorized institutions only | Records a loan/exhibition period; does **not** change `ownerOf(tokenId)` |
| `setMarketplace`, `setInstitutionAuthorization`, `transferAdmin` | Admin only | Configuration |

### `ArtProofMarketplace.sol`
| Function | Who can call | What it does |
|---|---|---|
| `listForResale(tokenId, price)` | Token owner (with marketplace approved) | Creates a fixed-price listing |
| `cancelListing(tokenId)` | Listing's seller | Cancels a listing |
| `buy(tokenId)` payable | Anyone, paying the exact listed price | Splits payment (royalty → artist, remainder → seller) and transfers the NFT atomically |

---

## 10. Security Notes

- **Reentrancy:** `buy()` uses OpenZeppelin's `ReentrancyGuard` and follows
  checks-effects-interactions (the listing is deleted before any external call/payment).
  Verified with a dedicated attack-simulation test (`MaliciousSeller` in
  `contracts/test/`, used only in tests, not deployed as part of the app).
- **Access control:** minting is intentionally open (see Project Overview), but
  admin actions, institution custody logging, and marketplace-only token movement are
  all gated by explicit `require` checks, tested for both the allowed and denied paths.
- **Royalty bounds:** royalty basis points are capped at `MAX_ROYALTY_BPS` (10%) at
  mint time, preventing an unreasonable or malicious royalty value.
- **Payment math:** the marketplace clamps royalty amount to never exceed the sale
  price, so a payout can never send more ETH than the contract received.
- **EIP-2981 accuracy note:** EIP-2981 only lets a token *signal* its royalty terms.
  It does not force any marketplace to honor them — the actual payment enforcement
  here comes from `ArtProofMarketplace.sol`'s own logic, which is a deliberate design
  choice specific to this project, not a property of the ERC-2981 standard itself.

---

## 11. Project Structure

```
ArtProof/
├── contracts/
│   ├── ArtProof.sol                 # ERC-721 certificate + provenance + exhibitions
│   ├── ArtProofMarketplace.sol      # Resale + royalty split + reentrancy guard
│   └── test/
│       └── MaliciousSeller.sol      # Test-only contract used to prove reentrancy protection
├── scripts/
│   ├── deploy.js                    # Deploys + wires up both contracts
│   └── demo.js                      # Scripted end-to-end workflow demo
├── test/
│   ├── ArtProof.test.js
│   └── ArtProofMarketplace.test.js
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

---

## 12. License

MIT
