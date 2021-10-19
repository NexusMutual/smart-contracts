// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ILegacyClaimsReward.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPooledStaking.sol";
import "../../interfaces/IQuotation.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenData.sol";
import "../../interfaces/IProductsV1.sol";

contract Quotation is IQuotation, MasterAwareV2, ReentrancyGuard {
  IProductsV1 internal immutable productsV1;

  constructor (address productV1Address) {
    productsV1 = IProductsV1(productV1Address);
  }

  function changeDependentContractAddress() public override onlyInternal {
    internalContracts[uint(ID.CR)] = master.getLatestAddress("CR");
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.PS)] = master.getLatestAddress("PS");
    internalContracts[uint(ID.QD)] = master.getLatestAddress("QD");
    internalContracts[uint(ID.TC)] = master.getLatestAddress("TC");
    internalContracts[uint(ID.TD)] = master.getLatestAddress("TD");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
  }

  function claimsReward() internal view returns (ILegacyClaimsReward) {
    return ILegacyClaimsReward(internalContracts[uint(ID.CR)]);
  }

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function pooledStaking() internal view returns (IPooledStaking) {
    return IPooledStaking(internalContracts[uint(ID.PS)]);
  }

  function quotationData() internal view returns (IQuotationData) {
    return IQuotationData(internalContracts[uint(ID.QD)]);
  }

  function tokenController() internal view returns (ITokenController) {
    return ITokenController(internalContracts[uint(ID.TC)]);
  }

  function tokenData() internal view returns (ITokenData) {
    return ITokenData(internalContracts[uint(ID.TD)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  // solhint-disable-next-line no-empty-blocks
  function sendEther() public payable {}

  /**
   * @dev Expires a cover after a set period of time and changes the status of the cover
   * @dev Reduces the total and contract sum assured
   * @param coverId Cover Id.
   */
  function expireCover(uint coverId) external {

    uint expirationDate = quotationData().getValidityOfCover(coverId);
    require(expirationDate < block.timestamp, "Quotation: cover is not due to expire");

    uint coverStatus = quotationData().getCoverStatusNo(coverId);
    require(coverStatus != uint(IQuotationData.CoverStatus.CoverExpired), "Quotation: cover already expired");

    (/* claim count */, bool hasOpenClaim, /* accepted */) = tokenController().coverInfo(coverId);
    require(!hasOpenClaim, "Quotation: cover has an open claim");

    if (coverStatus != uint(IQuotationData.CoverStatus.ClaimAccepted)) {
      (,, address contractAddress, bytes4 currency, uint amount,) = quotationData().getCoverDetailsByCoverID1(coverId);
      quotationData().subFromTotalSumAssured(currency, amount);
      quotationData().subFromTotalSumAssuredSC(contractAddress, currency, amount);
    }

    quotationData().changeCoverStatusNo(coverId, uint8(IQuotationData.CoverStatus.CoverExpired));
  }

  function getWithdrawableCoverNoteCoverIds(
    address coverOwner
  ) public view returns (
    uint[] memory expiredCoverIds,
    bytes32[] memory lockReasons
  ) {

    uint[] memory coverIds = quotationData().getAllCoversOfUser(coverOwner);
    uint[] memory expiredIdsQueue = new uint[](coverIds.length);
    uint expiredQueueLength = 0;

    for (uint i = 0; i < coverIds.length; i++) {

      (/* claimCount */, bool hasOpenClaim, /* hasAcceptedClaim */) = tokenController().coverInfo(coverIds[i]);

      if (!hasOpenClaim) {
        expiredIdsQueue[expiredQueueLength] = coverIds[i];
        expiredQueueLength++;
      }
    }

    expiredCoverIds = new uint[](expiredQueueLength);
    lockReasons = new bytes32[](expiredQueueLength);

    for (uint i = 0; i < expiredQueueLength; i++) {
      expiredCoverIds[i] = expiredIdsQueue[i];
      lockReasons[i] = keccak256(abi.encodePacked("CN", coverOwner, expiredIdsQueue[i]));
    }
  }

  function getWithdrawableCoverNotesAmount(address coverOwner) external view returns (uint) {

    uint withdrawableAmount;
    bytes32[] memory lockReasons;
    (/*expiredCoverIds*/, lockReasons) = getWithdrawableCoverNoteCoverIds(coverOwner);

    for (uint i = 0; i < lockReasons.length; i++) {
      uint coverNoteAmount = tokenController().tokensLocked(coverOwner, lockReasons[i]);
      withdrawableAmount = withdrawableAmount + coverNoteAmount;
    }

    return withdrawableAmount;
  }

  /**
   * @dev Makes Cover funded via NXM tokens.
   * @param smartCAdd Smart Contract Address
   */
  function makeCoverUsingNXMTokens(
    uint[] calldata coverDetails,
    uint16 coverPeriod,
    bytes4 coverCurr,
    address smartCAdd,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external onlyMember whenNotPaused {
    tokenController().burnFrom(msg.sender, coverDetails[2]); // needs allowance
    _verifyCoverDetails(
      payable(msg.sender),
      smartCAdd,
      coverCurr,
      coverDetails,
      coverPeriod,
      _v,
      _r,
      _s,
      true
    );
  }

  /**
   * @dev Verifies cover details signed off chain.
   * @param from address of funder.
   * @param scAddress Smart Contract Address
   */
  function verifyCoverDetails(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public override onlyInternal {
    _verifyCoverDetails(
      from,
      scAddress,
      coverCurr,
      coverDetails,
      coverPeriod,
      _v,
      _r,
      _s,
      false
    );
  }

  /**
   * @dev Verifies signature.
   * @param coverDetails details related to cover.
   * @param coverPeriod validity of cover.
   * @param contractAddress smart contract address.
   * @param _v argument from vrs hash.
   * @param _r argument from vrs hash.
   * @param _s argument from vrs hash.
   */
  function verifySignature(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 currency,
    address contractAddress,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public view returns (bool) {
    require(contractAddress != address(0));
    bytes32 hash = getOrderHash(coverDetails, coverPeriod, currency, contractAddress);
    return isValidSignature(hash, _v, _r, _s);
  }

  /**
   * @dev Gets order hash for given cover details.
   * @param coverDetails details realted to cover.
   * @param coverPeriod validity of cover.
   * @param contractAddress smart contract address.
   */
  function getOrderHash(
    uint[] memory coverDetails,
    uint16 coverPeriod,
    bytes4 currency,
    address contractAddress
  ) public view returns (bytes32) {
    return keccak256(
      abi.encodePacked(
        coverDetails[0],
        currency,
        coverPeriod,
        contractAddress,
        coverDetails[1],
        coverDetails[2],
        coverDetails[3],
        coverDetails[4],
        address(this)
      )
    );
  }

  /**
   * @dev Verifies signature.
   * @param hash order hash
   * @param v argument from vrs hash.
   * @param r argument from vrs hash.
   * @param s argument from vrs hash.
   */
  function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) public view returns (bool) {
    bytes memory prefix = "\x19Ethereum Signed Message:\n32";
    bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, hash));
    address a = ecrecover(prefixedHash, v, r, s);
    return (a == quotationData().getAuthQuoteEngine());
  }

  /**
   * @dev Creates cover of the quotation, changes the status of the quotation ,
   * updates the total sum assured and locks the tokens of the cover against a quote.
   * @param from Quote member Ethereum address.
   */
  function _makeCover(//solhint-disable-line
    address payable from,
    address productId,
    bytes4 coverCurrency,
    uint[] memory coverDetails,
    uint16 coverPeriod
  ) internal {
    // Make sure cover amount is not 0
    require(coverDetails[0] != 0, "TokenController: Amount shouldn't be zero");

    // Make sure premium in NXM is not 0
    require(coverDetails[2] != 0, "TokenController: Premium shouldn't be zero");

    uint24 productIdV2 = productsV1.getNewProductId(productId);
    (
      /* productType */,
      address productAddress,
      uint supportedPayoutAssets
    ) = cover().products(productIdV2);

    // A non-zero product address means that it is a yield token cover
    if (productAddress != address(0)) {
      require(
        coverCurrency == "DAI" && supportedPayoutAssets & 2 == 2 ||
        coverCurrency == "ETH" && supportedPayoutAssets & 1 == 1,
        "Quotation: Unsupported cover asset for this product"
      );
    }

    uint cid = quotationData().getCoverLength();
    quotationData().addCover(
      coverPeriod,
      coverDetails[0], // cover amount
      from,
      coverCurrency,
      productId,
      coverDetails[1], // premium in asset
      coverDetails[2] // premium NXM
    );


    // mint cover note without locking
    tokenController().mint(from, coverDetails[2] / 10); // 10%

    quotationData().addInTotalSumAssured(coverCurrency, coverDetails[0]);
    quotationData().addInTotalSumAssuredSC(productId, coverCurrency, coverDetails[0]);

    {
      uint stakersRewardPercentage = tokenData().stakerCommissionPer();
      uint rewardValue = coverDetails[2] * stakersRewardPercentage / 100;
      pooledStaking().accumulateReward(productId, rewardValue);
    }
  }

  /**
   * @dev Makes a cover.
   * @param from address of funder.
   * @param scAddress Smart Contract Address
   */
  function _verifyCoverDetails(
    address payable from,
    address scAddress,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s,
    bool isNXM
  ) internal {

    require(coverDetails[3] > block.timestamp, "Quotation: Quote has expired");
    require(coverPeriod >= 30 && coverPeriod <= 365, "Quotation: Cover period out of bounds");
    require(!quotationData().timestampRepeated(coverDetails[4]), "Quotation: Quote already used");
    quotationData().setTimestampRepeated(coverDetails[4]);

    address asset = claimsReward().getCurrencyAssetAddress(coverCurr);
    if (coverCurr != "ETH" && !isNXM) {
      pool().transferAssetFrom(asset, from, coverDetails[1]);
    }

    require(verifySignature(coverDetails, coverPeriod, coverCurr, scAddress, _v, _r, _s), "Quotation: signature mismatch");
    _makeCover(from, scAddress, coverCurr, coverDetails, coverPeriod);
  }

  function createCover(
    address payable from,
    address scAddress,
    bytes4 currency,
    uint[] calldata coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) external override onlyInternal {

    require(coverDetails[3] > block.timestamp, "Quotation: Quote has expired");
    require(coverPeriod >= 30 && coverPeriod <= 365, "Quotation: Cover period out of bounds");
    require(!quotationData().timestampRepeated(coverDetails[4]), "Quotation: Quote already used");
    quotationData().setTimestampRepeated(coverDetails[4]);

    require(verifySignature(coverDetails, coverPeriod, currency, scAddress, _v, _r, _s), "Quotation: signature mismatch");
    _makeCover(from, scAddress, currency, coverDetails, coverPeriod);
  }

  // referenced in master, keeping for now
  // solhint-disable-next-line no-empty-blocks
  function transferAssetsToNewContract(address) external pure {}
}
