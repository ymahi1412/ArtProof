import { ethers } from "ethers";

/**
 * Per-network deployment addresses. Fill in "localhost" after running
 * `npx hardhat run scripts/deploy.js --network localhost` — those addresses
 * change every time you restart the local Hardhat node, so keep this updated
 * during development. The sepolia addresses below are already live.
 */
export const DEPLOYMENTS = {
  // chainId 31337 = Hardhat's local network
  31337: {
    name: "Hardhat Local",
    artProof: "", // <-- paste your local deploy.js output here each time you restart `npx hardhat node`
    marketplace: "", // <-- same
    deployedAtBlock: 0, // local chain always starts fresh at block 0
  },
  // chainId 11155111 = Sepolia public testnet
  11155111: {
    name: "Sepolia",
    artProof: "0xc82ee9D616F9a22387D1B47Aace2f4B8bb9750bc",
    marketplace: "0x174597CC27DdD8A3ddec7b552555132Fe625332a",
    // Block the contracts were actually deployed at. Find it on Etherscan:
    // open the ArtProof address -> "Contract Creation" tx -> the block number shown there.
    // Until it's filled in, getLogsChunked() below just walks back from the current
    // block in safe windows, which still works but does a bit of extra scanning.
    deployedAtBlock: 0,
  },
};

/**
 * eth_getLogs (which queryFilter uses under the hood) is capped at a 10,000-block
 * range by many public RPC endpoints, including MetaMask's own default endpoint
 * ("range XXXXXXX exceeds limit of 10000"). Scanning from block 0 on a live testnet
 * like Sepolia (millions of blocks deep) hits that cap immediately, and ethers'
 * FallbackProvider can't reconcile the resulting per-backend errors, which is what
 * surfaces as "could not coalesce error" in the UI.
 *
 * This walks the range in chunks small enough to stay under that limit.
 */
const LOG_CHUNK_SIZE = 9000;

export async function getLogsChunked(contract, filter, fromBlock, provider) {
  const latest = await provider.getBlockNumber();
  const start = fromBlock ?? 0;
  const allEvents = [];

  for (let chunkStart = start; chunkStart <= latest; chunkStart += LOG_CHUNK_SIZE) {
    const chunkEnd = Math.min(chunkStart + LOG_CHUNK_SIZE - 1, latest);
    const events = await contract.queryFilter(filter, chunkStart, chunkEnd);
    allEvents.push(...events);
  }

  return allEvents;
}

/**
 * Human-readable ABI fragments for the functions/events the frontend actually
 * calls. Kept intentionally minimal (not the full compiler-generated ABI) so
 * it's easy to read and keep in sync with the Solidity source by hand.
 * If you add a new contract function the frontend needs, add its signature here.
 */
export const ART_PROOF_ABI = [
  // Reads
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function originalArtist(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (address receiver, uint256 royaltyAmount)",
  "function getArtworkSummary(uint256 tokenId) view returns (address currentOwner, address artist, string metadataURI, uint256 numTransfers, uint256 numExhibitions)",
  "function getHistory(uint256 tokenId) view returns (tuple(address owner, uint256 timestamp, uint256 salePrice, string note)[])",
  "function getExhibitions(uint256 tokenId) view returns (tuple(string institution, string custodian, uint256 startDate, uint256 endDate, uint256 loggedAt)[])",
  "function authorizedInstitutions(address institution) view returns (bool)",
  "function admin() view returns (address)",
  "function MAX_ROYALTY_BPS() view returns (uint96)",

  // Writes
  "function mintCertificate(string metadataURI, uint96 royaltyBps) returns (uint256)",
  "function transferOwnership(address to, uint256 tokenId, uint256 salePrice)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function logCustody(uint256 tokenId, string institution, string custodian, uint256 startDate, uint256 endDate)",
  "function setInstitutionAuthorization(address institution, bool authorized)",

  // Events
  "event CertificateMinted(uint256 indexed tokenId, address indexed artist, string metadataURI, uint96 royaltyBps)",
  "event OwnershipTransferredWithSale(uint256 indexed tokenId, address indexed from, address indexed to, uint256 salePrice, string note)",
  "event CustodyLogged(uint256 indexed tokenId, string institution, string custodian, uint256 startDate, uint256 endDate)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
];

export const MARKETPLACE_ABI = [
  // Reads
  "function artProof() view returns (address)",
  "function listings(uint256 tokenId) view returns (address seller, uint256 price, bool active)",

  // Writes
  "function listForResale(uint256 tokenId, uint256 price)",
  "function cancelListing(uint256 tokenId)",
  "function buy(uint256 tokenId) payable",

  // Events
  "event Listed(uint256 indexed tokenId, address indexed seller, uint256 price)",
  "event ListingCancelled(uint256 indexed tokenId, address indexed seller)",
  "event Sale(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, address royaltyReceiver, uint256 royaltyAmount, uint256 sellerAmount)",
];

/** Returns the deployment info for a given chainId, or null if we're on an unsupported network. */
export function getDeployment(chainId) {
  return DEPLOYMENTS[chainId] ?? null;
}

/** Builds an ethers.js Contract instance for ArtProof, using the given signer or provider. */
export function getArtProofContract(chainId, signerOrProvider) {
  const deployment = getDeployment(chainId);
  if (!deployment || !deployment.artProof) return null;
  return new ethers.Contract(deployment.artProof, ART_PROOF_ABI, signerOrProvider);
}

/** Builds an ethers.js Contract instance for ArtProofMarketplace, using the given signer or provider. */
export function getMarketplaceContract(chainId, signerOrProvider) {
  const deployment = getDeployment(chainId);
  if (!deployment || !deployment.marketplace) return null;
  return new ethers.Contract(deployment.marketplace, MARKETPLACE_ABI, signerOrProvider);
}

/** Resolves an ipfs:// URI to an HTTP gateway URL so <img> tags / fetch() can load it. */
export function resolveIpfsUri(uri) {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${uri.slice("ipfs://".length)}`;
  }
  return uri;
}

/** Formats a wei BigInt as a short ETH string, e.g. 1500000000000000000n -> "1.5 ETH". */
export function formatEth(wei) {
  return `${ethers.formatEther(wei)} ETH`;
}

/** Formats a unix timestamp (seconds, possibly BigInt) as a readable date string. */
export function formatTimestamp(unixSeconds) {
  const seconds = typeof unixSeconds === "bigint" ? Number(unixSeconds) : unixSeconds;
  if (!seconds) return "—";
  return new Date(seconds * 1000).toLocaleString();
}

/** Shortens an address for display, e.g. 0x1234...abcd */
export function shortenAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
