pragma solidity 0.5.7;

import * as ERC721 from "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "./INXMMaster.sol";
import * as Quotation from "./Quotation.sol";

contract Distributor is ERC721.ERC721Full, Ownable {

  INXMMaster nxMaster;
  constructor(address _masterAddress) public {
    nxMaster = INXMMaster(_masterAddress);
    
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
    Quotation.Quotation qt = Quotation.Quotation(nxMaster.getLatestAddress("QT"));
    require(qt.verifySign(coverDetails, coverPeriod, coverCurr, smartContractAddress, _v, _r, _s));
  }
}