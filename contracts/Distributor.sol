pragma solidity 0.5.7;

import * as ERC721 from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import * as Ownable from "@openzeppelin/contracts/ownership/Ownable.sol";
import * as SafeMath from "./external/openzeppelin-solidity/math/SafeMath.sol";
import * as INXMMaster from "./INXMMaster.sol";
import * as Pool1 from "./Pool1.sol";
import * as Claims from "./Claims.sol";
import * as NXMToken from "./NXMToken.sol";

contract Distributor is ERC721.ERC721Full("NXMDistributorNFT", "NXMDNFT"), Ownable.Ownable {

  struct TokenData {
    uint expirationTimestamp;
    address lastOwner;
    bytes4 coverCurrency;
    uint[] coverDetails;
  }

  uint public constant CLAIM_VALIDITY_MAX_DAYS_OVER_COVER_PERIOD = 30 days;
  uint public constant CLAIM_DEPOSIT_PERCENTAGE = 5;

  INXMMaster.INXMMaster internal nxMaster;
  uint public priceLoadPercentage;
  uint256 internal tokenIdCounter;
  mapping(uint256 => TokenData) internal allTokenData;

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
    Pool1.Pool1 p1 = Pool1.Pool1(nxMaster.getLatestAddress("P1"));
    uint requiredValue = priceLoadPercentage.mul(coverDetails[1]).div(100).add(coverDetails[1]);
    require(msg.value == requiredValue, "Incorrect value sent");

    p1.makeCoverBegin.value(coverDetails[1])(coveredContractAddress, coverCurrency, coverDetails, coverPeriod, _v, _r, _s);

    uint256 nextTokenId = tokenIdCounter++;
    uint expirationTimestamp = block.timestamp + CLAIM_VALIDITY_MAX_DAYS_OVER_COVER_PERIOD + coverPeriod * 1 days; 
    allTokenData[nextTokenId] = TokenData(expirationTimestamp, msg.sender, coverCurrency, coverDetails);
    _mint(msg.sender, nextTokenId);
  }

  function submitClaim(
    uint256 tokenId,
    uint coverId
    )
    public
    payable
  {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved or owner");
    require(allTokenData[tokenId].expirationTimestamp > block.timestamp, "Token is expired");

    uint coverAmount = allTokenData[tokenId].coverDetails[1];
    require(msg.value == CLAIM_DEPOSIT_PERCENTAGE.mul(coverAmount).div(100), "Deposit value is incorrect");

    Claims.Claims claims = Claims.Claims(nxMaster.getLatestAddress("CL"));
    claims.submitClaim(coverId);
    
    allTokenData[tokenId].lastOwner = msg.sender;
    safeTransferFrom(msg.sender, owner(), tokenId);
  }

  function nxmTokenApprove(address spender, uint256 value)
  public
  onlyOwner
  {
    NXMToken.NXMToken nxmToken = NXMToken.NXMToken(nxMaster.tokenAddress());
    nxmToken.approve(spender, value);
  }
}