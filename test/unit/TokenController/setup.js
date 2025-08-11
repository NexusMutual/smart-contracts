const { ethers, nexus } = require('hardhat');
const { parseEther } = ethers;

const { ContractIndexes } = nexus.constants;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  stakingPoolManagers: accounts.slice(15, 25),
  emergencyAdmins: accounts.slice(25, 30),
  generalPurpose: accounts.slice(30, 35),
  governor: accounts.slice(35, 36),
  cover: accounts.slice(36, 37),
  stakingProducts: accounts.slice(37, 38),
  ramm: accounts.slice(38, 39),
});

async function setup() {
  const accounts = assignRoles(await ethers.getSigners());
  const [governor] = accounts.governor;
  const [cover] = accounts.cover;
  const [stakingProducts] = accounts.stakingProducts;
  const [ramm] = accounts.ramm;

  const registry = await ethers.deployContract('TCMockRegistry', []);
  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [accounts.defaultSender.address]);
  const nxm = await ethers.deployContract('NXMTokenMock');
  const stakingNFT = await ethers.deployContract('TCMockStakingNFT', []);
  const pool = await ethers.deployContract('TCMockPool');

  await Promise.all([
    registry.addContract(ContractIndexes.C_GOVERNOR, governor, false),
    registry.addContract(ContractIndexes.C_REGISTRY, registry, false),
    registry.addContract(ContractIndexes.C_TOKEN, nxm, false),
    registry.addContract(ContractIndexes.C_STAKING_NFT, stakingNFT, false),
    registry.addContract(ContractIndexes.C_POOL, pool, false),
    registry.addContract(ContractIndexes.C_COVER, cover, false),
    registry.addContract(ContractIndexes.C_STAKING_PRODUCTS, stakingProducts, false),
    registry.addContract(ContractIndexes.C_RAMM, ramm, false),
  ]);

  const tokenController = await ethers.deployContract('TokenController', [registry, stakingPoolFactory]);

  const amount = parseEther('100');
  await nxm.setOperator(tokenController);

  for (const member of accounts.members) {
    await nxm.mint(member.address, amount);
    await nxm.addToWhiteList(member.address);
  }

  return {
    contracts: {
      nxm,
      pool,
      registry,
      stakingPoolFactory,
      stakingNFT,
      tokenController,
    },
    accounts,
  };
}

module.exports = setup;
