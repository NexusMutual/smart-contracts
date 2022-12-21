const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../../utils/accounts');

const { AddressZero } = ethers.constants;

async function setup() {
  const Master = await ethers.getContractFactory('MasterMock');
  const master = await Master.deploy();
  await master.deployed();

  const ProductsV1 = await ethers.getContractFactory('ProductsV1');
  const productsV1 = await ProductsV1.deploy();

  const QuotationData = await ethers.getContractFactory('MockLegacyQuotationData');
  const quotationData = await QuotationData.deploy(AddressZero, AddressZero);

  const CoverMigrator = await ethers.getContractFactory('CoverMigrator');
  const coverMigrator = await CoverMigrator.deploy(quotationData.address, productsV1.address);

  const Cover = await ethers.getContractFactory('CMMockCover');
  const cover = await Cover.deploy();

  const Distributor = await ethers.getContractFactory('CMMockDistributor');
  const distributor = await Distributor.deploy(coverMigrator.address);

  const TokenController = await ethers.getContractFactory('CMMockTokenController');
  const tokenController = await TokenController.deploy();

  await master.setLatestAddress(hex('CL'), coverMigrator.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);

  await master.enrollInternal(coverMigrator.address);

  await master.callChangeMaster(quotationData.address);
  await master.callChangeMaster(coverMigrator.address);
  await coverMigrator.changeDependentContractAddress();

  const accounts = await getAccounts();
  await master.enrollGovernance(accounts.governanceContracts[0].address);

  this.accounts = accounts;
  this.contracts = {
    coverMigrator,
    cover,
    distributor,
    master,
    quotationData,
    tokenController,
    productsV1,
  };
}

module.exports = { setup };
