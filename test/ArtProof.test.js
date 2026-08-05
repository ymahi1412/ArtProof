const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArtProof", function () {
  let artProof;
  let admin, artist, collectorA, collectorB, institution, stranger;

  const SAMPLE_URI = "ipfs://bafybeigsamplecidforartwork0001/metadata.json";
  const ROYALTY_BPS = 500; // 5%

  beforeEach(async function () {
    [admin, artist, collectorA, collectorB, institution, stranger] = await ethers.getSigners();

    const ArtProof = await ethers.getContractFactory("ArtProof");
    artProof = await ArtProof.deploy(admin.address);
    await artProof.waitForDeployment();
  });

  describe("Deployment", function () {
    it("sets the correct name and symbol", async function () {
      expect(await artProof.name()).to.equal("ArtProof Certificate");
      expect(await artProof.symbol()).to.equal("ARTP");
    });

    it("sets the deployer-specified address as admin", async function () {
      expect(await artProof.admin()).to.equal(admin.address);
    });

    it("reverts if deployed with the zero address as admin", async function () {
      const ArtProof = await ethers.getContractFactory("ArtProof");
      await expect(ArtProof.deploy(ethers.ZeroAddress)).to.be.revertedWith("ArtProof: zero admin");
    });
  });

  describe("mintCertificate (Register)", function () {
    it("allows any address to mint and become the artist of record", async function () {
      const tx = await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      await expect(tx).to.emit(artProof, "CertificateMinted").withArgs(0, artist.address, SAMPLE_URI, ROYALTY_BPS);

      expect(await artProof.ownerOf(0)).to.equal(artist.address);
      expect(await artProof.originalArtist(0)).to.equal(artist.address);
      expect(await artProof.tokenURI(0)).to.equal(SAMPLE_URI);
    });

    it("increments token IDs sequentially across multiple mints", async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      await artProof.connect(collectorA).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      expect(await artProof.ownerOf(0)).to.equal(artist.address);
      expect(await artProof.ownerOf(1)).to.equal(collectorA.address);
    });

    it("records an initial provenance entry with salePrice 0 and note 'Certificate minted'", async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      const history = await artProof.getHistory(0);
      expect(history.length).to.equal(1);
      expect(history[0].owner).to.equal(artist.address);
      expect(history[0].salePrice).to.equal(0);
      expect(history[0].note).to.equal("Certificate minted");
    });

    it("sets EIP-2981 royalty info to the artist at the requested bps", async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      const salePrice = ethers.parseEther("1");
      const [receiver, amount] = await artProof.royaltyInfo(0, salePrice);
      expect(receiver).to.equal(artist.address);
      expect(amount).to.equal((salePrice * BigInt(ROYALTY_BPS)) / 10000n);
    });

    it("reverts on an empty metadata URI", async function () {
      await expect(artProof.connect(artist).mintCertificate("", ROYALTY_BPS)).to.be.revertedWith(
        "ArtProof: empty metadata URI"
      );
    });

    it("reverts if royaltyBps exceeds the cap", async function () {
      const tooHigh = (await artProof.MAX_ROYALTY_BPS()) + 1n;
      await expect(artProof.connect(artist).mintCertificate(SAMPLE_URI, tooHigh)).to.be.revertedWith(
        "ArtProof: royalty exceeds cap"
      );
    });

    it("allows royaltyBps exactly at the cap", async function () {
      const cap = await artProof.MAX_ROYALTY_BPS();
      await expect(artProof.connect(artist).mintCertificate(SAMPLE_URI, cap)).to.not.be.reverted;
    });
  });

  describe("transferOwnership (First sale / direct transfer)", function () {
    beforeEach(async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
    });

    it("allows the current owner to transfer to someone else", async function () {
      const salePrice = ethers.parseEther("0.5");
      const tx = await artProof.connect(artist).transferOwnership(collectorA.address, 0, salePrice);
      await expect(tx)
        .to.emit(artProof, "OwnershipTransferredWithSale")
        .withArgs(0, artist.address, collectorA.address, salePrice, "Direct transfer");

      expect(await artProof.ownerOf(0)).to.equal(collectorA.address);
    });

    it("appends a provenance record for the transfer", async function () {
      const salePrice = ethers.parseEther("0.5");
      await artProof.connect(artist).transferOwnership(collectorA.address, 0, salePrice);
      const history = await artProof.getHistory(0);
      expect(history.length).to.equal(2);
      expect(history[1].owner).to.equal(collectorA.address);
      expect(history[1].salePrice).to.equal(salePrice);
      expect(history[1].note).to.equal("Direct transfer");
    });

    it("reverts if caller is not the current owner", async function () {
      await expect(
        artProof.connect(stranger).transferOwnership(collectorA.address, 0, 0)
      ).to.be.revertedWith("ArtProof: caller is not the owner");
    });

    it("reverts on transfer to the zero address", async function () {
      await expect(
        artProof.connect(artist).transferOwnership(ethers.ZeroAddress, 0, 0)
      ).to.be.revertedWith("ArtProof: transfer to zero address");
    });

    it("reverts for a nonexistent token ID", async function () {
      await expect(
        artProof.connect(artist).transferOwnership(collectorA.address, 999, 0)
      ).to.be.reverted; // ERC721's own "nonexistent token" check fires via ownerOf()
    });
  });

  describe("marketplaceTransfer (Resale, restricted caller)", function () {
    beforeEach(async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
    });

    it("reverts if called by anyone other than the registered marketplace", async function () {
      await expect(
        artProof.connect(stranger).marketplaceTransfer(artist.address, collectorA.address, 0, ethers.parseEther("1"))
      ).to.be.revertedWith("ArtProof: caller is not the marketplace");
    });

    it("succeeds when called by the registered marketplace address", async function () {
      // Use collectorB's signer to *simulate* being the marketplace contract for this unit test;
      // full integration with the real ArtProofMarketplace is covered in ArtProofMarketplace.test.js.
      await artProof.connect(admin).setMarketplace(collectorB.address);
      const salePrice = ethers.parseEther("2");

      const tx = await artProof
        .connect(collectorB)
        .marketplaceTransfer(artist.address, collectorA.address, 0, salePrice);
      await expect(tx)
        .to.emit(artProof, "OwnershipTransferredWithSale")
        .withArgs(0, artist.address, collectorA.address, salePrice, "Marketplace resale");

      expect(await artProof.ownerOf(0)).to.equal(collectorA.address);
    });

    it("reverts if 'from' does not currently own the token", async function () {
      await artProof.connect(admin).setMarketplace(collectorB.address);
      await expect(
        artProof.connect(collectorB).marketplaceTransfer(stranger.address, collectorA.address, 0, 0)
      ).to.be.revertedWith("ArtProof: from is not the owner");
    });
  });

  describe("Admin functions & access control", function () {
    it("only admin can set the marketplace address", async function () {
      await expect(artProof.connect(stranger).setMarketplace(collectorA.address)).to.be.revertedWith(
        "ArtProof: caller is not admin"
      );
      await expect(artProof.connect(admin).setMarketplace(collectorA.address)).to.not.be.reverted;
      expect(await artProof.marketplace()).to.equal(collectorA.address);
    });

    it("reverts setting the marketplace to the zero address", async function () {
      await expect(artProof.connect(admin).setMarketplace(ethers.ZeroAddress)).to.be.revertedWith(
        "ArtProof: zero marketplace"
      );
    });

    it("only admin can authorize institutions", async function () {
      await expect(
        artProof.connect(stranger).setInstitutionAuthorization(institution.address, true)
      ).to.be.revertedWith("ArtProof: caller is not admin");

      await expect(artProof.connect(admin).setInstitutionAuthorization(institution.address, true))
        .to.emit(artProof, "InstitutionAuthorized")
        .withArgs(institution.address, true);

      expect(await artProof.authorizedInstitutions(institution.address)).to.equal(true);
    });

    it("only admin can transfer admin rights, and new admin gains control", async function () {
      await expect(artProof.connect(stranger).transferAdmin(stranger.address)).to.be.revertedWith(
        "ArtProof: caller is not admin"
      );

      await artProof.connect(admin).transferAdmin(collectorA.address);
      expect(await artProof.admin()).to.equal(collectorA.address);

      // Old admin can no longer act
      await expect(artProof.connect(admin).setMarketplace(collectorB.address)).to.be.revertedWith(
        "ArtProof: caller is not admin"
      );
      // New admin can
      await expect(artProof.connect(collectorA).setMarketplace(collectorB.address)).to.not.be.reverted;
    });
  });

  describe("logCustody (Exhibition/custody — does NOT change ownership)", function () {
    const startDate = 1893456000; // arbitrary fixed unix timestamp for reproducible tests
    const endDate = 1896048000;

    beforeEach(async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      await artProof.connect(admin).setInstitutionAuthorization(institution.address, true);
    });

    it("allows an authorized institution to log a custody record", async function () {
      const tx = await artProof
        .connect(institution)
        .logCustody(0, "National Gallery", "Curator Jane Doe", startDate, endDate);
      await expect(tx)
        .to.emit(artProof, "CustodyLogged")
        .withArgs(0, "National Gallery", "Curator Jane Doe", startDate, endDate);

      const exhibitions = await artProof.getExhibitions(0);
      expect(exhibitions.length).to.equal(1);
      expect(exhibitions[0].institution).to.equal("National Gallery");
    });

    it("does NOT change token ownership", async function () {
      await artProof.connect(institution).logCustody(0, "National Gallery", "Curator Jane Doe", startDate, endDate);
      expect(await artProof.ownerOf(0)).to.equal(artist.address);
    });

    it("reverts if caller is not an authorized institution", async function () {
      await expect(
        artProof.connect(stranger).logCustody(0, "Fake Gallery", "Nobody", startDate, endDate)
      ).to.be.revertedWith("ArtProof: not an authorized institution");
    });

    it("reverts if endDate is before startDate", async function () {
      await expect(
        artProof.connect(institution).logCustody(0, "National Gallery", "Curator", startDate, startDate - 1)
      ).to.be.revertedWith("ArtProof: endDate before startDate");
    });

    it("allows endDate of 0 to represent an ongoing loan", async function () {
      await expect(
        artProof.connect(institution).logCustody(0, "National Gallery", "Curator", startDate, 0)
      ).to.not.be.reverted;
    });

    it("reverts for a nonexistent token", async function () {
      await expect(
        artProof.connect(institution).logCustody(999, "National Gallery", "Curator", startDate, endDate)
      ).to.be.reverted;
    });

    it("revoked institutions can no longer log custody", async function () {
      await artProof.connect(admin).setInstitutionAuthorization(institution.address, false);
      await expect(
        artProof.connect(institution).logCustody(0, "National Gallery", "Curator", startDate, endDate)
      ).to.be.revertedWith("ArtProof: not an authorized institution");
    });
  });

  describe("View helpers", function () {
    it("getArtworkSummary returns consistent aggregate data", async function () {
      await artProof.connect(artist).mintCertificate(SAMPLE_URI, ROYALTY_BPS);
      await artProof.connect(artist).transferOwnership(collectorA.address, 0, ethers.parseEther("1"));

      const summary = await artProof.getArtworkSummary(0);
      expect(summary.currentOwner).to.equal(collectorA.address);
      expect(summary.artist).to.equal(artist.address);
      expect(summary.metadataURI).to.equal(SAMPLE_URI);
      expect(summary.numTransfers).to.equal(2); // mint + one transfer
      expect(summary.numExhibitions).to.equal(0);
    });

    it("getHistory and getExhibitions revert for a nonexistent token", async function () {
      await expect(artProof.getHistory(999)).to.be.reverted;
      await expect(artProof.getExhibitions(999)).to.be.reverted;
    });
  });

  describe("ERC-165 interface support", function () {
    it("reports support for ERC721 and ERC2981 interfaces", async function () {
      const ERC721_INTERFACE_ID = "0x80ac58cd";
      const ERC2981_INTERFACE_ID = "0x2a55205a";
      expect(await artProof.supportsInterface(ERC721_INTERFACE_ID)).to.equal(true);
      expect(await artProof.supportsInterface(ERC2981_INTERFACE_ID)).to.equal(true);
    });
  });
});
