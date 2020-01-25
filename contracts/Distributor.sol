pragma solidity 0.5.7;

import * as ERC721 from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import * as Ownable from "@openzeppelin/contracts/ownership/Ownable.sol";
import * as SafeMath from "./external/openzeppelin-solidity/math/SafeMath.sol";
import * as INXMMaster from "./INXMMaster.sol";
import * as Pool1 from "./Pool1.sol";

contract Distributor is ERC721.ERC721Full, Ownable.Ownable {

  struct TokenData {
    uint expiryTimestamp;
    address lastOwner;
  }

  uint public constant CLAIM_VALIDITY_MAX_DAYS_OVER_COVER_PERIOD = 30 days;

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
    uint requiredValue = priceLoadPercentage.mul(coverDetails[1]).add(coverDetails[1]);
    require(msg.value == requiredValue, "Incorrect value sent");

    p1.makeCoverBegin.value(coverDetails[1])(coveredContractAddress, coverCurrency, coverDetails, coverPeriod, _v, _r, _s);
    uint256 nextTokenId = tokenIdCounter++;

    uint maxValidTimestamp = block.timestamp + CLAIM_VALIDITY_MAX_DAYS_OVER_COVER_PERIOD; 

    allTokenData[nextTokenId] = TokenData(maxValidTimestamp, msg.sender);
    _mint(msg.sender, nextTokenId);
  }

  function submitClaim(
    uint256 tokenId
    )
    public
    payable
  {
    require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved or owner");
    require(allTokenData[tokenId].expiryTimestamp > block.timestamp, "Token is expired");
  }
}