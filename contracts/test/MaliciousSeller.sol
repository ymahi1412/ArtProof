// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MaliciousSeller
 * @notice TEST-ONLY contract. Registers an artwork, lists it on the marketplace,
 * and — when it receives its seller payout — immediately tries to call buy() again
 * on the same token before the original call has finished, simulating a reentrancy
 * attack. This is used purely to prove ArtProofMarketplace's nonReentrant guard
 * (and its checks-effects-interactions ordering) actually stops the attack.
 * Not part of the deployed application.
 */

interface IArtProofLike {
    function mintCertificate(string memory metadataURI, uint96 royaltyBps) external returns (uint256);
    function approve(address to, uint256 tokenId) external;
}

interface IMarketplaceLike {
    function listForResale(uint256 tokenId, uint256 price) external;
    function buy(uint256 tokenId) external payable;
}

contract MaliciousSeller {
    IArtProofLike public immutable artProof;
    IMarketplaceLike public immutable marketplace;

    uint256 public targetTokenId;
    bool public attacked;
    bool public reentrancyReverted;

    constructor(address artProofAddress, address marketplaceAddress) {
        artProof = IArtProofLike(artProofAddress);
        marketplace = IMarketplaceLike(marketplaceAddress);
    }

    /// @dev Registers a certificate with this contract as owner/artist, then lists it.
    function registerAndList(string memory metadataURI, uint96 royaltyBps, uint256 price) external returns (uint256 tokenId) {
        tokenId = artProof.mintCertificate(metadataURI, royaltyBps);
        targetTokenId = tokenId;
        artProof.approve(address(marketplace), tokenId);
        marketplace.listForResale(tokenId, price);
    }

    /// @dev Called by the marketplace's low-level `.call{value: sellerAmount}("")` payout.
    /// Attempts to re-enter buy() on the same token using the funds just received.
    receive() external payable {
        if (!attacked) {
            attacked = true;
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = address(marketplace).call{value: msg.value}(
                abi.encodeWithSignature("buy(uint256)", targetTokenId)
            );
            reentrancyReverted = !success;
        }
    }

    // Required so ERC-721 safeMint/safeTransfer will send this contract a token.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
