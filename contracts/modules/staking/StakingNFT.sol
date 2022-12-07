// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";
import "../../interfaces/INXMToken.sol";
import "solmate/src/tokens/ERC721.sol";

contract StakingNFT is ERC721 {

  /* storage */

  uint public totalSupply;
  address public operator;
  mapping(uint => address) public tokenStakingPool;

  /* immutables */

  INXMToken public immutable nxm;

  modifier onlyOperator {
    require(msg.sender == operator, "StakingNFT: Not operator");
    _;
  }

  modifier onlyStakingPool {
    // TODO: check if msg.sender is token's staking pool
    require(msg.sender == operator, "StakingNFT: Not token staking pool");
    _;
  }

  constructor(
    string memory name_,
    string memory symbol_,
    address _nxm,
    address _operator
  ) ERC721(name_, symbol_) {
    nxm = INXMToken(_nxm);
    operator = _operator;
  }

  function tokenURI(uint256) public pure override returns (string memory) {
    // TODO: implement me
    return "";
  }

  function isApprovedOrOwner(address spender, uint tokenId) external view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
  }

  function mint(address to, uint tokenId) external onlyStakingPool {
    _mint(to, tokenId);
  }

  function mint(address to) external onlyStakingPool returns (uint tokenId) {
    tokenId = totalSupply++;
    _mint(to, tokenId);
  }

  function burn(uint tokenId) external onlyStakingPool {
    _burn(tokenId);
  }

  function transferFrom(
    address from,
    address to,
    uint256 tokenId
  ) public override {

    // TODO: check if this is the manager's token
    // TODO: this is unneeded if the pool manager is not tracked using an NFT
    if (tokenId == 0) {
      require(
        nxm.isLockedForMV(from) < block.timestamp,
        "StakingPool: Active pool assets are locked for voting in governance"
      );
    }

    super.transferFrom(from, to, tokenId);
  }

  function operatorTransferFrom(address from, address to, uint256 tokenId) external onlyOperator {

    require(from == _ownerOf[tokenId], "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

    // Underflow of the sender's balance is impossible because we check for
    // ownership above and the recipient's balance can't realistically overflow.
    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }

    _ownerOf[tokenId] = to;
    delete getApproved[tokenId];

    emit Transfer(from, to, tokenId);
  }

  function changeOperator(address _newOperator) public onlyOperator returns (bool) {
    require(_newOperator != address(0), "StakingNFT: Invalid newOperator address");

    operator = _newOperator;
    return true;
  }
}
