// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {ERC721Royalty} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Royalty.sol";

/**
 * @title ArtProof
 * @notice ERC-721 "certificate" for a physical artwork. Each token is a digital
 * passport for one piece: it carries a metadata URI (IPFS), an EIP-2981 royalty
 * setting, an append-only on-chain provenance log, and an append-only exhibition
 * / custody log that museums and galleries can write to without changing ownership.
 *
 * IMPORTANT SCOPE NOTES (read this before treating the contract as more than it is):
 * - Minting is OPEN: any address can call mintCertificate() and name itself the
 *   artist. The contract does not verify real-world identity or that the caller
 *   actually created the physical piece. "Artist" here means "the address that
 *   registered this certificate" — authenticity of that claim is an off-chain,
 *   social/legal question, not something Solidity can settle.
 * - EIP-2981 (via ERC721Royalty) only lets this contract *signal* royalty terms.
 *   It does not force any marketplace to pay them. Payment is only guaranteed
 *   when a sale goes through ArtProofMarketplace.sol, which reads this signal
 *   and actually splits the payment on-chain.
 * - Provenance entries record what was submitted on-chain; the contract cannot
 *   verify off-chain facts (e.g. that a listed sale price was the true price).
 * - The physical artwork itself is linked only by whatever tag ID the frontend
 *   chooses to display in metadata — there is no cryptographic proof binding
 *   the physical object to the token in this MVP.
 */
contract ArtProof is ERC721, ERC721URIStorage, ERC721Royalty {
    /// @notice Contract admin: allowed to authorize institutions and set the marketplace address.
    address public admin;

    /// @notice The single ArtProofMarketplace contract permitted to move tokens on behalf of sellers.
    address public marketplace;

    /// @notice Royalty cap of 10% (1000 / 10000 bps), guards against a mint with an unreasonable royalty.
    uint96 public constant MAX_ROYALTY_BPS = 1000;

    uint256 private _nextTokenId;

    struct ProvenanceRecord {
        address owner;      // owner as of this record
        uint256 timestamp;  // block.timestamp when recorded
        uint256 salePrice;  // wei paid for this transfer; 0 for mint / non-sale transfer
        string note;        // short human-readable reason ("Certificate minted", "Marketplace resale", ...)
    }

    struct ExhibitionRecord {
        string institution;  // free-text institution name (e.g. "National Gallery")
        string custodian;    // free-text responsible person/department
        uint256 startDate;   // unix timestamp
        uint256 endDate;     // unix timestamp, 0 if still ongoing
        uint256 loggedAt;    // block.timestamp when the record was written
    }

    /// @notice The address that originally minted the certificate (the asserted artist).
    mapping(uint256 => address) public originalArtist;

    mapping(uint256 => ProvenanceRecord[]) private _provenance;
    mapping(uint256 => ExhibitionRecord[]) private _exhibitions;

    /// @notice Institutions (museums/galleries) allowed to call logCustody().
    mapping(address => bool) public authorizedInstitutions;

    event CertificateMinted(uint256 indexed tokenId, address indexed artist, string metadataURI, uint96 royaltyBps);
    event OwnershipTransferredWithSale(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 salePrice,
        string note
    );
    event CustodyLogged(
        uint256 indexed tokenId,
        string institution,
        string custodian,
        uint256 startDate,
        uint256 endDate
    );
    event InstitutionAuthorized(address indexed institution, bool authorized);
    event MarketplaceUpdated(address indexed marketplace);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    modifier onlyAdmin() {
        require(msg.sender == admin, "ArtProof: caller is not admin");
        _;
    }

    modifier onlyAuthorizedInstitution() {
        require(authorizedInstitutions[msg.sender], "ArtProof: not an authorized institution");
        _;
    }

    modifier onlyMarketplace() {
        require(marketplace != address(0) && msg.sender == marketplace, "ArtProof: caller is not the marketplace");
        _;
    }

    constructor(address initialAdmin) ERC721("ArtProof Certificate", "ARTP") {
        require(initialAdmin != address(0), "ArtProof: zero admin");
        admin = initialAdmin;
    }

    // ---------------------------------------------------------------------
    // Admin functions
    // ---------------------------------------------------------------------

    /// @notice One-time (or updatable) wiring of the marketplace contract allowed to move tokens on resale.
    function setMarketplace(address marketplaceAddress) external onlyAdmin {
        require(marketplaceAddress != address(0), "ArtProof: zero marketplace");
        marketplace = marketplaceAddress;
        emit MarketplaceUpdated(marketplaceAddress);
    }

    /// @notice Allow or revoke a museum/gallery address's right to log exhibition/custody records.
    function setInstitutionAuthorization(address institution, bool authorized) external onlyAdmin {
        require(institution != address(0), "ArtProof: zero institution");
        authorizedInstitutions[institution] = authorized;
        emit InstitutionAuthorized(institution, authorized);
    }

    /// @notice Hand off admin rights to a new address.
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ArtProof: zero admin");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ---------------------------------------------------------------------
    // Stage 1: Register — mintCertificate()
    // ---------------------------------------------------------------------

    /**
     * @notice Mint a new artwork certificate. The caller becomes the on-chain "artist"
     * of record and the initial owner of the token.
     * @param metadataURI IPFS URI (e.g. ipfs://<cid>) pointing at the artwork's JSON metadata.
     * @param royaltyBps Resale royalty in basis points (100 = 1%), capped at MAX_ROYALTY_BPS.
     */
    function mintCertificate(string memory metadataURI, uint96 royaltyBps) external returns (uint256 tokenId) {
        require(bytes(metadataURI).length > 0, "ArtProof: empty metadata URI");
        require(royaltyBps <= MAX_ROYALTY_BPS, "ArtProof: royalty exceeds cap");

        tokenId = _nextTokenId++;
        address artist = msg.sender;

        _safeMint(artist, tokenId);
        _setTokenURI(tokenId, metadataURI);
        _setTokenRoyalty(tokenId, artist, royaltyBps);

        originalArtist[tokenId] = artist;
        _provenance[tokenId].push(
            ProvenanceRecord({owner: artist, timestamp: block.timestamp, salePrice: 0, note: "Certificate minted"})
        );

        emit CertificateMinted(tokenId, artist, metadataURI, royaltyBps);
    }

    // ---------------------------------------------------------------------
    // Stage 2: First Sale / direct transfer — transferOwnership()
    // ---------------------------------------------------------------------

    /**
     * @notice Directly transfer a token the caller owns, logging a provenance entry.
     * Used for the artist's first sale (deck workflow stage 2) or any off-marketplace
     * transfer (e.g. a gift). This does NOT split any payment — if ETH should move,
     * use the marketplace's listForResale()/buy() flow instead.
     * @param to Recipient address.
     * @param tokenId Token being transferred.
     * @param salePrice Informational sale price in wei to record in provenance (0 if none/gift).
     */
    function transferOwnership(address to, uint256 tokenId, uint256 salePrice) external {
        address from = msg.sender;
        require(ownerOf(tokenId) == from, "ArtProof: caller is not the owner");
        require(to != address(0), "ArtProof: transfer to zero address");

        _safeTransfer(from, to, tokenId, "");
        _logProvenance(tokenId, from, to, salePrice, "Direct transfer");
    }

    // ---------------------------------------------------------------------
    // Stage 3: Resale — called only by ArtProofMarketplace
    // ---------------------------------------------------------------------

    /**
     * @notice Move a token as part of a marketplace-settled sale. Restricted to the
     * configured marketplace contract, which is responsible for having already
     * verified the listing and split the payment before calling this.
     */
    function marketplaceTransfer(address from, address to, uint256 tokenId, uint256 salePrice) external onlyMarketplace {
        require(ownerOf(tokenId) == from, "ArtProof: from is not the owner");
        require(to != address(0), "ArtProof: transfer to zero address");

        _safeTransfer(from, to, tokenId, "");
        _logProvenance(tokenId, from, to, salePrice, "Marketplace resale");
    }

    function _logProvenance(uint256 tokenId, address from, address to, uint256 salePrice, string memory note) internal {
        _provenance[tokenId].push(
            ProvenanceRecord({owner: to, timestamp: block.timestamp, salePrice: salePrice, note: note})
        );
        emit OwnershipTransferredWithSale(tokenId, from, to, salePrice, note);
    }

    // ---------------------------------------------------------------------
    // Stage 4: Verification — read-only, no gas when called off-chain via a provider
    // ---------------------------------------------------------------------

    /// @notice Full ownership/provenance chain for a token, oldest entry first.
    function getHistory(uint256 tokenId) external view returns (ProvenanceRecord[] memory) {
        ownerOf(tokenId); // reverts on nonexistent token
        return _provenance[tokenId];
    }

    /// @notice All logged exhibition/custody records for a token, oldest first.
    function getExhibitions(uint256 tokenId) external view returns (ExhibitionRecord[] memory) {
        ownerOf(tokenId); // reverts on nonexistent token
        return _exhibitions[tokenId];
    }

    /// @notice Convenience view combining the most commonly needed public fields for a token.
    function getArtworkSummary(uint256 tokenId)
        external
        view
        returns (address currentOwner, address artist, string memory metadataURI, uint256 numTransfers, uint256 numExhibitions)
    {
        currentOwner = ownerOf(tokenId);
        artist = originalArtist[tokenId];
        metadataURI = tokenURI(tokenId);
        numTransfers = _provenance[tokenId].length;
        numExhibitions = _exhibitions[tokenId].length;
    }

    // ---------------------------------------------------------------------
    // Stage 5: Exhibition / custody — logCustody(), ownership is NOT changed
    // ---------------------------------------------------------------------

    /**
     * @notice Record that an artwork is on loan/exhibition at an institution.
     * Does not call any transfer function — ownerOf(tokenId) is unchanged.
     * Restricted to addresses the admin has authorized via setInstitutionAuthorization.
     */
    function logCustody(
        uint256 tokenId,
        string memory institution,
        string memory custodian,
        uint256 startDate,
        uint256 endDate
    ) external onlyAuthorizedInstitution {
        ownerOf(tokenId); // reverts on nonexistent token
        require(bytes(institution).length > 0, "ArtProof: empty institution");
        require(endDate == 0 || endDate >= startDate, "ArtProof: endDate before startDate");

        _exhibitions[tokenId].push(
            ExhibitionRecord({
                institution: institution,
                custodian: custodian,
                startDate: startDate,
                endDate: endDate,
                loggedAt: block.timestamp
            })
        );

        emit CustodyLogged(tokenId, institution, custodian, startDate, endDate);
    }

    // ---------------------------------------------------------------------
    // Required overrides (multiple inheritance across ERC721 extensions)
    // ---------------------------------------------------------------------

    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Royalty)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
