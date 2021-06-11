// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "./Distributor.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IMemberRoles.sol";

contract DistributorFactory {
  INXMMaster immutable public master;

  event DistributorCreated(
    address contractAddress,
    address owner,
    uint feePercentage,
    address treasury
  );

  constructor (address masterAddress) {
    master = INXMMaster(masterAddress);
  }

  function newDistributor(
    uint _feePercentage,
    address payable treasury,
    string memory tokenName,
    string memory tokenSymbol
  ) public payable returns (address) {

    IMemberRoles memberRoles = IMemberRoles(master.getLatestAddress("MR"));
    Distributor d = new Distributor(
      master.getLatestAddress("GW"),
      master.tokenAddress(),
      address(master),
      _feePercentage,
      treasury,
      tokenName,
      tokenSymbol
    );
    d.transferOwnership(msg.sender);
    memberRoles.payJoiningFee{ value: msg.value}(address(d));

    emit DistributorCreated(address(d), msg.sender, _feePercentage, treasury);
    return address(d);
  }
}
