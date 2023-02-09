// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICoverNFT.sol";

/// @dev Based on Solmate https://github.com/transmissions11/solmate/blob/main/src/tokens/ERC721.sol
contract CoverNFT is ICoverNFT {

  uint96 internal _totalSupply;

  string public name;

  string public symbol;

  mapping(uint256 => address) internal _ownerOf;

  mapping(address => uint256) internal _balanceOf;

  mapping(uint256 => address) public getApproved;

  mapping(address => mapping(address => bool)) public isApprovedForAll;

  address public operator;

  modifier onlyOperator {
    if (msg.sender != operator) revert NotOperator();
    _;
  }

  constructor(string memory name_, string memory symbol_, address _operator) {
    name = name_;
    symbol = symbol_;
    operator = _operator;
  }

  function totalSupply() public view returns (uint) {
    return _totalSupply;
  }

  // TODO: implement change token descriptor function here

  function tokenURI(uint256) public pure override returns (string memory) {
    // TODO: implement me
    return "";
  }

  function isApprovedOrOwner(address spender, uint tokenId) external view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
  }

  function ownerOf(uint256 id) public view virtual returns (address owner) {
    if ((owner = _ownerOf[id]) == address(0)) revert NotMinted();
  }

  function balanceOf(address owner) public view virtual returns (uint256) {
    if (owner == address(0)) revert ZeroAddress();

    return _balanceOf[owner];
  }

  function mint(address to) external onlyOperator returns (uint tokenId) {
    tokenId = ++_totalSupply;
    _mint(to, tokenId);
  }

  function changeOperator(address _newOperator) public onlyOperator returns (bool) {
    if (_newOperator == address(0)) revert InvalidNewOperatorAddress();

    operator = _newOperator;
    return true;
  }

  // ERC721 functions
  function approve(address spender, uint256 id) public virtual {
    address owner = _ownerOf[id];

    if (msg.sender != owner && !isApprovedForAll[owner][msg.sender]) revert NotAuthorized();

    getApproved[id] = spender;

    emit Approval(owner, spender, id);
  }

  function setApprovalForAll(address operator, bool approved) public virtual {
    isApprovedForAll[msg.sender][operator] = approved;

    emit ApprovalForAll(msg.sender, operator, approved);
  }

  function transferFrom(
    address from,
    address to,
    uint256 id
  ) public virtual {
    if (from != _ownerOf[id]) revert WrongFrom();

    if (to == address(0)) revert InvalidRecipient();

    if (msg.sender != from && !isApprovedForAll[from][msg.sender] && msg.sender != getApproved[id]) {
      revert NotAuthorized();
    }

    // Underflow of the sender's balance is impossible because we check for
    // ownership above and the recipient's balance can't realistically overflow.
  unchecked {
    _balanceOf[from]--;

    _balanceOf[to]++;
  }

    _ownerOf[id] = to;

    delete getApproved[id];

    emit Transfer(from, to, id);
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 id
  ) public virtual {
    transferFrom(from, to, id);

    if (to.code.length != 0
      && ERC721TokenReceiver(to).onERC721Received(msg.sender, from, id, "") != ERC721TokenReceiver.onERC721Received.selector) {
      revert UnsafeRecipient();
    }
  }

  function safeTransferFrom(
    address from,
    address to,
    uint256 id,
    bytes calldata data
  ) public virtual {
    transferFrom(from, to, id);

    if (to.code.length != 0
      && ERC721TokenReceiver(to).onERC721Received(msg.sender, from, id, data) != ERC721TokenReceiver.onERC721Received.selector) {
      revert UnsafeRecipient();
    }
  }


  function supportsInterface(bytes4 interfaceId) public view virtual returns (bool) {
    return
    interfaceId == 0x01ffc9a7 || // ERC165 Interface ID for ERC165
    interfaceId == 0x80ac58cd || // ERC165 Interface ID for ERC721
    interfaceId == 0x5b5e139f; // ERC165 Interface ID for ERC721Metadata
  }


  // Internal functions

  function _mint(address to, uint256 id) internal virtual {
    if (to == address(0)) revert InvalidRecipient();

    if (_ownerOf[id] != address(0)) revert AlreadyMinted();

    // Counter overflow is incredibly unrealistic.
  unchecked {
    _balanceOf[to]++;
  }

    _ownerOf[id] = to;

    emit Transfer(address(0), to, id);
  }

  function _burn(uint256 id) internal virtual {
    address owner = _ownerOf[id];

    if (owner == address(0)) revert NotMinted();

    // Ownership check above ensures no underflow.
  unchecked {
    _balanceOf[owner]--;
  }

    delete _ownerOf[id];

    delete getApproved[id];

    emit Transfer(owner, address(0), id);
  }

}

/// @notice A generic interface for a contract which properly accepts ERC721 tokens.
/// @author Solmate (https://github.com/transmissions11/solmate/blob/main/src/tokens/ERC721.sol)
abstract contract ERC721TokenReceiver {
  function onERC721Received(
    address,
    address,
    uint256,
    bytes calldata
  ) external virtual returns (bytes4) {
    return ERC721TokenReceiver.onERC721Received.selector;
  }
}
