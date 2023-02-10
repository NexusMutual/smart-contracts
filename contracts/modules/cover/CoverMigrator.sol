// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IIndividualClaims.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";

/// Provides a way for contracts which don't use the Gateway.sol contract to migrate covers to V2
/// using the submitClaim claim function.
contract CoverMigrator is MasterAwareV2 {

  event CoverMigrated(uint coverIdV1, uint coverIdV2, address newOwner);

  // v1
  IQuotationData internal immutable quotationData;
  IProductsV1 internal immutable productsV1;

  constructor(address _quotationData, address _productsV1) {
    quotationData = IQuotationData(_quotationData);
    productsV1 = IProductsV1(_productsV1);
  }

  /// @dev Migrates covers for arNFT-like contracts that don't use Gateway.sol
  ///      The function should not change in any way, since it is being used instead of V1 Claims `submitClaim`
  ///
  /// @param coverId          Legacy (V1) cover identifier
  function submitClaim(uint coverId) external whenNotPaused {
    _migrateCoverFrom(coverId, msg.sender, tx.origin);
  }

  /// @dev Migrates covers from V1. Meant to be used by EOA Nexus Mutual members
  ///
  /// @param coverIds  Legacy (V1) cover identifiers
  /// @param newOwner  The address for which the V2 cover NFT is minted
  function migrateCovers(
    uint[] calldata coverIds,
    address newOwner
  ) external whenNotPaused returns (uint[] memory newCoverIds) {
    newCoverIds = new uint[](coverIds.length);
    for (uint i = 0; i < coverIds.length; i++) {
      newCoverIds[i] = _migrateCoverFrom(coverIds[i], msg.sender, newOwner);
    }
  }

  /// @dev Migrates covers from V1. Meant to be used by Claims.sol and Gateway.sol to allow the
  /// users of distributor contracts to migrate their NFTs.
  ///
  /// @param coverId   V1 cover identifier
  /// @param msgSender The address which called the migration function
  /// @param newOwner  The address for which the V2 cover NFT is minted
  function migrateCoverFrom(
    uint coverId,
    address msgSender,
    address newOwner
  ) external onlyInternal whenNotPaused returns (uint newCoverId) {
    return _migrateCoverFrom(coverId, msgSender, newOwner);
  }

  function migrateAndSubmitClaim(
    uint32 coverId,
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
  ) payable external whenNotPaused returns (uint newCoverId) {
    newCoverId = _migrateCoverFrom(coverId, msg.sender, msg.sender);
    individualClaims().submitClaimFor{value: msg.value}(uint32(newCoverId), segmentId, requestedAmount, ipfsMetadata, msg.sender);
    return newCoverId;
  }

  /// @dev Migrates covers from V1
  ///
  /// @param coverId   V1 cover identifier
  /// @param msgSender The address which called the migration function
  /// @param newOwner  The address for which the V2 cover NFT is minted
  function _migrateCoverFrom(
    uint coverId,
    address msgSender,
    address newOwner
  ) internal returns (uint coverIdV2) {

    uint productId;
    uint coverAsset;
    uint start;
    uint period;
    uint amount;

    {
      (
        /*uint coverId*/,
        address coverOwner,
        address legacyProductId,
        bytes4 currencyCode,
        /*uint sumAssured*/,
        /*uint premiumNXM*/
      ) = quotationData.getCoverDetailsByCoverID1(coverId);

      require(msgSender == coverOwner, "Cover can only be migrated by its owner");

      productId = productsV1.getNewProductId(legacyProductId);
      coverAsset = currencyCode == "ETH" ? 0 : 1;
    }

    {
      (
        /*uint coverId*/,
        uint8 status,
        uint sumAssured,
        uint16 coverPeriodInDays,
        uint validUntil
      ) = quotationData.getCoverDetailsByCoverID2(coverId);

      require(LegacyCoverStatus(status) != LegacyCoverStatus.Migrated, "Cover has already been migrated");
      require(LegacyCoverStatus(status) != LegacyCoverStatus.ClaimAccepted, "A claim has already been accepted");

      amount = sumAssured * 10 ** 18;
      period = uint(coverPeriodInDays) * 1 days;
      start = validUntil - period;
    }

    {
      (
        uint claimCount ,
        bool hasOpenClaim,
        /* hasAcceptedClaim */,
        /* requestedAmount */
      ) = tokenController().coverInfo(coverId);
      require(!hasOpenClaim, "Cover has an open V1 claim");
      require(claimCount < 2, "Cover already has 2 claims");
    }

    // Mark cover as migrated to prevent future calls on the same cover
    quotationData.changeCoverStatusNo(coverId, uint8(LegacyCoverStatus.Migrated));
    coverIdV2 = cover().addLegacyCover(productId, coverAsset, amount, start, period, newOwner);

    emit CoverMigrated(coverId, coverIdV2, newOwner);
  }

  function cover() internal view returns (ICover) {
    return ICover(getInternalContractAddress(ID.CO));
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(getInternalContractAddress(ID.TC));
  }

  function individualClaims() internal view returns (IIndividualClaims) {
    return IIndividualClaims(getInternalContractAddress(ID.IC));
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.IC)] = master.getLatestAddress("IC");
  }
}
