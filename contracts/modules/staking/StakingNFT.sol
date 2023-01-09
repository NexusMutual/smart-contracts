// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IStakingNFT.sol";

/// @dev Based on Solmate https://github.com/transmissions11/solmate/blob/main/src/tokens/ERC721.sol
contract StakingNFT is IStakingNFT {

  struct TokenInfo {
    uint96 poolId;
    address owner;
  }

  string public name;
  string public symbol;
  address public operator;
  uint96 internal _totalSupply;

  mapping(uint => TokenInfo) internal _tokenInfo;
  mapping(address => uint) internal _balanceOf;
  mapping(uint => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;

  constructor(
    string memory _name,
    string memory _symbol,
    address _operator
  ) {
    name = _name;
    symbol = _symbol;
    operator = _operator;
  }

  // operator functions

  function operatorTransferFrom(address from, address to, uint id) external {
    require(msg.sender == operator, "NOT_OPERATOR");
    require(from == ownerOf(id), "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

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

  function changeOperator(address newOperator) public {
    require(msg.sender == operator, "NOT_OPERATOR");
    require(newOperator != address(0), "INVALID_OPERATOR");
    operator = newOperator;
  }

  // minting and supply

  function mint(uint poolId, address to) public returns (uint id) {

    // TODO: make sure msg.sender is a staking pool
    require(to != address(0), "INVALID_RECIPIENT");

    // counter overflow is incredibly unrealistic
    unchecked {
      id = _totalSupply++;
      _balanceOf[to]++;
    }

    _tokenInfo[id].owner = to;
    _tokenInfo[id].poolId = uint96(poolId);

    emit Transfer(address(0), to, id);
  }

  function totalSupply() public view returns (uint) {
    return _totalSupply;
  }

  // ERC165

  function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
    return
      interfaceId == 0x01ffc9a7 || // ERC165 Interface ID for ERC165
      interfaceId == 0x80ac58cd || // ERC165 Interface ID for ERC721
      interfaceId == 0x5b5e139f;   // ERC165 Interface ID for ERC721Metadata
  }

  // ERC721

  function tokenURI(uint id) public view virtual returns (string memory) {
    // TODO: implement token uri
    id;
    return "NOT IMPLEMENTED";
  }

  function ownerOf(uint id) public view returns (address owner) {
    require((owner = _tokenInfo[id].owner) != address(0), "NOT_MINTED");
  }

  function balanceOf(address owner) public view returns (uint) {
    require(owner != address(0), "ZERO_ADDRESS");
    return _balanceOf[owner];
  }

  function approve(address spender, uint id) public {
    address owner = ownerOf(id);
    require(msg.sender == owner || isApprovedForAll[owner][msg.sender], "NOT_AUTHORIZED");
    getApproved[id] = spender;
    emit Approval(owner, spender, id);
  }

  function setApprovalForAll(address spender, bool approved) public {
    isApprovedForAll[msg.sender][spender] = approved;
    emit ApprovalForAll(msg.sender, spender, approved);
  }

  function isApprovedOrOwner(address spender, uint id) external view returns (bool) {
    address owner = ownerOf(id);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[id];
  }

  function transferFrom(address from, address to, uint id) public {

    require(from == ownerOf(id), "WRONG_FROM");
    require(to != address(0), "INVALID_RECIPIENT");

    require(
      msg.sender == from || isApprovedForAll[from][msg.sender] || msg.sender == getApproved[id],
      "NOT_AUTHORIZED"
    );

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
    require(
      to.code.length == 0 ||
      ERC721TokenReceiver(to).onERC721Received(msg.sender, from, id, "")
        == ERC721TokenReceiver.onERC721Received.selector,
      "UNSAFE_RECIPIENT"
    );
  }

  function safeTransferFrom(
    address from,
    address to,
    uint id,
    bytes calldata data
  ) public {
    transferFrom(from, to, id);
    require(
      to.code.length == 0 ||
      ERC721TokenReceiver(to).onERC721Received(msg.sender, from, id, data)
        == ERC721TokenReceiver.onERC721Received.selector,
      "UNSAFE_RECIPIENT"
    );
  }
}

/// @notice A generic interface for a contract which properly accepts ERC721 tokens.
/// @dev Based on Solmate https://github.com/transmissions11/solmate/blob/main/src/tokens/ERC721.sol
abstract contract ERC721TokenReceiver {
  function onERC721Received(
    address,
    address,
    uint,
    bytes calldata
  ) external pure returns (bytes4) {
    return ERC721TokenReceiver.onERC721Received.selector;
  }
}
