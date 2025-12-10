const { ethers } = require('hardhat');

async function setup() {
  const [
    deployer,
    defaultAdmin,
    adminFeeClaimer,
    adminFeeSetter,
    networkOwner,
    middleware,
    staker1,
    staker2,
    recipient,
    other,
  ] = await ethers.getSigners();

  const registry = await ethers.deployContract('DSRMockRegistry');
  const middlewareService = await ethers.deployContract('DSRMockNetworkMiddlewareService');
  const vault = await ethers.deployContract('DSRMockVault');
  const token = await ethers.deployContract('ERC20Mock');

  await registry.setEntity(vault.target, true);

  const rewardsImplementation = await ethers.deployContract('DefaultStakerRewards', [
    registry.target,
    middlewareService.target,
  ]);
  const factory = await ethers.deployContract('DefaultStakerRewardsFactory', [rewardsImplementation.target]);

  const initParams = {
    vault: vault.target,
    defaultAdminRoleHolder: defaultAdmin.address,
    adminFee: 500n, // 5%
    adminFeeClaimRoleHolder: adminFeeClaimer.address,
    adminFeeSetRoleHolder: adminFeeSetter.address,
  };

  const rewardsAddress = await factory.create.staticCall(initParams);
  await factory.create(initParams);
  const rewards = await ethers.getContractAt('DefaultStakerRewards', rewardsAddress);

  const NETWORK_ID = networkOwner.address;
  await middlewareService.setMiddleware(NETWORK_ID, middleware.address);

  await token.mint(middleware.address, ethers.parseEther('100000'));

  const ADMIN_FEE_BASE = 10000;

  return {
    accounts: {
      deployer,
      defaultAdmin,
      adminFeeClaimer,
      adminFeeSetter,
      networkOwner,
      middleware,
      staker1,
      staker2,
      recipient,
      other,
    },
    contracts: {
      registry,
      middlewareService,
      vault,
      token,
      rewards,
      rewardsImplementation,
      factory,
    },
    constants: {
      ADMIN_FEE_BASE,
      NETWORK_ID,
    },
  };
}

module.exports = { setup };
