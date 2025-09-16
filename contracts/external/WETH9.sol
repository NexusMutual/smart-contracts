// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

contract WETH9 {

  string public name = "Wrapped Ether";
  string public symbol = "WETH";
  uint8  public decimals = 18;

  event Approval(address indexed src, address indexed guy, uint wad);
  event Transfer(address indexed src, address indexed dst, uint wad);
  event Deposit(address indexed dst, uint wad);
  event Withdrawal(address indexed src, uint wad);

  mapping(address => uint)                      public  balanceOf;
  mapping(address => mapping(address => uint))  public  allowance;

  function deposit() public payable {
    balanceOf[msg.sender] += msg.value;
    emit Deposit(msg.sender, msg.value);
  }

  function withdraw(uint wad) public {
    require(balanceOf[msg.sender] >= wad, "ERC20: transfer amount exceeds balance");
    balanceOf[msg.sender] -= wad;
    payable(msg.sender).transfer(wad);
    emit Withdrawal(msg.sender, wad);
  }

  function totalSupply() public view returns (uint) {
    return address(this).balance;
  }

  function approve(address guy, uint wad) public returns (bool) {
    allowance[msg.sender][guy] = wad;
    emit Approval(msg.sender, guy, wad);
    return true;
  }

  function transfer(address dst, uint wad) public returns (bool) {
    return transferFrom(msg.sender, dst, wad);
  }

  function transferFrom(address src, address dst, uint wad) public returns (bool){

    if (src != msg.sender && allowance[src][msg.sender] != type(uint).max) {
      require(allowance[src][msg.sender] >= wad, "ERC20: insufficient allowance");
      allowance[src][msg.sender] -= wad;
    }

    require(balanceOf[src] >= wad, "ERC20: transfer amount exceeds balance");

    balanceOf[src] -= wad;
    balanceOf[dst] += wad;

    emit Transfer(src, dst, wad);

    return true;
  }
}
