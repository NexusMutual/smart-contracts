const { ethers } = require('hardhat');

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  internalContracts: accounts.slice(15, 20),
  nonInternalContracts: accounts.slice(20, 25),
  governanceContracts: accounts.slice(25, 30),
  stakingPoolManagers: accounts.slice(30, 40),
  emergencyAdmin: accounts[40],
  generalPurpose: accounts.slice(41),
  assessors: accounts.slice(41, 46),
});

const getAccounts = async () => {
  const accounts = await ethers.getSigners();
  return assignRoles(accounts);
};

module.exports = {
  getAccounts,
};
