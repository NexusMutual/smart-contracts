pragma solidity 0.5.7;

import "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "./INXMMaster.sol";

contract Distributor is ERC721Full, Ownable {

  INXMMaster nxMaster;
  constructor(address _masterAddress) ERC721Full("NexusMutualDistributorNFT", "NMDNFT") public {
    nxMaster = INXMMaster(_masterAddress);
  }

  // function buyCover(
  //       address smartCAdd,
  //       bytes4 coverCurr,
  //       uint[] memory coverDetails,
  //       uint16 coverPeriod,
  //       uint8 _v,
  //       bytes32 _r,
  //       bytes32 _s
  //   )
  //    public
  //    payable 
  // {
  // }
}