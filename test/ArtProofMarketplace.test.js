const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArtProofMarketplace", function () {
  let artProof, marketplace;
  let admin, artist, collectorA, collectorB, stranger;

  const SAMPLE_URI = "ipfs://bafybeigsamplecidforartwork0002/metadata.json";
  const ROYALTY_BPS = 1000; // 10% (the cap), makes split math easy to check
  const PRICE = ethers.parseEther("10");

  async function mintAndTransferToCollectorA() {
    // Artist mints (tokenId 0), then does a direct first sale to collectorA for 5 ETH.
    await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
    await artProof.connect(artist).transferOwnership(collectorA.address, 0, ethers.parseEther("5"));
  }

  beforeEach(async function () {
    [admin, artist, collectorA, collectorB, stranger] = await ethers.getSigners();

    const ArtProof = await ethers.getContractFactory("ArtProof");
    artProof = await ArtProof.deploy(admin.address);
    await artProof.waitForDeployment();
    const artProofAddress = await artProof.getAddress();

    const ArtProofMarketplace = await ethers.getContractFactory("ArtProofMarketplace");
    marketplace = await ArtProofMarketplace.deploy(artProofAddress);
    await marketplace.waitForDeployment();

    await artProof.connect(admin).setMarketplace(await marketplace.getAddress());

    await mintAndTransferToCollectorA();
  });

  describe("Deployment", function () {
    it("reverts if deployed with the zero address as the ArtProof contract", async function () {
      const ArtProofMarketplace = await ethers.getContractFactory("ArtProofMarketplace");
      await expect(ArtProofMarketplace.deploy(ethers.ZeroAddress)).to.be.revertedWith(
        "Marketplace: zero ArtProof address"
      );
    });

    it("points at the correct ArtProof contract", async function () {
      expect(await marketplace.artProof()).to.equal(await artProof.getAddress());
    });
  });

  describe("listForResale", function () {
    it("reverts if price is 0", async function () {
      await artProof.connect(collectorA).approve(await marketplace.getAddress(), 0);
      await expect(marketplace.connect(collectorA).listForResale(0, 0)).to.be.revertedWith(
        "Marketplace: price must be > 0"
      );
    });

    it("reverts if caller does not own the token", async function () {
      await expect(marketplace.connect(stranger).listForResale(0, PRICE)).to.be.revertedWith(
        "Marketplace: not token owner"
      );
    });

    it("reverts if the marketplace has not been approved", async function () {
      await expect(marketplace.connect(collectorA).listForResale(0, PRICE)).to.be.revertedWith(
        "Marketplace: marketplace not approved to transfer token"
      );
    });

    it("succeeds and emits Listed once approved", async function () {
      await artProof.connect(collectorA).approve(await marketplace.getAddress(), 0);
      await expect(marketplace.connect(collectorA).listForResale(0, PRICE))
        .to.emit(marketplace, "Listed")
        .withArgs(0, collectorA.address, PRICE);

      const listing = await marketplace.listings(0);
      expect(listing.seller).to.equal(collectorA.address);
      expect(listing.price).to.equal(PRICE);
      expect(listing.active).to.equal(true);
    });

    it("also accepts setApprovalForAll instead of per-token approve", async function () {
      await artProof.connect(collectorA).setApprovalForAll(await marketplace.getAddress(), true);
      await expect(marketplace.connect(collectorA).listForResale(0, PRICE)).to.not.be.reverted;
    });
  });

  describe("cancelListing", function () {
    beforeEach(async function () {
      await artProof.connect(collectorA).approve(await marketplace.getAddress(), 0);
      await marketplace.connect(collectorA).listForResale(0, PRICE);
    });

    it("allows the seller to cancel", async function () {
      await expect(marketplace.connect(collectorA).cancelListing(0))
        .to.emit(marketplace, "ListingCancelled")
        .withArgs(0, collectorA.address);
      const listing = await marketplace.listings(0);
      expect(listing.active).to.equal(false);
    });

    it("reverts if a non-seller tries to cancel", async function () {
      await expect(marketplace.connect(stranger).cancelListing(0)).to.be.revertedWith("Marketplace: not the seller");
    });

    it("reverts cancelling an already-inactive listing", async function () {
      await marketplace.connect(collectorA).cancelListing(0);
      await expect(marketplace.connect(collectorA).cancelListing(0)).to.be.revertedWith("Marketplace: not listed");
    });
  });

  describe("buy (Resale + royalty split)", function () {
    beforeEach(async function () {
      await artProof.connect(collectorA).approve(await marketplace.getAddress(), 0);
      await marketplace.connect(collectorA).listForResale(0, PRICE);
    });

    it("reverts if payment does not exactly match the listed price", async function () {
      await expect(
        marketplace.connect(collectorB).buy(0, { value: ethers.parseEther("9") })
      ).to.be.revertedWith("Marketplace: incorrect payment amount");
    });

    it("reverts if the token is not listed", async function () {
      await expect(
        marketplace.connect(collectorB).buy(1, { value: PRICE })
      ).to.be.revertedWith("Marketplace: not listed");
    });

    it("transfers the NFT to the buyer and splits payment correctly", async function () {
      const expectedRoyalty = (PRICE * BigInt(ROYALTY_BPS)) / 10000n; // artist's cut
      const expectedSeller = PRICE - expectedRoyalty; // collectorA's cut

      const artistBalanceBefore = await ethers.provider.getBalance(artist.address);
      const sellerBalanceBefore = await ethers.provider.getBalance(collectorA.address);

      const tx = await marketplace.connect(collectorB).buy(0, { value: PRICE });
      await expect(tx)
        .to.emit(marketplace, "Sale")
        .withArgs(0, collectorA.address, collectorB.address, PRICE, artist.address, expectedRoyalty, expectedSeller);

      expect(await artProof.ownerOf(0)).to.equal(collectorB.address);

      const artistBalanceAfter = await ethers.provider.getBalance(artist.address);
      const sellerBalanceAfter = await ethers.provider.getBalance(collectorA.address);

      expect(artistBalanceAfter - artistBalanceBefore).to.equal(expectedRoyalty);
      expect(sellerBalanceAfter - sellerBalanceBefore).to.equal(expectedSeller);
    });

    it("updates provenance on the ArtProof contract after a marketplace sale", async function () {
      await marketplace.connect(collectorB).buy(0, { value: PRICE });
      const history = await artProof.getHistory(0);
      // mint, direct transfer to collectorA, marketplace resale to collectorB
      expect(history.length).to.equal(3);
      expect(history[2].owner).to.equal(collectorB.address);
      expect(history[2].salePrice).to.equal(PRICE);
      expect(history[2].note).to.equal("Marketplace resale");
    });

    it("clears the listing after a successful purchase (prevents double purchase)", async function () {
      await marketplace.connect(collectorB).buy(0, { value: PRICE });
      const listing = await marketplace.listings(0);
      expect(listing.active).to.equal(false);

      await expect(
        marketplace.connect(stranger).buy(0, { value: PRICE })
      ).to.be.revertedWith("Marketplace: not listed");
    });

    it("reverts if the listing has gone stale because the seller no longer owns the token", async function () {
      // collectorA transfers the token away directly, bypassing the marketplace, after listing it.
      await artProof.connect(collectorA).transferOwnership(stranger.address, 0, 0);
      await expect(
        marketplace.connect(collectorB).buy(0, { value: PRICE })
      ).to.be.revertedWith("Marketplace: seller no longer owns token");
    });

    it("reverts if the seller revoked marketplace approval after listing", async function () {
      await artProof.connect(collectorA).approve(ethers.ZeroAddress, 0);
      await expect(
        marketplace.connect(collectorB).buy(0, { value: PRICE })
      ).to.be.revertedWith("Marketplace: approval was revoked");
    });
  });

  describe("Reentrancy protection", function () {
    it("blocks a malicious seller from re-entering buy() during its payout", async function () {
      const MaliciousSeller = await ethers.getContractFactory("MaliciousSeller");
      const malicious = await MaliciousSeller.deploy(await artProof.getAddress(), await marketplace.getAddress());
      await malicious.waitForDeployment();

      const listPrice = ethers.parseEther("1");
      // MaliciousSeller mints its own certificate (tokenId 1, since 0 was used in beforeEach)
      // and lists it for resale.
      await malicious.connect(admin).registerAndList(SAMPLE_URI, ROYALTY_BPS, listPrice);

      // A genuine buyer purchases it. If the malicious seller's receive() hook manages to
      // re-enter buy() successfully, this whole transaction would behave incorrectly
      // (e.g. double-spend the NFT or drain funds). Because of nonReentrant + the listing
      // being deleted before payment, the re-entrant call must fail, while the *outer*
      // buy() call still succeeds normally.
      await expect(marketplace.connect(collectorB).buy(1, { value: listPrice })).to.not.be.reverted;

      expect(await malicious.attacked()).to.equal(true);
      expect(await malicious.reentrancyReverted()).to.equal(true);
      expect(await artProof.ownerOf(1)).to.equal(collectorB.address);
    });
  });
});
