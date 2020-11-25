const { accounts } = require('hardhat');

const [defaultSender] = accounts;
const nonMembers = accounts.slice(1, 5);
const members = accounts.slice(5, 10);
const advisoryBoardMembers = accounts.slice(10, 15);
const internalContracts = accounts.slice(15, 20);
const nonInternalContracts = accounts.slice(20, 25);
const governanceContracts = accounts.slice(25, 30);
const notariseAddress = accounts[30];
const generalPurpose = accounts.slice(35); // 75 general purpose addresses

module.exports = {
  defaultSender,
  nonMembers,
  members,
  advisoryBoardMembers,
  internalContracts,
  nonInternalContracts,
  governanceContracts,
  notariseAddress,
  generalPurpose,
};
