const { accounts } = require('hardhat');

const [defaultSender] = accounts;
const nonMembers = accounts.slice(1, 5);
const members = accounts.slice(5, 10);
const advisoryBoardMembers = accounts.slice(10, 15);
const internalContracts = accounts.slice(15, 20);
const nonInternalContracts = accounts.slice(20, 25);
const governanceContracts = accounts.slice(25, 30);
const stakingPoolManagers = accounts.slice(30, 35);
const generalPurpose = accounts.slice(35); // 65 general purpose addresses

const getAccounts = accounts => {
  const [defaultSender] = accounts;
  const nonMembers = accounts.slice(1, 5);
  const members = accounts.slice(5, 10);
  const advisoryBoardMembers = accounts.slice(10, 15);
  const internalContracts = accounts.slice(15, 20);
  const nonInternalContracts = accounts.slice(20, 25);
  const governanceContracts = accounts.slice(25, 30);
  const stakingPoolManagers = accounts.slice(30, 35);
  const emergencyAdmin = accounts[35];
  const generalPurpose = accounts.slice(36); // 65 general purpose addresses
  return {
    defaultSender,
    nonMembers,
    members,
    advisoryBoardMembers,
    internalContracts,
    nonInternalContracts,
    governanceContracts,
    stakingPoolManagers,
    generalPurpose,
    emergencyAdmin
  };
};

module.exports = {
  getAccounts,
  defaultSender,
  nonMembers,
  members,
  advisoryBoardMembers,
  internalContracts,
  nonInternalContracts,
  governanceContracts,
  stakingPoolManagers,
  generalPurpose,
};
