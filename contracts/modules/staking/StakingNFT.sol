// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingNFTDescriptor.sol";
import "../../libraries/StakingPoolLibrary.sol";

/// @dev Based on Solmate https://github.com/transmissions11/solmate/blob/main/src/tokens/ERC721.sol
contract StakingNFT is IStakingNFT {

  struct TokenInfo {
    uint96 poolId;
    address owner;
  }

  string public name;
  string public symbol;

  mapping(uint => TokenInfo) internal _tokenInfo;
  mapping(address => uint) internal _balanceOf;
  mapping(uint => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;

  uint96 internal _totalSupply;
  address public operator;
  address public nftDescriptor;

  address public immutable stakingPoolFactory;

  modifier onlyOperator {
    if (msg.sender != operator) revert NotOperator();
    _;
  }

  constructor(
    string memory _name,
    string memory _symbol,
    address _stakingPoolFactory,
    address _operator,
    address _nftDescriptor
  ) {
    name = _name;
    symbol = _symbol;
    stakingPoolFactory = _stakingPoolFactory;
    operator = _operator;
    nftDescriptor = _nftDescriptor;
  }

  // operator functions

  function changeOperator(address newOperator) public onlyOperator {
    if (newOperator == address(0)) revert InvalidNewOperatorAddress();
    operator = newOperator;
  }

  function changeNFTDescriptor(address newNFTDescriptor) public onlyOperator {
    if (newNFTDescriptor == address(0)) revert InvalidNewNFTDescriptorAddress();
    nftDescriptor = newNFTDescriptor;
  }

  // minting and supply

  function mint(uint poolId, address to) public returns (uint id) {

    if (msg.sender != StakingPoolLibrary.getAddress(stakingPoolFactory, poolId)) {
      revert NotStakingPool();
    }

    if (to == address(0)) revert InvalidRecipient();

    // counter overflow is incredibly unrealistic
    unchecked {
      id = ++_totalSupply;
      _balanceOf[to]++;
    }

    _tokenInfo[id].owner = to;
    _tokenInfo[id].poolId = uint96(poolId);

    emit Transfer(address(0), to, id);
  }

  function totalSupply() public view returns (uint) {
    return _totalSupply;
  }

  // info

  function tokenInfo(uint tokenId) public view returns (uint poolId, address owner) {
    poolId = _tokenInfo[tokenId].poolId;
    owner = _tokenInfo[tokenId].owner;
    if (owner == address(0)) revert NotMinted();
  }

  function stakingPoolOf(uint tokenId) public view returns (uint poolId) {
    poolId = _tokenInfo[tokenId].poolId;
    if (poolId == 0) revert NotMinted();
  }

  // ERC165

  function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
    return
      interfaceId == 0x01ffc9a7 || // ERC165 Interface ID for ERC165
      interfaceId == 0x80ac58cd || // ERC165 Interface ID for ERC721
      interfaceId == 0x5b5e139f; // ERC165 Interface ID for ERC721Metadata
  }

  // ERC721

  function tokenURI(uint id) public view virtual returns (string memory uri) {
    if (_tokenInfo[id].owner == address(0)) revert NotMinted();
    return IStakingNFTDescriptor(nftDescriptor).tokenURI(id);
  }

  function ownerOf(uint id) public view returns (address owner) {
    owner = _tokenInfo[id].owner;
    if (owner == address(0)) revert NotMinted();
  }

  function balanceOf(address owner) public view returns (uint) {
    if (owner == address(0)) revert NotMinted();
    return _balanceOf[owner];
  }

  function approve(address spender, uint id) public {
    address owner = ownerOf(id);
    if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert NotAuthorized();
    getApproved[id] = spender;
    emit Approval(owner, spender, id);
  }

  function setApprovalForAll(address spender, bool approved) public {
    isApprovedForAll[msg.sender][spender] = approved;
    emit ApprovalForAll(msg.sender, spender, approved);
  }

  /// @dev `ownerOf` and `getApproved` throw if the token doesn't exist as per ERC721 spec
  /// @dev as a consequence this function will throw as well in that case
  function isApprovedOrOwner(address spender, uint id) external view returns (bool) {
    address owner = ownerOf(id);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[id];
  }

  function transferFrom(address from, address to, uint id) public {

    if (from != ownerOf(id)) revert WrongFrom();
    if (to == address(0)) revert InvalidRecipient();

    if (msg.sender != from && !isApprovedForAll[from][msg.sender] && msg.sender != getApproved[id]) {
      revert NotAuthorized();
    }

    // underflow of the sender's balance is impossible because we check for
    // ownership above and the recipient's balance can't realistically overflow
    unchecked {
      _balanceOf[from]--;
      _balanceOf[to]++;
    }

    _tokenInfo[id].owner = to;
    delete getApproved[id];

    emit Transfer(from, to, id);
  }

  function safeTransferFrom(address from, address to, uint id) public {
    transferFrom(from, to, id);
    if (to.code.length != 0 && ERC721TokenReceiver(to).onERC721Received(msg.sender, from, id, "") != ERC721TokenReceiver.onERC721Received.selector) {
      revert UnsafeRecipient();
    }
  }

  function safeTransferFrom(
    address from,
    address to,
    uint id,
    bytes calldata data
  ) public {
    transferFrom(from, to, id);
    if (to.code.length != 0 && ERC721TokenReceiver(to).onERC721Received(msg.sender, from, id, data) != ERC721TokenReceiver.onERC721Received.selector) {
      revert UnsafeRecipient();
    }
  }
}

/// @notice A generic interface for a contract which properly accepts ERC721 tokens.
/// @dev Based on Solmate https://github.com/transmissions11/solmate/blob/main/src/tokens/ERC721.sol
abstract contract ERC721TokenReceiver {
  function onERC721Received(address, address, uint, bytes calldata) external virtual returns
  (bytes4) {
    return ERC721TokenReceiver.onERC721Received.selector;
  }
}
