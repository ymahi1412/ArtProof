// Runs the full ArtProof demo scenario end-to-end on a local Hardhat network:
// register -> first sale -> resale (with royalty split) -> verification -> exhibition record.
//
// Usage:
//   Terminal 1: npx hardhat node
//   Terminal 2: npx hardhat run scripts/demo.js --network localhost

const hre = require("hardhat");
const { ethers } = hre;

function eth(wei) {
  return `${ethers.formatEther(wei)} ETH`;
}

async function main() {
  const [admin, artist, collectorA, collectorB, museum] = await ethers.getSigners();

  console.log("=== 0. Deploying contracts ===");
  const ArtProof = await ethers.getContractFactory("ArtProof");
  const artProof = await ArtProof.deploy(admin.address);
  await artProof.waitForDeployment();

  const ArtProofMarketplace = await ethers.getContractFactory("ArtProofMarketplace");
  const marketplace = await ArtProofMarketplace.deploy(await artProof.getAddress());
  await marketplace.waitForDeployment();

  await (await artProof.connect(admin).setMarketplace(await marketplace.getAddress())).wait();
  console.log("ArtProof:            ", await artProof.getAddress());
  console.log("ArtProofMarketplace: ", await marketplace.getAddress());

  console.log("\n=== 1. Register: artist mints a certificate ===");
  // NOTE: this metadata URI is a placeholder. Real IPFS upload is added in the
  // next project stage — see README "Roadmap" for the plan.
  const metadataURI = "ipfs://bafybeigplaceholdercid/sunset-over-kochi.json";
  const royaltyBps = 750; // 7.5% artist royalty on future resales
  const mintTx = await artProof.connect(artist).mintCertificate(metadataURI, royaltyBps);
  await mintTx.wait();
  const tokenId = 0n;
  console.log(`Artist (${artist.address}) minted certificate #${tokenId}`);
  console.log(`Royalty set to ${royaltyBps / 100}% payable to the artist on future resales`);

  console.log("\n=== 2. First sale: artist transfers directly to Collector A ===");
  const firstSalePrice = ethers.parseEther("2");
  await (await artProof.connect(artist).transferOwnership(collectorA.address, tokenId, firstSalePrice)).wait();
  console.log(`Transferred to Collector A (${collectorA.address}) for ${eth(firstSalePrice)}`);
  console.log("(Direct transfer — artist receives the full amount off-chain/manually; the contract");
  console.log(" just logs that this happened. The royalty split only applies on marketplace resales.)");

  console.log("\n=== 3. Resale: Collector A lists, Collector B buys via the marketplace ===");
  const resalePrice = ethers.parseEther("5");
  await (await artProof.connect(collectorA).approve(await marketplace.getAddress(), tokenId)).wait();
  await (await marketplace.connect(collectorA).listForResale(tokenId, resalePrice)).wait();
  console.log(`Collector A listed certificate #${tokenId} for ${eth(resalePrice)}`);

  const artistBalanceBefore = await ethers.provider.getBalance(artist.address);
  const sellerBalanceBefore = await ethers.provider.getBalance(collectorA.address);

  const buyTx = await marketplace.connect(collectorB).buy(tokenId, { value: resalePrice });
  const receipt = await buyTx.wait();
  const saleEvent = receipt.logs
    .map((log) => {
      try {
        return marketplace.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((parsed) => parsed && parsed.name === "Sale");

  console.log(`Collector B (${collectorB.address}) bought it for ${eth(resalePrice)}`);
  console.log(`  -> Royalty paid to artist:   ${eth(saleEvent.args.royaltyAmount)}`);
  console.log(`  -> Remainder paid to seller: ${eth(saleEvent.args.sellerAmount)}`);

  const artistBalanceAfter = await ethers.provider.getBalance(artist.address);
  const sellerBalanceAfter = await ethers.provider.getBalance(collectorA.address);
  console.log(`  (verified on-chain: artist balance +${eth(artistBalanceAfter - artistBalanceBefore)}, `);
  console.log(`   seller balance +${eth(sellerBalanceAfter - sellerBalanceBefore)})`);

  console.log("\n=== 4. Verification: anyone can look up the artwork, free of charge ===");
  const summary = await artProof.getArtworkSummary(tokenId);
  console.log(`Token #${tokenId}`);
  console.log(`  Current owner: ${summary.currentOwner}`);
  console.log(`  Artist:        ${summary.artist}`);
  console.log(`  Metadata URI:  ${summary.metadataURI}`);
  console.log(`  # of transfers logged: ${summary.numTransfers}`);

  const history = await artProof.getHistory(tokenId);
  console.log("  Full provenance:");
  history.forEach((record, i) => {
    console.log(
      `    [${i}] owner=${record.owner} price=${eth(record.salePrice)} note="${record.note}" at ts=${record.timestamp}`
    );
  });

  console.log("\n=== 5. Exhibition: an authorized museum logs a custody record ===");
  await (await artProof.connect(admin).setInstitutionAuthorization(museum.address, true)).wait();
  console.log(`Admin authorized museum address ${museum.address}`);

  const start = Math.floor(Date.now() / 1000);
  const end = start + 60 * 60 * 24 * 30; // 30-day loan
  await (
    await artProof.connect(museum).logCustody(tokenId, "Kochi Biennale Gallery", "Curator R. Nair", start, end)
  ).wait();

  const exhibitions = await artProof.getExhibitions(tokenId);
  console.log(`Exhibition logged. Total exhibitions on record: ${exhibitions.length}`);
  console.log(`  Institution: ${exhibitions[0].institution}, Custodian: ${exhibitions[0].custodian}`);

  const ownerAfterExhibition = await artProof.ownerOf(tokenId);
  console.log(`Ownership after exhibition log (should be unchanged, still Collector B): ${ownerAfterExhibition}`);
  console.log(`  Matches Collector B: ${ownerAfterExhibition === collectorB.address}`);

  console.log("\n=== Demo complete ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
