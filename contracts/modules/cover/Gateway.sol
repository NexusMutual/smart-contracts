// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/IClaims.sol";
import "../../interfaces/IClaimsData.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IGateway.sol";
import "../../interfaces/IIncidents.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IQuotation.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";

contract Gateway is IGateway, MasterAware {
  using SafeMath for uint;
  using SafeERC20 for IERC20;

  // contracts
  IQuotation public quotation;
  INXMToken public nxmToken;
  ITokenController public tokenController;
  IQuotationData public quotationData;
  IClaimsData public claimsData;
  IClaims public claims;
  IIncidents public incidents;
  IPool public pool;
  IMemberRoles public memberRoles;

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

  function changeDependentContractAddress() public {
    quotation = IQuotation(master.getLatestAddress("QT"));
    nxmToken = INXMToken(master.tokenAddress());
    tokenController = ITokenController(master.getLatestAddress("TC"));
    quotationData = IQuotationData(master.getLatestAddress("QD"));
    claimsData = IClaimsData(master.getLatestAddress("CD"));
    claims = IClaims(master.getLatestAddress("CL"));
    incidents = IIncidents(master.getLatestAddress("IC"));
    pool = IPool(master.getLatestAddress("P1"));
    memberRoles = IMemberRoles(master.getLatestAddress("MR"));
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
    require(coverType == CoverType.SIGNED_QUOTE_CONTRACT_COVER, "Gateway: Unsupported cover type");
    require(sumAssured % 10 ** assetDecimals(coverAsset) == 0, "Gateway: Only whole unit sumAssured supported");

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
          require(msg.value == premiumAmount, "Gateway: ETH amount does not match premium");
          // solhint-disable-next-line avoid-low-level-calls, avoid-call-value
          (bool ok, /* data */) = address(pool).call.value(premiumAmount)("");
          require(ok, "Gateway: Transfer to Pool failed");
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

  function claimTokens(uint coverId, uint incidentId, uint coveredTokenAmount, address coveredToken)
    external
    returns (uint claimId, uint payoutAmount, address payoutToken) {
    IERC20 token = IERC20(coveredToken);
    token.safeTransferFrom(msg.sender, address(this), coveredTokenAmount);
    token.approve(address(incidents), coveredTokenAmount);
    (claimId, payoutAmount, payoutToken) = incidents.redeemPayoutForMember(coverId, incidentId, coveredTokenAmount, msg.sender);
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
    if (internalClaimStatus == 14) {
      (,address productId) = quotationData.getscAddressOfCover(coverId);
      address coveredTokenAddress = incidents.coveredToken(productId);
      if (coveredTokenAddress != address(0)) {
        amountPaid = incidents.claimPayout(claimId);
      } else {
        amountPaid = quotationData.getCoverSumAssured(coverId).mul(10 ** assetDecimals(coverAsset));
      }
    } else {
      amountPaid = 0;
    }

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
    revert("Gateway: Unsupported action");
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
}
