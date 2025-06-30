const { ethers, nexus } = require('hardhat');
const { ContractIndexes } = nexus.constants;

const { parseEther } = ethers;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  stakingPoolManagers: accounts.slice(15, 25),
  emergencyAdmins: accounts.slice(25, 30),
  generalPurpose: accounts.slice(30, 35),
  governor: accounts.slice(35, 36),
  assessment: accounts.slice(36, 37),
});

async function setup() {
  const accounts = assignRoles(await ethers.getSigners());
  const [governor] = accounts.governor;
  const [assessment] = accounts.assessment;
  const registry = await ethers.deployContract('P1MockRegistry', []);
  const cover = await ethers.deployContract('P1MockCover', []);
  const ramm = await ethers.deployContract('P1MockRamm', []);
  const swapOperator = await ethers.deployContract('P1MockSwapOperator', []);
  const oldPool = await ethers.deployContract('P1MockOldPool', []);
  const oldMCR = await ethers.deployContract('P1MockMCR', []);
  const oldPriceFeedOracle = await ethers.deployContract('P1MockPriceFeedOracle', []);

  await oldPool.setPriceFeedOracle(oldPriceFeedOracle);

  const usdcDecimals = 6;
  const usdc = await ethers.deployContract('ERC20Mock');
  await usdc.setMetadata('MockUsdc', 'USDC', usdcDecimals);

  const usdcAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await usdcAggregator.setLatestAnswer(parseEther('1'));

  await oldPool.addAsset(usdc, true);
  await oldPriceFeedOracle.setAssetAggregator(usdc, usdcAggregator, 0);

  await Promise.all([
    registry.addContract(
      ContractIndexes.C_GOVERNOR,
      governor,
      false, // registry does not track itself as a proxy
    ),
    registry.addContract(ContractIndexes.C_REGISTRY, registry, false),
    registry.addContract(ContractIndexes.C_COVER, cover, false),
    registry.addContract(ContractIndexes.C_RAMM, ramm, false),
    registry.addContract(ContractIndexes.C_SWAP_OPERATOR, swapOperator, false),
    registry.addContract(ContractIndexes.C_ASSESSMENT, assessment, false),
  ]);
  const pool = await ethers.deployContract('Pool', [registry]);

  await pool.connect(governor).migrate(oldPool, oldMCR);

  return {
    accounts,
    assessment,
    governor,
    registry,
    pool,
    cover,
    ramm,
    swapOperator,
    usdc,
    usdcAggregator,
  };
}

module.exports = setup;
