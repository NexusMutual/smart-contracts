pragma solidity 0.5.7;

import * as ERC721 from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import * as Ownable from "@openzeppelin/contracts/ownership/Ownable.sol";
import * as SafeMath from "./external/openzeppelin-solidity/math/SafeMath.sol";
import * as INXMMaster from "./INXMMaster.sol";
import * as Pool1 from "./Pool1.sol";

contract Distributor is ERC721.ERC721Full, Ownable.Ownable {

  struct TokenData {
    uint creationTimestamp;
  }

  INXMMaster.INXMMaster internal nxMaster;
  uint priceLoadPercentage;
  uint256 internal tokenIdCounter;
  mapping(uint256 => TokenData) allTokenData;

  constructor(address _masterAddress, uint _priceLoadPercentage) public {
    nxMaster = INXMMaster.INXMMaster(_masterAddress);
    priceLoadPercentage = _priceLoadPercentage;
  }

  function buyCover(
        address smartContractAddress,
        bytes4 coverCurr,
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

    p1.makeCoverBegin.value(coverDetails[1])(smartContractAddress, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    uint256 nextTokenId = tokenIdCounter++;

    allTokenData[nextTokenId] = TokenData(block.timestamp);
    _mint(msg.sender, nextTokenId);
  }

  // function makeCoverBegin(

  // )
}