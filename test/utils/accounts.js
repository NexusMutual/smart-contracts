const { accounts } = require('@openzeppelin/test-environment');

const nonMembers = accounts.slice(0, 5);
const members = accounts.slice(5, 10);
const advisoryBoardMembers = accounts.slice(10, 15);
const internalContracts = accounts.slice(15, 20);
const governanceContracts = accounts.slice(20, 25);
const generalPurpose = accounts.slice(25); // 75 general purpose addresses

module.exports = {
  nonMembers,
  members,
  advisoryBoardMembers,
  internalContracts,
  governanceContracts,
  generalPurpose,
};
