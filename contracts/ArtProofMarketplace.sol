// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Minimal interface exposing the one ArtProof-specific function this contract needs,
/// on top of the standard ERC-721 interface (ownerOf, getApproved, isApprovedForAll, ...).
interface IArtProof is IERC721 {
    function marketplaceTransfer(address from, address to, uint256 tokenId, uint256 salePrice) external;
}

/**
 * @title ArtProofMarketplace
 * @notice Implements the "Resale" stage of the ArtProof workflow. A seller lists a token
 * for a fixed price; a buyer pays that price in ETH; the contract reads the token's
 * EIP-2981 royalty info, sends the royalty share to the artist and the remainder to the
 * seller, and moves the NFT — all in one transaction.
 *
 * NOTE: EIP-2981 (read via royaltyInfo()) only tells this contract what split *should*
 * happen. It's this contract's own logic — not the ERC-2981 standard itself — that
 * actually enforces the payment. A different marketplace could ignore royaltyInfo()
 * entirely; that's a known limitation of the standard, not a bug here.
 */
contract ArtProofMarketplace is ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price; // wei, full price the buyer pays
        bool active;
    }

    IArtProof public immutable artProof;

    /// @notice tokenId => active listing
    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event Sale(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        address royaltyReceiver,
        uint256 royaltyAmount,
        uint256 sellerAmount
    );

    constructor(address artProofAddress) {
        require(artProofAddress != address(0), "Marketplace: zero ArtProof address");
        artProof = IArtProof(artProofAddress);
    }

    /**
     * @notice List a token you own for resale at a fixed price.
     * Requires that this marketplace contract has been approved (per-token or for-all)
     * to move the token, which also gives you a way to invalidate a stale listing later
     * by revoking approval instead of calling cancelListing().
     */
    function listForResale(uint256 tokenId, uint256 price) external {
        require(price > 0, "Marketplace: price must be > 0");
        require(artProof.ownerOf(tokenId) == msg.sender, "Marketplace: not token owner");
        require(
            artProof.getApproved(tokenId) == address(this) || artProof.isApprovedForAll(msg.sender, address(this)),
            "Marketplace: marketplace not approved to transfer token"
        );

        listings[tokenId] = Listing({seller: msg.sender, price: price, active: true});
        emit Listed(tokenId, msg.sender, price);
    }

    /// @notice Cancel your own active listing.
    function cancelListing(uint256 tokenId) external {
        Listing memory listing = listings[tokenId];
        require(listing.active, "Marketplace: not listed");
        require(listing.seller == msg.sender, "Marketplace: not the seller");

        delete listings[tokenId];
        emit ListingCancelled(tokenId, msg.sender);
    }

    /**
     * @notice Buy a listed token. Caller must send exactly the listed price in ETH.
     * Splits payment between the EIP-2981 royalty receiver (the artist, for a
     * first-generation certificate) and the seller, then transfers the NFT.
     */
    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.active, "Marketplace: not listed");
        require(msg.value == listing.price, "Marketplace: incorrect payment amount");
        require(artProof.ownerOf(tokenId) == listing.seller, "Marketplace: seller no longer owns token");
        require(
            artProof.getApproved(tokenId) == address(this) ||
                artProof.isApprovedForAll(listing.seller, address(this)),
            "Marketplace: approval was revoked"
        );

        // --- Effects: clear the listing before any external calls (checks-effects-interactions) ---
        delete listings[tokenId];

        (address royaltyReceiver, uint256 royaltyAmount) = IERC2981(address(artProof)).royaltyInfo(tokenId, listing.price);
        if (royaltyReceiver == address(0) || royaltyAmount > listing.price) {
            // Defensive clamp: should be unreachable given ArtProof's royalty cap, but
            // guarantees this contract never tries to pay out more than it received.
            royaltyAmount = 0;
        }
        uint256 sellerAmount = listing.price - royaltyAmount;

        // --- Interactions ---
        // 1. Move the NFT via the trusted ArtProof contract (also logs provenance).
        artProof.marketplaceTransfer(listing.seller, msg.sender, tokenId, listing.price);

        // 2. Pay the royalty receiver (artist), if any.
        if (royaltyAmount > 0) {
            (bool royaltySent, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
            require(royaltySent, "Marketplace: royalty payment failed");
        }

        // 3. Pay the seller the remainder.
        (bool sellerSent, ) = payable(listing.seller).call{value: sellerAmount}("");
        require(sellerSent, "Marketplace: seller payment failed");

        emit Sale(tokenId, listing.seller, msg.sender, listing.price, royaltyReceiver, royaltyAmount, sellerAmount);
    }
}
