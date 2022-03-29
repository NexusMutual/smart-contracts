const { ethers } = require('hardhat');
const { BigNumber, Contract } = require('ethers');
const fs = require('fs');
const addresses = require('./addresses.json');
const { etherscanVerification } = require('./helper');
const { hex } = require('../../lib/helpers');
const { parseEther } = require('ethers/lib/utils');

const WETH_ADDRESS = '0xc778417E063141139Fce010982780140Aa0cD5Ab';

const DAI_ADDRESS = '0x5592ec0cfb4dbc12d3ab100b257153436a1f0fea';
const DAI_DECIMALS = 18;
const DAI_MIN = ethers.utils.parseEther('1');
const DAI_MAX = ethers.utils.parseEther('100000000000');
const DAI_SLIPPAGE = 10000; // 100%

const WBTC_ADDRESS = '0x577D296678535e4903D59A4C929B718e1D575e0A';
const WBTC_DECIMALS = 8;
const WBTC_MIN = ethers.utils.parseEther('1');
const WBTC_MAX = ethers.utils.parseEther('100000000000');
const WBTC_SLIPPAGE = 10000; // 100%

const USDC_ADDRESS = '0x4DBCdF9B62e891a7cec5A2568C3F4FAF9E8Abe2b';
const USDC_DECIMALS = 6;
const USDC_MIN = ethers.utils.parseEther('1');
const USDC_MAX = ethers.utils.parseEther('100000000000');
const USDC_SLIPPAGE = 10000; // 100%

const main = async () => {
  const signer = (await ethers.getSigners())[0];

  console.log('deploying master mock');
  const master = await (await ethers.getContractFactory('MasterMock')).deploy();
  await master.deployTransaction.wait();

  console.log('deploying qd');
  const qd = await (await ethers.getContractFactory('CSMockQuotationData')).deploy();
  await qd.deployTransaction.wait();

  console.log('deploying mcr');
  const mcr = await (await ethers.getContractFactory('MCR')).deploy(master.address);
  await mcr.deployTransaction.wait();

  console.log('deploying aggregator mocks');
  const daiAggregator = await (await ethers.getContractFactory('ChainlinkAggregatorMock')).deploy();
  await daiAggregator.deployTransaction.wait();
  await daiAggregator.setLatestAnswer(parseEther('1')); // prices on rinkeby are arbitrary
  const wbtcAggregator = await (await ethers.getContractFactory('ChainlinkAggregatorMock')).deploy();
  await wbtcAggregator.deployTransaction.wait();
  await wbtcAggregator.setLatestAnswer(parseEther('1')); // prices on rinkeby are arbitrary
  const usdcAggregator = await (await ethers.getContractFactory('ChainlinkAggregatorMock')).deploy();
  await usdcAggregator.deployTransaction.wait();
  await usdcAggregator.setLatestAnswer(parseEther('1')); // prices on rinkeby are arbitrary

  console.log('deploying PriceFeedOracle');
  const priceFeedOracle = await (await ethers.getContractFactory('PriceFeedOracle')).deploy(
    [DAI_ADDRESS, WBTC_ADDRESS, USDC_ADDRESS],
    [daiAggregator.address, wbtcAggregator.address, usdcAggregator.address],
    [18, 8, 6],
  );
  await priceFeedOracle.deployTransaction.wait();

  console.log('deploying pool');
  const poolArgs = [
    [DAI_ADDRESS, WBTC_ADDRESS, USDC_ADDRESS],
    [DAI_DECIMALS, WBTC_DECIMALS, USDC_DECIMALS],
    [DAI_MIN, WBTC_MIN, USDC_MIN],
    [DAI_MAX, WBTC_MAX, USDC_MAX],
    [DAI_SLIPPAGE, WBTC_SLIPPAGE, USDC_SLIPPAGE],
    master.address,
    priceFeedOracle.address,
    ethers.constants.AddressZero,
  ];
  const pool = await (await ethers.getContractFactory('Pool')).deploy(...poolArgs);
  await pool.deployTransaction.wait();

  // console.log('setting pool on master');
  // await (await master.setPool(pool.address)).wait();
  // Setup master, pool and mcr connections
  console.log('Setting up governance and dependencies');
  await (await master.enrollGovernance(signer.address)).wait();
  await (await master.setLatestAddress(hex('QD'), qd.address)).wait();
  await (await master.setLatestAddress(hex('MC'), mcr.address)).wait();
  await (await master.setLatestAddress(hex('P1'), pool.address)).wait();

  await (await pool.changeDependentContractAddress()).wait();
  await (await mcr.changeDependentContractAddress()).wait();

  console.log(`Master: ${master.address}`);
  console.log(`Pool: ${pool.address}`);
  console.log(`PriceFeedOracle: ${priceFeedOracle.address}`);

  const newAddresses = {
    ...addresses,
    pool: pool.address,
    priceFeedOracle: priceFeedOracle.address,
    master: master.address,
  };

  fs.writeFileSync('./scripts/operator/addresses.json', JSON.stringify(newAddresses, null, 2));
  console.log('wrote addresses.json');

  await etherscanVerification(master.address, []);
  await etherscanVerification(priceFeedOracle.address, []);
  await etherscanVerification(pool.address, poolArgs);
};

main()
  .then(() => process.exit())
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
