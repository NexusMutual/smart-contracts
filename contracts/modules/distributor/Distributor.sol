// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-v4/access/Ownable.sol";
import "@openzeppelin/contracts-v4/security/ReentrancyGuard.sol";
import "../../interfaces/IGateway.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/INXMMaster.sol";

contract Distributor is ERC721, Ownable, ReentrancyGuard {
  using SafeERC20 for IERC20;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  event ClaimPayoutRedeemed (
    uint indexed coverId,
    uint indexed claimId,
    address indexed receiver,
    uint amountPaid,
    address coverAsset
  );

  event ClaimSubmitted (
    uint indexed coverId,
    uint indexed claimId,
    address indexed submitter
  );

  event CoverBought (
    uint indexed coverId,
    address indexed buyer,
    address indexed contractAddress,
    uint feePercentage,
    uint coverPrice
  );

  /*
   feePercentage applied to every cover premium. has 2 decimals. eg.: 10.00% stored as 1000
  */
  uint public feePercentage;
  bool public buysAllowed = true;
  /*
    address where `buyCover` distributor fees and `ethOut` from `sellNXM` are sent. Controlled by Owner.
  */
  address payable public treasury;

  /*
    NexusMutual contracts
  */
  IGateway immutable public gateway;
  IERC20 immutable public nxmToken;
  INXMMaster immutable public master;

  modifier onlyTokenApprovedOrOwner(uint256 tokenId) {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Distributor: Not approved or owner");
    _;
  }

  constructor(
    address gatewayAddress,
    address nxmTokenAddress,
    address masterAddress,
    uint _feePercentage,
    address payable _treasury,
    string memory tokenName,
    string memory tokenSymbol
  )
  ERC721(tokenName, tokenSymbol)
  {
    feePercentage = _feePercentage;
    treasury = _treasury;
    gateway = IGateway(gatewayAddress);
    nxmToken = IERC20(nxmTokenAddress);
    master = INXMMaster(masterAddress);
  }

  /**
  * @dev buy cover for a coverable identified by its contractAddress
  * @param contractAddress contract address of coverable
  * @param coverAsset asset of the premium and of the sum assured.
  * @param sumAssured amount payable if claim is submitted and considered valid
  * @param coverType cover type dermining how the data parameter is decoded
  * @param maxPriceWithFee max price (including fee) to be spent on the cover.
  * @param data abi-encoded field with additional cover data fields
  * @return token id
  */
  function buyCover (
    address contractAddress,
    address coverAsset,
    uint sumAssured,
    uint16 coverPeriod,
    uint8 coverType,
    uint maxPriceWithFee,
    bytes calldata data
  )
    external
    payable
    nonReentrant
    returns (uint)
  {
    require(buysAllowed, "Distributor: buys not allowed");

    uint coverPrice = gateway.getCoverPrice(contractAddress, coverAsset, sumAssured, coverPeriod, IGateway.CoverType(coverType), data);
    uint coverPriceWithFee = feePercentage * coverPrice / 10000 + coverPrice;
    require(coverPriceWithFee <= maxPriceWithFee, "Distributor: cover price with fee exceeds max");

    uint buyCoverValue = 0;
    if (coverAsset == ETH) {
      require(msg.value >= coverPriceWithFee, "Distributor: Insufficient ETH sent");
      uint remainder = msg.value - coverPriceWithFee;

      if (remainder > 0) {
        // solhint-disable-next-line avoid-low-level-calls
        (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
        require(ok, "Distributor: Returning ETH remainder to sender failed.");
      }

      buyCoverValue = coverPrice;
    } else {
      IERC20 token = IERC20(coverAsset);
      token.safeTransferFrom(msg.sender, address(this), coverPriceWithFee);
      token.approve(address(gateway), coverPrice);
    }

    uint coverId = gateway.buyCover{value: buyCoverValue }(
      contractAddress,
      coverAsset,
      sumAssured,
      coverPeriod,
      IGateway.CoverType(coverType),
      data
    );

    transferToTreasury(coverPriceWithFee - coverPrice, coverAsset);

    // mint token using the coverId as a tokenId (guaranteed unique)
    _mint(msg.sender, coverId);

    emit CoverBought(coverId, msg.sender, contractAddress, feePercentage, coverPrice);
    return coverId;
  }

  /**
  * @notice Submit a claim for the cover
  * @param tokenId cover token id
  * @param data abi-encoded field with additional claim data fields
  */
  function submitClaim(
    uint tokenId,
    bytes calldata data
  )
    external
    onlyTokenApprovedOrOwner(tokenId)
    returns (uint)
  {
    // coverId = tokenId
    uint claimId = gateway.submitClaim(tokenId, data);
    emit ClaimSubmitted(tokenId, claimId, msg.sender);
    return claimId;
  }

  /**
  * @notice Submit a claim for the cover
  * @param tokenId cover token id
  * @param incidentId id of the incident
  * @param coveredTokenAmount amount of yield tokens covered
  * @param coverAsset yield token that is covered
  */
  function claimTokens(
    uint tokenId,
    uint incidentId,
    uint coveredTokenAmount,
    address coverAsset
  )
    external
    onlyTokenApprovedOrOwner(tokenId)
    returns (uint claimId, uint payoutAmount, address payoutToken)
  {
    IERC20 token = IERC20(coverAsset);
    token.safeTransferFrom(msg.sender, address(this), coveredTokenAmount);
    token.approve(address(gateway), coveredTokenAmount);
    // coverId = tokenId
    (claimId, payoutAmount, payoutToken) = gateway.claimTokens(
      tokenId,
      incidentId,
      coveredTokenAmount,
      coverAsset
    );
    _burn(tokenId);
    if (payoutToken == ETH) {
      (bool ok, /* data */) = address(msg.sender).call{value: payoutAmount}("");
      require(ok, "Distributor: ETH transfer to sender failed.");
    } else {
      IERC20(payoutToken).safeTransfer(msg.sender, payoutAmount);
    }
    emit ClaimSubmitted(tokenId, claimId, msg.sender);
  }

  /**
  * @notice Redeem the claim to the cover. Requires that that the payout is completed.
  * @param tokenId cover token id
  */
  function redeemClaim(
    uint256 tokenId,
    uint claimId
  )
    public
    onlyTokenApprovedOrOwner(tokenId)
    nonReentrant
  {
    uint coverId = gateway.getClaimCoverId(claimId);
    require(coverId == tokenId, "Distributor: coverId claimId mismatch");
    (IGateway.ClaimStatus status, uint amountPaid, address coverAsset) = gateway.getPayoutOutcome(claimId);
    require(status == IGateway.ClaimStatus.ACCEPTED, "Distributor: Claim not accepted");

    _burn(tokenId);
    if (coverAsset == ETH) {
      (bool ok, /* data */) = msg.sender.call{value: amountPaid}("");
      require(ok, "Distributor: Transfer to NFT owner failed");
    } else {
      IERC20 erc20 = IERC20(coverAsset);
      erc20.safeTransfer(msg.sender, amountPaid);
    }

    emit ClaimPayoutRedeemed(tokenId, claimId, msg.sender, amountPaid, coverAsset);
  }

  /**
  * @notice Execute an action on specific cover token. The action is identified by an `action` id.
      Allows for an ETH transfer or an ERC20 transfer.
      If less than the supplied assetAmount is needed, it is returned to `msg.sender`.
  * @dev The purpose of this function is future-proofing for updates to the cover buy->claim cycle.
  * @param tokenId id of the cover token
  * @param assetAmount optional asset amount to be transferred along with the action executed
  * @param asset optional asset to be transferred along with the action executed
  * @param action action identifier
  * @param data abi-encoded field with action parameters
  * @return response (abi-encoded response, amount withheld from the original asset amount supplied)
  */
  function executeCoverAction(uint tokenId, uint assetAmount, address asset, uint8 action, bytes calldata data)
    external
    payable
    onlyTokenApprovedOrOwner(tokenId)
    nonReentrant
    returns (bytes memory response, uint withheldAmount)
  {
    if (assetAmount == 0) {
      return gateway.executeCoverAction(tokenId, action, data);
    }
    uint remainder;
    if (asset == ETH) {
      require(msg.value >= assetAmount, "Distributor: Insufficient ETH sent");
      (response, withheldAmount) = gateway.executeCoverAction{ value: msg.value }(tokenId, action, data);
      remainder = assetAmount - withheldAmount;
      (bool ok, /* data */) = address(msg.sender).call{value: remainder}("");
      require(ok, "Distributor: Returning ETH remainder to sender failed.");
      return (response, withheldAmount);
    }

    IERC20 token = IERC20(asset);
    token.safeTransferFrom(msg.sender, address(this), assetAmount);
    token.approve(address(gateway), assetAmount);
    (response, withheldAmount) = gateway.executeCoverAction(tokenId, action, data);
    remainder = assetAmount - withheldAmount;
    token.safeTransfer(msg.sender, remainder);
    return (response, withheldAmount);
  }

  /**
  * @notice get cover data
  * @param tokenId cover token id
  */
  function getCover(uint tokenId)
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
  ) {
    return gateway.getCover(tokenId);
  }

  /**
  * @notice get state of a claim payout. Returns
  * status of cover,  amount paid as part of the payout, address of the cover asset)
  * @param claimId id of claim
  */
  function getPayoutOutcome(uint claimId)
  public
  view
  returns (IGateway.ClaimStatus status, uint amountPaid, address coverAsset)
  {
    (status, amountPaid, coverAsset) = gateway.getPayoutOutcome(claimId);
  }

  /**
  * @notice Set `amount` as the allowance of `spender` over the distributor's NXM tokens.
  * @param spender approved spender
  * @param amount amount approved
  */
  function approveNXM(address spender, uint256 amount) public onlyOwner {
    nxmToken.approve(spender, amount);
  }

  /**
  * @notice Moves `amount` tokens from the distributor to `recipient`.
  * @param recipient recipient of NXM
  * @param amount amount of NXM
  */
  function withdrawNXM(address recipient, uint256 amount) public onlyOwner {
    nxmToken.safeTransfer(recipient, amount);
  }

  /**
  * @notice Switch NexusMutual membership to `newAddress`.
  * @param newAddress address
  */
  function switchMembership(address newAddress) external onlyOwner {
    nxmToken.approve(address(gateway), type(uint).max);
    gateway.switchMembership(newAddress);
  }

  /**
  * @notice Sell Distributor-owned NXM tokens for ETH
  * @param nxmIn Amount of NXM to sell
  * @param minEthOut minimum expected Eth received
  */
  function sellNXM(uint nxmIn, uint minEthOut) external onlyOwner {

    address poolAddress = master.getLatestAddress("P1");
    nxmToken.approve(poolAddress, nxmIn);
    uint balanceBefore = address(this).balance;
    IPool(poolAddress).sellNXM(nxmIn, minEthOut);
    uint balanceAfter = address(this).balance;

    transferToTreasury(balanceAfter - balanceBefore, ETH);
  }

  /**
  * @notice Set if buyCover calls are allowed (true) or not (false).
  * @param _buysAllowed value set for buysAllowed
  */
  function setBuysAllowed(bool _buysAllowed) external onlyOwner {
    buysAllowed = _buysAllowed;
  }

  /**
  * @notice Set treasury address where `buyCover` distributor fees and `ethOut` from `sellNXM` are sent.
  * @param _treasury new treasury address
  */
  function setTreasury(address payable _treasury) external onlyOwner {
    treasury = _treasury;
  }

  /**
  * @notice Send `amount` of `asset`  to treasury address
  * @param amount amount of asset
  * @param asset ERC20 token address or ETH
  */
  function transferToTreasury(uint amount, address asset) internal {
    if (asset == ETH) {
      (bool ok, /* data */) = treasury.call{value: amount}("");
      require(ok, "Distributor: Transfer to treasury failed");
    } else {
      IERC20 erc20 = IERC20(asset);
      erc20.safeTransfer(treasury, amount);
    }
  }

  /**
  * @notice Set fee percentage for buyCover premiums.
  *  `_feePercentage` has 2 decimals of precision ( 5000 is 50%)
  * @param _feePercentage fee percentage to be set
  */
  function setFeePercentage(uint _feePercentage) external onlyOwner {
    feePercentage = _feePercentage;
  }

  /**
  * @dev required to be allow for receiving ETH claim payouts
  */
  receive () payable external {
  }
}
