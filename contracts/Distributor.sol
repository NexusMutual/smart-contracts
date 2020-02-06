pragma solidity 0.5.7;
pragma experimental ABIEncoderV2;

import * as ERC721 from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import * as ERC721Enumerable from "@openzeppelin/contracts/token/ERC721/ERC721Enumerable.sol";
import * as IERC20 from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import * as Ownable from "@openzeppelin/contracts/ownership/Ownable.sol";
import * as SafeMath from "./external/openzeppelin-solidity/math/SafeMath.sol";
import * as INXMMaster from "./INXMMaster.sol";
import * as Pool1 from "./Pool1.sol";
import * as PoolData from "./PoolData.sol";
import * as Claims from "./Claims.sol";
import * as NXMToken from "./NXMToken.sol";
import * as QuotationData from "./QuotationData.sol";

contract Distributor is ERC721.ERC721Full("NXMDistributorNFT", "NXMDNFT"), Ownable.Ownable {

  struct TokenData {
    uint expirationTimestamp;
    bytes4 coverCurrency;
    uint[] coverDetails;
    uint coverId;
    bool claimInProgress;
    uint claimId;
  }

  uint public constant CLAIM_VALIDITY_MAX_DAYS_OVER_COVER_PERIOD = 30 days;
  uint public constant CLAIM_DEPOSIT_PERCENTAGE = 5;

  INXMMaster.INXMMaster internal nxMaster;
  uint public priceLoadPercentage;
  uint256 internal tokenIdCounter;
  mapping(uint256 => TokenData) internal allTokenData;

  uint public withdrawableETH;
  uint public withdrawableDAI;

  constructor(address _masterAddress, uint _priceLoadPercentage) public {
    nxMaster = INXMMaster.INXMMaster(_masterAddress);
    priceLoadPercentage = _priceLoadPercentage;
  }

  function buyCover(
        address coveredContractAddress,
        bytes4 coverCurrency,
        uint[] memory coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
  )
     public
     payable
  {
    uint requiredValue = priceLoadPercentage.mul(coverDetails[1]).div(100).add(coverDetails[1]);
    require(msg.value == requiredValue, "Incorrect value sent");

    Pool1.Pool1 p1 = Pool1.Pool1(nxMaster.getLatestAddress("P1"));
    p1.makeCoverBegin.value(coverDetails[1])(coveredContractAddress, coverCurrency, coverDetails, coverPeriod, _v, _r, _s);

    // add fee to the withdrawable pool
    withdrawableETH = withdrawableETH.add(requiredValue.sub(coverDetails[1]));

    mintToken(coverCurrency, coverDetails, coverPeriod);
  }

  function buyCoverUsingCA(
        address coveredContractAddress,
        bytes4 coverCurrency,
        uint[] memory coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
  )
    public
  {
    uint requiredValue = priceLoadPercentage.mul(coverDetails[1]).div(100).add(coverDetails[1]);
    PoolData.PoolData pd = PoolData.PoolData(nxMaster.getLatestAddress("PD"));
    IERC20.IERC20 erc20 = IERC20.IERC20(pd.getCurrencyAssetAddress(coverCurrency));
    require(erc20.transferFrom(msg.sender, address(this), requiredValue), "Transfer failed");

    address payable pool1Address = nxMaster.getLatestAddress("P1");
    Pool1.Pool1 p1 = Pool1.Pool1(pool1Address);
    erc20.approve(pool1Address, coverDetails[1]);
    p1.makeCoverUsingCA(coveredContractAddress, coverCurrency, coverDetails, coverPeriod, _v, _r, _s);

    // add fee to the withdrawable pool
    withdrawableDAI = withdrawableDAI.add(requiredValue.sub(coverDetails[1]));

    mintToken(coverCurrency, coverDetails, coverPeriod);
  }

  function mintToken(
    bytes4 coverCurrency,
    uint[] memory coverDetails,
    uint16 coverPeriod
  )
  internal
  {
    QuotationData.QuotationData quotationData = QuotationData.QuotationData(nxMaster.getLatestAddress("QD"));
    // *assumes* the newly created claim is appended at the end of the list covers
    uint coverId = quotationData.getCoverLength().sub(1);

    uint256 nextTokenId = tokenIdCounter++;
    uint expirationTimestamp = block.timestamp + CLAIM_VALIDITY_MAX_DAYS_OVER_COVER_PERIOD + coverPeriod * 1 days;
    allTokenData[nextTokenId] = TokenData(expirationTimestamp, coverCurrency, coverDetails, coverId, false, 0);
    _mint(msg.sender, nextTokenId);
  }

  function submitClaim(
    uint256 tokenId
  )
    public
    payable
  {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved or owner");
    require(allTokenData[tokenId].expirationTimestamp > block.timestamp, "Token is expired");
    require(allTokenData[tokenId].coverCurrency == "ETH", "currency not ETH");
    uint coverAmount = allTokenData[tokenId].coverDetails[1];
    require(msg.value == CLAIM_DEPOSIT_PERCENTAGE.mul(coverAmount).div(100), "Deposit value is incorrect");

    _submitClaim(tokenId);
  }

  function submitClaimUsingCA(
    uint256 tokenId
  )
    public
  {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved or owner");
    require(allTokenData[tokenId].expirationTimestamp > block.timestamp, "Token is expired");
    uint depositAmount = CLAIM_DEPOSIT_PERCENTAGE.mul(allTokenData[tokenId].coverDetails[1]).div(100);
    PoolData.PoolData pd = PoolData.PoolData(nxMaster.getLatestAddress("PD"));
    IERC20.IERC20 erc20 = IERC20.IERC20(pd.getCurrencyAssetAddress(allTokenData[tokenId].coverCurrency));
    require(erc20.transferFrom(msg.sender, address(this), depositAmount), "Transfer failed");

    _submitClaim(tokenId);
  }

  function _submitClaim(
    uint256 tokenId
  )
    internal
  {
    Claims.Claims claims = Claims.Claims(nxMaster.getLatestAddress("CL"));
    claims.submitClaim(allTokenData[tokenId].coverId);

    allTokenData[tokenId].claimInProgress = true;
    // TODO: set to correct value once claim ID is available
    allTokenData[tokenId].claimId = 1337;
  }

  function getTokenData(uint tokenId) public view returns (TokenData memory) {
    return allTokenData[tokenId];
  }

  function nxmTokenApprove(address _spender, uint256 _value)
  public
  onlyOwner
  {
    NXMToken.NXMToken nxmToken = NXMToken.NXMToken(nxMaster.tokenAddress());
    nxmToken.approve(_spender, _value);
  }

  function withdrawETH(address payable _recipient, uint256 _amount)
    external
    onlyOwner
  {
    require(withdrawableETH >= _amount, "Not enough ETH");
    withdrawableETH = withdrawableETH.sub(_amount);
    _recipient.transfer(_amount);
  }

  function withdrawDAI(address payable _recipient, uint256 _amount)
    external
    onlyOwner
  {
    require(withdrawableDAI >= _amount, "Not enough DAI");
    withdrawableDAI = withdrawableDAI.sub(_amount);

    PoolData.PoolData pd = PoolData.PoolData(nxMaster.getLatestAddress("PD"));
    IERC20.IERC20 erc20 = IERC20.IERC20(pd.getCurrencyAssetAddress("DAI"));
    require(erc20.transfer(_recipient, _amount), "Transfer failed");
  }
}