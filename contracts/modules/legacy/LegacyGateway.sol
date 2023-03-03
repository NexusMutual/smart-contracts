// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IGateway.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverMigrator.sol";

contract LegacyGateway is IGateway, MasterAwareV2 {

  /* ============ CONSTANTS ============== */

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  /* ========== STATE VARIABLES ========== */

  // Removed the `quotation` state variable as we replaced MasterAware with MasterAwareV2,
  // which occupies 2 slots instead of 1.
  // address public _unused_quotation;

  address public _unused_nxmToken;
  address public _unused_tokenController;
  address public _unused_quotationData;
  address public _unused_claimsData;
  address public _unused_claims;
  address public _unused_pool;
  address public _unused_memberRoles;

  // assigned in initialize
  address public DAI;

  address public _unused_incidents;
  address public _unused_coverMigrator;

  IQuotationData public immutable quotationData;

  constructor(address _quotationData) {
    quotationData = IQuotationData(_quotationData);
  }

  function nxmToken() internal view returns (INXMToken) {
    return INXMToken(internalContracts[uint(ID.TK)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function coverMigrator() internal view returns (ICoverMigrator) {
    return ICoverMigrator(internalContracts[uint(ID.CL)]);
  }

  function changeDependentContractAddress() external {
    internalContracts[uint(ID.TK)] = payable(master.tokenAddress());
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.CL)] = master.getLatestAddress("CL");
  }

  function getCover(uint coverId) public override view returns (
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil,
    address contractAddress,
    address coverAsset,
    uint premiumInNXM,
    address memberAddress
  ) {
    bytes4 currency;
    (/*cid*/, memberAddress, contractAddress, currency, /*sumAssured*/, premiumInNXM) = quotationData.getCoverDetailsByCoverID1(coverId);
    (/*cid*/, status, sumAssured, coverPeriod, validUntil) = quotationData.getCoverDetailsByCoverID2(coverId);

    coverAsset = getCurrencyAssetAddress(currency);
    sumAssured = sumAssured * 10 ** assetDecimals(coverAsset);
  }

  function assetDecimals(address asset) public view returns (uint) {
    return asset == ETH ? 18 : IERC20Detailed(asset).decimals();
  }

  function getCurrencyFromAssetAddress(address asset) public view returns (bytes4) {
    if (asset == ETH) {
      return "ETH";
    }
    if (asset == DAI) {
      return "DAI";
    }
    revert("Gateway: unknown asset");
  }

  function getCurrencyAssetAddress(bytes4 currency) public view returns (address) {
    if (currency == "ETH") {
      return ETH;
    }
    if (currency == "DAI") {
      return DAI;
    }
    revert("Gateway: unknown currency");
  }

  /// @dev Migrates covers from V1 to V2
  ///
  /// @param coverId     V1 cover identifier
  function submitClaim(uint coverId, bytes calldata /* data */) external override returns (uint) {
    // [todo] Maybe we could use data to specify other addresses and only use tx.origin if empty,
    // thus allowing multisigs to migrate a cover in one tx without an EOA being involved.
    coverMigrator().migrateCoverFrom(coverId, msg.sender, tx.origin);

    return 0;
  }

  function switchMembership(address newAddress) external override {
    memberRoles().switchMembershipOf(msg.sender, newAddress);
    nxmToken().transferFrom(msg.sender, newAddress, nxmToken().balanceOf(msg.sender));
  }

  /* ===== DEPRECATED ===== */

  function getCoverPrice (
    address /* contractAddress */,
    address /* coverAsset */,
    uint /* sumAssured */,
    uint16 /* coverPeriod */,
    CoverType /* coverType */,
    bytes calldata /* data */
  ) external override view returns (uint /* coverPrice */) {

    DAI;
    revert("Gateway: Unsupported action");
  }

  function buyCover (
    address /* contractAddress */,
    address /* coverAsset */,
    uint /* sumAssured */,
    uint16 /* coverPeriod */,
    CoverType /* coverType */,
    bytes calldata /* data */
  ) external override payable onlyMember whenNotPaused returns (uint) {

    revert("Gateway: Unsupported action");
  }

  function claimTokens(
    uint /* coverId */,
    uint /* incidentId */,
    uint /* coveredTokenAmount */,
    address /* coveredToken */
  ) external override returns (
    uint /* claimId */,
    uint /* payoutAmount */,
    address /* payoutToken */
  ){
    // silence compiler warning
    DAI = DAI;

    revert("Gateway: Unsupported action");
  }

  function getClaimCoverId(uint /* claimId */) public override view returns (uint) {
    // silence compiler warning
    DAI;
    revert("Gateway: Unsupported action");
  }

  function getPayoutOutcome(uint /* claimId */) external override view returns (
    ClaimStatus /* status */,
    uint /* amountPaid */,
    address /* coverAsset */
  ) {
    // silence compiler warning
    DAI;

    revert("Gateway: Unsupported action");
  }

  function executeCoverAction(
    uint /* tokenId */,
    uint8 /* action */,
    bytes calldata /* data */
  ) external override payable returns (bytes memory, uint) {

    revert("Gateway: Unsupported action");
  }
}
