pragma solidity 0.5.7;

import "@openzeppelin/contracts/token/ERC721/ERC721Full.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract Distributor is ERC721Full, Ownable {
  constructor() ERC721Full("NexusMutualDistributorNFT", "NMDNFT") public {
  }
}