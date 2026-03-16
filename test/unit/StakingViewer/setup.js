const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { getAccounts, calculateCurrentTrancheId } = require('../utils');

const { parseEther, getCreateAddress, MaxUint256 } = ethers;
const { ContractIndexes, Role } = nexus.constants;
const { hex } = nexus.helpers;

const stakedNxmAmount = parseEther('50000');

async function setup() {
  const accounts = await getAccounts();
  const [manager] = accounts.members;

  const master = await ethers.deployContract('MasterMock');
  const memberRoles = await ethers.deployContract('MemberRolesMock');

  const nxm = await ethers.deployContract('NXMTokenMock');
  const tokenController = await ethers.deployContract('TokenControllerMock', [nxm.target]);

  const stakingNFT = await ethers.deployContract('SKMockStakingNFT');
  const coverProducts = await ethers.deployContract('SPMockCoverProducts');

  const nonce = await accounts.defaultSender.getNonce();
  const expectedStakingProductsAddress = getCreateAddress({ from: accounts.defaultSender.address, nonce: nonce + 2 });
  const expectedCoverAddress = getCreateAddress({ from: accounts.defaultSender.address, nonce: nonce + 4 });

  const coverNFT = await ethers.deployContract('CoverNFT', [
    'CoverNFT',
    'CNFT',
    accounts.defaultSender.address,
    expectedStakingProductsAddress,
  ]);

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [expectedStakingProductsAddress]);
  const stakingProducts = await ethers.deployContract('SPMockStakingProducts', [
    expectedCoverAddress,
    stakingPoolFactory.target,
  ]);
  expect(stakingProducts.target).to.equal(expectedStakingProductsAddress);

  const stakingPoolImplementation = await ethers.deployContract('StakingPool', [
    stakingNFT.target,
    nxm.target,
    expectedCoverAddress,
    tokenController.target,
    master.target,
    stakingProducts.target,
  ]);

  const cover = await ethers.deployContract('SPMockCover', [
    coverNFT.target,
    stakingNFT.target,
    stakingPoolFactory.target,
    stakingPoolImplementation.target,
    coverProducts.target,
  ]);
  expect(cover.target).to.be.equal(expectedCoverAddress);

  // set contract addresses
  await master.setTokenAddress(nxm.target);
  await master.setLatestAddress(hex('MR'), memberRoles.target);
  await master.setLatestAddress(hex('CO'), cover.target);
  await master.setLatestAddress(hex('TC'), tokenController.target);
  await master.setLatestAddress(hex('SP'), stakingProducts.target);
  await master.setLatestAddress(hex('CP'), coverProducts.target);

  await nxm.setOperator(tokenController.target);

  for (const member of accounts.members) {
    await master.enrollMember(member.address, Role.Member);
    await memberRoles.setRole(member.address, Role.Member);
  }

  await stakingProducts.changeMasterAddress(master.target);
  await stakingProducts.changeDependentContractAddress();
  await master.enrollInternal(stakingProducts.target);

  // nxm mint and allowance
  await nxm.mint(manager.address, parseEther('100000'));
  await nxm.connect(manager).approve(tokenController.target, MaxUint256);

  const params = [false, 5, 5, [], 'ipfs hash'];

  const [poolId, poolAddress] = await stakingProducts.connect(manager).createStakingPool.staticCall(...params);
  await stakingProducts.connect(manager).createStakingPool(...params);
  await tokenController.setStakingPoolManager(poolId, manager.address);

  const stakingPool = await ethers.getContractAt('StakingPool', poolAddress);

  // deposit into staking pool
  const trancheId = await calculateCurrentTrancheId();
  const tokenId = await stakingPool
    .connect(manager)
    .depositTo.staticCall(stakedNxmAmount, trancheId, 0, manager.address);
  await stakingPool.connect(manager).depositTo(stakedNxmAmount, trancheId, 0, manager.address);

  const registry = await ethers.deployContract('RegistryMock');
  await registry.addContract(ContractIndexes.C_STAKING_NFT, stakingNFT.target, false);
  await registry.addContract(ContractIndexes.C_STAKING_POOL_FACTORY, stakingPoolFactory.target, false);
  await registry.addContract(ContractIndexes.C_STAKING_PRODUCTS, stakingProducts.target, false);
  await registry.addContract(ContractIndexes.C_COVER_PRODUCTS, coverProducts.target, false);

  const stakingViewer = await ethers.deployContract('StakingViewer', [registry.target]);

  // set ETH balance
  await setBalance(manager.address, parseEther('10000'));

  return {
    accounts,
    contracts: {
      stakingNFT,
      stakingPoolFactory,
      stakingProducts,
      stakingViewer,
      tokenController,
      nxm,
      stakingPool,
      coverProducts,
      cover,
      registry,
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
