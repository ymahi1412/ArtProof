// Deploys ArtProof + ArtProofMarketplace and wires them together.
// Usage:
//   Local:   npx hardhat run scripts/deploy.js --network localhost   (requires `npx hardhat node` running separately)
//   Sepolia: npx hardhat run scripts/deploy.js --network sepolia     (requires PRIVATE_KEY + Sepolia ETH in .env)

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. Deploy the certificate contract. The deployer becomes its admin
  //    (allowed to authorize museums/galleries and to wire up the marketplace).
  const ArtProof = await hre.ethers.getContractFactory("ArtProof");
  const artProof = await ArtProof.deploy(deployer.address);
  await artProof.waitForDeployment();
  const artProofAddress = await artProof.getAddress();
  console.log("ArtProof deployed to:      ", artProofAddress);

  // 2. Deploy the marketplace, pointing it at the certificate contract.
  const ArtProofMarketplace = await hre.ethers.getContractFactory("ArtProofMarketplace");
  const marketplace = await ArtProofMarketplace.deploy(artProofAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("ArtProofMarketplace deployed to:", marketplaceAddress);

  // 3. Authorize the marketplace on ArtProof so it's allowed to call marketplaceTransfer().
  const tx = await artProof.setMarketplace(marketplaceAddress);
  await tx.wait();
  console.log("Marketplace authorized on ArtProof.");

  console.log("\n--- Deployment summary (save these addresses) ---");
  console.log(
    JSON.stringify(
      {
        network: hre.network.name,
        admin: deployer.address,
        artProof: artProofAddress,
        marketplace: marketplaceAddress,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
