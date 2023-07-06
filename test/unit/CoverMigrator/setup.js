const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../../utils/accounts');

const { AddressZero } = ethers.constants;

async function setup() {
  const accounts = await getAccounts();
  const master = await ethers.deployContract('MasterMock');
  const productsV1 = await ethers.deployContract('ProductsV1');
  const quotationData = await ethers.deployContract('TestnetQuotationData', [AddressZero, AddressZero]);
  const coverMigrator = await ethers.deployContract('CoverMigrator', [quotationData.address, productsV1.address]);
  const cover = await ethers.deployContract('CMMockCover');
  const distributor = await ethers.deployContract('CMMockDistributor', [coverMigrator.address]);
  const tokenController = await ethers.deployContract('CMMockTokenController');

  await master.setLatestAddress(hex('CL'), coverMigrator.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);

  await master.enrollInternal(coverMigrator.address);

  await master.callChangeMaster(quotationData.address);
  await master.callChangeMaster(coverMigrator.address);
  await coverMigrator.changeDependentContractAddress();

  await master.enrollGovernance(accounts.governanceContracts[0].address);

  return {
    accounts,
    contracts: {
      coverMigrator,
      cover,
      distributor,
      master,
      quotationData,
      tokenController,
      productsV1,
    },
  };
}

module.exports = { setup };
