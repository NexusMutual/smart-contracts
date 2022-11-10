const { accounts, ethers } = require('hardhat');

const assingRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  internalContracts: accounts.slice(15, 20),
  nonInternalContracts: accounts.slice(20, 25),
  governanceContracts: accounts.slice(25, 30),
  stakingPoolManagers: accounts.slice(30, 35),
  emergencyAdmin: accounts[35],
  generalPurpose: accounts.slice(36),
});

const getAccounts = async () => {
  const accounts = await ethers.getSigners();
  return assingRoles(accounts);
};

const accountRoles = assingRoles(accounts);

module.exports = {
  getAccounts,
  ...accountRoles,
};
