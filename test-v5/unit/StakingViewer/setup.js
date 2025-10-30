const { ethers } = require('hardhat');
const { expect } = require('chai');

const { hex } = require('../../../lib/helpers');
const { getAccounts } = require('../utils').accounts;
const { Role } = require('../utils').constants;
const { setEtherBalance } = require('../utils').evm;
const { calculateCurrentTrancheId } = require('../utils').stakingPool;

const { parseEther, getContractAddress } = ethers.utils;

const stakedNxmAmount = parseEther('50000');

async function setup() {
  const accounts = await getAccounts();
  const [manager] = accounts.members;

  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');

  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.address]);

  const mcr = await ethers.deployContract('COMockMCR');
  await mcr.setMCR(parseEther('600000'));

  const stakingNFT = await ethers.deployContract('SKMockStakingNFT');
  const coverProducts = await ethers.deployContract('SPMockCoverProducts');

  const nonce = await accounts.defaultSender.getTransactionCount();
  const expectedStakingProductsAddress = getContractAddress({ from: accounts.defaultSender.address, nonce: nonce + 2 });
  const expectedCoverAddress = getContractAddress({ from: accounts.defaultSender.address, nonce: nonce + 4 });

  const coverNFT = await ethers.deployContract('CoverNFT', [
    'CoverNFT',
    'CNFT',
    accounts.defaultSender.address,
    expectedStakingProductsAddress,
  ]);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [expectedStakingProductsAddress]);
  const stakingProducts = await ethers.deployContract('SPMockStakingProducts', [
    expectedCoverAddress,
    stakingPoolFactory.address,
  ]);
  expect(stakingProducts.address).to.equal(expectedStakingProductsAddress);

  const stakingPoolImplementation = await ethers.deployContract('StakingPool', [
    stakingNFT.address,
    nxm.address,
    expectedCoverAddress,
    tokenController.address,
    master.address,
    stakingProducts.address,
  ]);

  const cover = await ethers.deployContract('Cover', [
    coverNFT.address,
    stakingNFT.address,
    stakingPoolFactory.address,
    stakingPoolImplementation.address,
  ]);
  expect(cover.address).to.be.equal(expectedCoverAddress);

  // set contract addresses
  await master.setTokenAddress(nxm.address);
  await master.setLatestAddress(hex('MR'), memberRoles.address);
  await master.setLatestAddress(hex('CO'), cover.address);
  await master.setLatestAddress(hex('TC'), tokenController.address);
  await master.setLatestAddress(hex('MC'), mcr.address);
  await master.setLatestAddress(hex('SP'), stakingProducts.address);
  await master.setLatestAddress(hex('CP'), coverProducts.address);

  await tokenController.setContractAddresses(cover.address, nxm.address);
  await master.setTokenAddress(nxm.address);
  // await master.enrollInternal(accounts.defaultSender.address);
  await nxm.setOperator(tokenController.address);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
  }

  for (const contract of [stakingProducts]) {
    await contract.changeMasterAddress(master.address);
    await contract.changeDependentContractAddress();
    await master.enrollInternal(contract.address);
  }

  // nxm mint and allowance
  await nxm.mint(manager.address, parseEther('100000'));
  await nxm.connect(manager).approve(tokenController.address, ethers.constants.MaxUint256);

  const params = [false, 5, 5, [], 'ipfs hash'];

  const [poolId, poolAddress] = await stakingProducts.connect(manager).callStatic.createStakingPool(...params);
  await stakingProducts.connect(manager).createStakingPool(...params);
  await tokenController.setStakingPoolManager(poolId, manager.address);

  const stakingPool = await ethers.getContractAt('StakingPool', poolAddress);

  // deposit into staking pool
  const trancheId = await calculateCurrentTrancheId();
  const tokenId = await stakingPool
    .connect(manager)
    .callStatic.depositTo(stakedNxmAmount, trancheId, 0, manager.address);
  await stakingPool.connect(manager).depositTo(stakedNxmAmount, trancheId, 0, manager.address);

  const stakingViewer = await ethers.deployContract('StakingViewer', [
    master.address,
    stakingNFT.address,
    stakingPoolFactory.address,
  ]);

  // set ETH balance
  await setEtherBalance(manager.address, ethers.utils.parseEther('10000'));

  return {
    accounts,
    contracts: {
      stakingNFT,
      stakingPoolFactory,
      stakingProducts,
      stakingViewer,
      tokenController,
      stakingPool,
      coverProducts,
      cover,
    },
    stakingPool: {
      stakedNxmAmount,
      poolId,
      tokenIds: [tokenId],
    },
  };
}

module.exports = {
  setup,
};
