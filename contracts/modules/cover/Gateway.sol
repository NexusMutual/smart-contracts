/* Copyright (C) 2020 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.5.0;

import "../../interfaces/IERC20Detailed.sol";
import "../capital/MCR.sol";
import "../capital/Pool.sol";
import "../governance/MemberRoles.sol";
import "../token/TokenController.sol";
import "../token/TokenData.sol";
import "../token/TokenData.sol";
import "../token/TokenFunctions.sol";
import "./QuotationData.sol";
import "../claims/ClaimsReward.sol";

contract Gateway is MasterAware {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  // contracts
  Quotation public quotation;
  NXMToken public nxmToken;
  TokenController public tokenController;
  QuotationData public quotationData;
  ClaimsData public claimsData;
  Claims public claims;
  Pool public pool;
  MemberRoles public memberRoles;

  event CoverBought(
    uint coverId,
    address indexed buyer,
    address indexed contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    CoverType indexed coverType,
    bytes data
  );

  event ClaimSubmitted(
    uint indexed claimId,
    uint indexed coverId,
    address indexed submitter,
    bytes data
  );

  // assigned in initialize
  address public DAI;
  // constants
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  enum CoverType { SIGNED_QUOTE_CONTRACT_COVER }

  enum ClaimStatus { IN_PROGRESS, ACCEPTED, REJECTED }

  function changeDependentContractAddress() public {
    quotation = Quotation(master.getLatestAddress("QT"));
    nxmToken = NXMToken(master.tokenAddress());
    tokenController = TokenController(master.getLatestAddress("TC"));
    quotationData = QuotationData(master.getLatestAddress("QD"));
    claimsData = ClaimsData(master.getLatestAddress("CD"));
    claims = Claims(master.getLatestAddress("CL"));
    pool = Pool(master.getLatestAddress("P1"));
    memberRoles = MemberRoles(master.getLatestAddress("MR"));
    if (DAI == address(0)) {
      ClaimsReward claimsReward = ClaimsReward(master.getLatestAddress("CR"));
      DAI = claimsReward.DAI();
    }
  }

  function getCoverPrice (
    address /* contractAddress */,
    address /* coverAsset */,
    uint /* sumAssured */,
    uint16 /* coverPeriod */,
    CoverType /* coverType */,
    bytes calldata data
  ) external view returns (uint coverPrice) {

    // mark function as view instead of pure for future compatibility
    this;

    (
    coverPrice,
    /* coverPriceNXM */,
    /* generatedAt */,
    /* expiresAt */,
    /* _v */,
    /* _r */,
    /* _s */
    ) = abi.decode(data, (uint, uint, uint, uint, uint8, bytes32, bytes32));
  }

  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    CoverType coverType,
    bytes calldata data
  ) external payable onlyMember whenNotPaused returns (uint) {

    // only 1 cover type supported at this time
    require(coverType == CoverType.SIGNED_QUOTE_CONTRACT_COVER, "Cover: Unsupported cover type");
    require(sumAssured % 10 ** assetDecimals(coverAsset) == 0, "Cover: Only whole unit sumAssured supported");

    {
      (
      uint[] memory coverDetails,
      uint8 _v,
      bytes32 _r,
      bytes32 _s
      ) = convertToLegacyQuote(sumAssured, data, coverAsset);

      {
        uint premiumAmount = coverDetails[1];
        if (coverAsset == ETH) {
          require(msg.value == premiumAmount, "Cover: ETH amount does not match premium");
          // solhint-disable-next-line avoid-low-level-calls, avoid-call-value
          (bool ok, /* data */) = address(pool).call.value(premiumAmount)("");
          require(ok, "Cover: Transfer to Pool failed");
        } else {
          IERC20 token = IERC20(coverAsset);
          token.safeTransferFrom(msg.sender, address(pool), premiumAmount);
        }
      }

      quotation.createCover(
        msg.sender,
        contractAddress,
        getCurrencyFromAssetAddress(coverAsset),
        coverDetails,
        coverPeriod, _v, _r, _s
      );
    }

    uint coverId = quotationData.getCoverLength().sub(1);
    emit CoverBought(coverId, msg.sender, contractAddress, coverAsset, sumAssured, coverPeriod, coverType, data);
    return coverId;
  }

  function submitClaim(uint coverId, bytes calldata data) external returns (uint) {
    claims.submitClaimForMember(coverId, msg.sender);

    uint claimId = claimsData.actualClaimLength() - 1;
    emit ClaimSubmitted(claimId, coverId, msg.sender, data);
    return claimId;
  }

  function getClaimCoverId(uint claimId) public view returns (uint) {
    (, uint coverId) = claimsData.getClaimCoverId(claimId);
    return coverId;
  }

  function getPayoutOutcome(uint claimId)
    external
    view
    returns (ClaimStatus status, uint amountPaid, address coverAsset)
  {
    (, uint coverId) = claimsData.getClaimCoverId(claimId);
    (, uint internalClaimStatus) = claimsData.getClaimStatusNumber(claimId);

    coverAsset = getCurrencyAssetAddress(quotationData.getCurrencyOfCover(coverId));
    uint sumAssured = quotationData.getCoverSumAssured(coverId).mul(10 ** assetDecimals(coverAsset));
    amountPaid = internalClaimStatus == 14 ? sumAssured : 0;

    if (internalClaimStatus == 6 || internalClaimStatus == 9 || internalClaimStatus == 11) {
      status = ClaimStatus.REJECTED;
    } else if (internalClaimStatus == 13 || internalClaimStatus == 14) {
      status = ClaimStatus.ACCEPTED;
    } else {
      status = ClaimStatus.IN_PROGRESS;
    }
  }

  function getCover(uint coverId)
  public
  view
  returns (
    uint8 status,
    uint sumAssured,
    uint16 coverPeriod,
    uint validUntil,
    address contractAddress,
    address coverAsset,
    uint premiumInNXM,
    address memberAddress
  )
  {
    bytes4 currency;
    (/*cid*/, memberAddress, contractAddress, currency, /*sumAssured*/, premiumInNXM) = quotationData.getCoverDetailsByCoverID1(coverId);
    (/*cid*/, status, sumAssured, coverPeriod, validUntil) = quotationData.getCoverDetailsByCoverID2(coverId);

    coverAsset = getCurrencyAssetAddress(currency);
    sumAssured = sumAssured.mul(10 ** assetDecimals(coverAsset));
  }

  function switchMembership(address newAddress) external {
    memberRoles.switchMembershipOf(msg.sender, newAddress);
    nxmToken.transferFrom(msg.sender, newAddress, nxmToken.balanceOf(msg.sender));
  }

  function executeCoverAction(uint /* tokenId */, uint8 /* action */, bytes calldata /* data */)
  external
  payable
  returns (bytes memory, uint)
  {
    revert("Cover: Unsupported action");
  }

  function convertToLegacyQuote(uint sumAssured, bytes memory data, address asset)
    internal view returns (uint[] memory coverDetails, uint8, bytes32, bytes32) {
    (
    uint coverPrice,
    uint coverPriceNXM,
    uint expiresAt,
    uint generatedAt,
    uint8 v,
    bytes32 r,
    bytes32 s
    ) = abi.decode(data, (uint, uint, uint, uint, uint8, bytes32, bytes32));
    coverDetails = new uint[](5);
    // convert from wei to units
    coverDetails[0] = sumAssured.div(10 ** assetDecimals(asset));
    coverDetails[1] = coverPrice;
    coverDetails[2] = coverPriceNXM;
    coverDetails[3] = expiresAt;
    coverDetails[4] = generatedAt;
    return (coverDetails, v, r, s);
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

    revert("Cover: unknown asset");
  }

  function getCurrencyAssetAddress(bytes4 currency) public view returns (address) {

    if (currency == "ETH") {
      return ETH;
    }

    if (currency == "DAI") {
      return DAI;
    }

    revert("Cover: unknown currency");
  }
}
