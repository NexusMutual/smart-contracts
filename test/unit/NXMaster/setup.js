const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');

const { ContractTypes } = require('../utils').constants;
const { hex } = require('../utils').helpers;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('DisposableNXMaster');
  const governance = await ethers.deployContract('MSMockGovernance');
  const token = await ethers.deployContract('NXMTokenMock');

  const { defaultSender } = accounts;

  await governance.changeMasterAddress(master.address);

  const codes = ['GV'];
  const addresses = [governance.address];
  const contractTypes = [ContractTypes.Replaceable];
  await master.initialize(
    defaultSender.address,
    token.address,
    defaultSender.address,
    codes.map(hex), // codes
    contractTypes, // types
    addresses, // addresses
  );

  return {
    master,
    token,
    governance,
    accounts,
  };
}

module.exports = setup;
