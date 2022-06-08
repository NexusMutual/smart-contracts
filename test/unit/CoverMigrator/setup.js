const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../../utils/accounts');

async function setup () {
  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const CoverMigrator = await ethers.getContractFactory('CoverMigrator');
  const coverMigrator = await CoverMigrator.deploy();
  await coverMigrator.deployed();

  const Cover = await ethers.getContractFactory('CLMockCover');
  const cover = await Cover.deploy('0x0000000000000000000000000000000000000000');
  await cover.deployed();

  const Distributor = await ethers.getContractFactory('CLMockDistributor');
  const distributor = await Distributor.deploy(coverMigrator.address);
  await distributor.deployed();

  const masterInitTxs = await Promise.all([
    master.setLatestAddress(hex('CL'), coverMigrator.address),
    master.setLatestAddress(hex('CO'), cover.address),
  ]);
  await Promise.all(masterInitTxs.map(x => x.wait()));

  const changeMasterAddressTxs = await Promise.all([master.callChangeMaster(coverMigrator.address)]);
  await Promise.all(changeMasterAddressTxs.map(x => x.wait()));

  {
    const tx = await coverMigrator.changeDependentContractAddress();
    await tx.wait();
  }

  const signers = await ethers.getSigners();
  const accounts = getAccounts(signers);
  await master.enrollGovernance(accounts.governanceContracts[0].address);

  this.accounts = accounts;
  this.contracts = {
    coverMigrator,
    cover,
    distributor,
    master,
  };
}

module.exports = {
  setup,
};
