const { ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { init } = require('../../init');

const { parseEther } = ethers;
const { ContractIndexes } = nexus.constants;
const { ETH } = nexus.constants.Assets;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  stakingPoolManagers: accounts.slice(15, 25),
  emergencyAdmins: accounts.slice(25, 30),
  generalPurpose: accounts.slice(30, 35),
  governor: accounts.slice(35, 36),
  claims: accounts.slice(36, 37),
});

async function setup() {
  await loadFixture(init);
  const accounts = assignRoles(await ethers.getSigners());
  const [governor] = accounts.governor;
  const [claims] = accounts.claims;
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

  const cbBTCDecimals = 8;
  const cbBTC = await ethers.deployContract('ERC20Mock');
  await cbBTC.setMetadata('MockcbBTC', 'cbBTC', cbBTCDecimals);

  const ethAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await ethAggregator.setLatestAnswer(parseEther('1'));

  const usdcAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await usdcAggregator.setLatestAnswer(parseEther('1'));

  const cbBTCAggregator = await ethers.deployContract('ChainlinkAggregatorMock');
  await cbBTCAggregator.setLatestAnswer(parseEther('1'));
  await cbBTCAggregator.setDecimals(8);

  await oldPool.addAsset(ETH, true);
  await oldPriceFeedOracle.setAssetAggregator(ETH, ethAggregator, 0);

  await oldPool.addAsset(usdc, true);
  await oldPriceFeedOracle.setAssetAggregator(usdc, usdcAggregator, 0);

  await oldPool.addAsset(cbBTC, true);
  await oldPriceFeedOracle.setAssetAggregator(cbBTC, cbBTCAggregator, 1);

  await registry.addContract(
    ContractIndexes.C_GOVERNOR,
    governor,
    false, // registry does not track itself as a proxy
  );

  await registry.addContract(ContractIndexes.C_REGISTRY, registry, false);
  await registry.addContract(ContractIndexes.C_COVER, cover, false);
  await registry.addContract(ContractIndexes.C_RAMM, ramm, false);
  await registry.addContract(ContractIndexes.C_SWAP_OPERATOR, swapOperator, false);
  await registry.addContract(ContractIndexes.C_CLAIMS, claims, false);

  const pool = await ethers.deployContract('Pool', [registry]);

  // TODO: this needs to be done using DisposablePool to initialize the values
  //       then we can use a proxy and upgrade to the actual contract
  //       or override contract code directly using setCode

  // mocking master address
  await cover.setCoverProducts(oldMCR);
  await oldMCR.setMaster(governor); // oldMcr is used as coverProducts during Pool migration
  await pool.connect(governor).migrate(oldPool, oldMCR);

  const MCR_RATIO_DECIMALS = await pool.MCR_RATIO_DECIMALS();
  const MAX_MCR_ADJUSTMENT = await pool.MAX_MCR_ADJUSTMENT();
  const MAX_MCR_INCREMENT = await pool.MAX_MCR_INCREMENT();
  const BASIS_PRECISION = await pool.BASIS_PRECISION();
  const GEARING_FACTOR = await pool.GEARING_FACTOR();
  const MIN_UPDATE_TIME = await pool.MIN_UPDATE_TIME();
  const MAX_SLIPPAGE_DENOMINATOR = await pool.MAX_SLIPPAGE_DENOMINATOR();

  return {
    accounts,
    governor,
    registry,
    pool,
    cover,
    claims,
    ramm,
    swapOperator,
    usdc,
    usdcAggregator,
    cbBTC,
    cbBTCAggregator,
    constants: {
      MCR_RATIO_DECIMALS,
      MAX_MCR_ADJUSTMENT,
      MAX_MCR_INCREMENT,
      BASIS_PRECISION,
      GEARING_FACTOR,
      MIN_UPDATE_TIME,
      MAX_SLIPPAGE_DENOMINATOR,
    },
  };
}

module.exports = setup;
