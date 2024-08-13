require('dotenv').config();
const { ethers, network } = require('hardhat');
// const { getAccounts } = require('../../utils/accounts');
const { hex } = require('../utils').helpers;
const { evm } = require('../utils');

const { parseEther, parseUnits } = ethers.utils;

const USDC_DECIMALS = 6;
const COW_SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';
const GNOSIS_USDC_ADDRESS = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';
const GNOSIS_USDT_ADDRESS = '0x4ECaBa5870353805a9F068101A40E0f32ed605C6';
const GNOSIS_WXDAI_ADDRESS = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d';

async function setup() {
  // Get or revert snapshot if network is tenderly
  if (network.name === 'tenderly') {
    const { TENDERLY_SNAPSHOT_ID } = process.env;
    if (TENDERLY_SNAPSHOT_ID) {
      await evm.revertToSnapshot(TENDERLY_SNAPSHOT_ID);
      console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
    } else {
      console.log('Snapshot ID: ', await evm.takeSnapshot());
    }
  }
  // const accounts = await getAccounts();

  // Owner and governance account is the same, same as swapController
  const owner = new ethers.Wallet(process.env.GNOSIS_ACCOUNT_KEY, ethers.provider);
  const governance = owner;
  const beforeBalance = await ethers.provider.getBalance(owner.address);
  console.log('current balance: ', beforeBalance.toString());

  const Pool = await ethers.getContractFactory('PoolMockCowSwap');
  const SwapOperator = await ethers.getContractFactory('SwapOperator');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');

  // GNOSIS
  const weth = await ethers.getContractAt('SOMockWeth', '0x0315deBA093423852F02e30C950C91fa589c0f89');
  const dai = await ethers.getContractAt('ERC20Mock', '0xDb52FB80ED6adB49aD3665fD2F35bFB0d66e4EdE');
  const stEth = await ethers.getContractAt('ERC20Mock', '0x05EEBE12ec6D89E2ff984025dDDf718fb8cF1285');
  const master = await ethers.getContractAt('MasterMock', '0x3f27B9baA86077c428258fA4939F71B19a25858a');

  console.log('erc20 mock / master deploy done');
  // console.log({
  //   weth: weth.address,
  //   dai: dai.address,
  //   stEth: stEth.address,
  //   master: master.address,
  // });

  // Deploy price aggregators
  // const daiAggregator = await ChainlinkAggregatorMock.deploy();
  // const stethAggregator = await ChainlinkAggregatorMock.deploy();
  // console.log({
  //   daiAggregator: daiAggregator.address,
  //   stethAggregator: stethAggregator.address,
  // });

  // GNOSIS
  const daiAggregator = await ethers.getContractAt(
    'ChainlinkAggregatorMock',
    '0x3c05fefFd6E94778E91273A622e8AE9f8C7a5550',
  );
  const stethAggregator = await ethers.getContractAt(
    'ChainlinkAggregatorMock',
    '0xdaf2B4efCE6eC6E63650A9CAF39bD367e394917A',
  );
  const usdcAggregator = await ethers.getContractAt(
    'ChainlinkAggregatorMock',
    '0xB57a918dF3e8549c88cFc2d2452caae28b270F0f',
  );
  const usdtAggregator = await ethers.getContractAt(
    'ChainlinkAggregatorMock',
    '0x69317BF21CADf10Fc8F0EDF9A92A44E95E39aDF8',
  );
  // const usdcAggregator = await ChainlinkAggregatorMock.deploy();
  // const usdtAggregator = await ChainlinkAggregatorMock.deploy();
  // await usdcAggregator.setLatestAnswer(parseEther('1')); // gnosis 1 usdc = 1 xdai
  // await usdtAggregator.setLatestAnswer(parseEther('1')); // gnosis 1 usdc = 1 xdai
  console.log({
    usdcAggregator: usdcAggregator.address,
    usdtAggregator: usdtAggregator.address,
  });

  console.log('setting latest answer daiAggregator');
  // await daiAggregator.setLatestAnswer(0.0004 * 1e18); // 1 dai = 0.0004 eth, 1 eth = 2500 dai
  console.log('setting latest answer stethAggregator');
  // await stethAggregator.setLatestAnswer(parseEther('1')); // 1 steth = 1 eth
  // await usdcAggregator.setLatestAnswer(0.0004 * 1e18); // 1 usdc = 0.0004 eth, 1 eth = 2500 dai

  console.log('deploying priceFeedOracle');
  // Deploy PriceFeedOracle
  const GNOSIS_USDC_ADDRESS = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';
  const GNOSIS_USDT_ADDRESS = '0x4ECaBa5870353805a9F068101A40E0f32ed605C6';
  // const priceFeedOracle = await PriceFeedOracle.deploy(
  //   [dai.address, stEth.address, GNOSIS_USDC_ADDRESS, GNOSIS_USDT_ADDRESS],
  //   [daiAggregator.address, stethAggregator.address, usdcAggregator.address, usdtAggregator.address],
  //   [18, 18, 6, 6],
  // );
  // GNOSIS
  const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0x667a530889ce2d890B57E9bEaAed0A2F00ac9340');
  console.log('priceFeedOracle done', priceFeedOracle.address);

  // const pool = await Pool.deploy(owner.address, dai.address, stEth.address);
  // console.log('pool deploy done', pool.address);
  // SEPOLIA
  // const pool = await ethers.getContractAt('PoolMockCowSwap', '0xAB1E07497166E456dFfBC608b573c3B5330a06b3');
  // GNOSIS
  const pool = await ethers.getContractAt('PoolMockCowSwap', '0x7183a0272aBF15B35109fe9992b16304cf5C8860');

  // Setup master, token, token controller, pool and mcr connections
  // console.log('setting master enrollGovernance/P1 setLatestAddress');
  // await master.enrollGovernance(governance.address);
  // await master.setLatestAddress(hex('P1'), pool.address);

  // Deploy SwapOperator
  console.log('deploying swapOperator...');
  // const GNOSIS_WRAPPED_XDAI = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d';
  // const swapOperator = await SwapOperator.deploy(
  //   COW_SETTLEMENT_ADDRESS,
  //   owner.address, // swapController account
  //   master.address,
  //   GNOSIS_WRAPPED_XDAI,
  //   ethers.constants.AddressZero, // enzymeV4Vault
  //   ethers.constants.AddressZero, // safe
  //   dai.address,
  //   GNOSIS_USDC_ADDRESS,
  //   ethers.constants.AddressZero, // enzymeFundValueCalculatorRouter
  //   parseEther('0.0001'), // minPoolEth
  // );

  // SEPOLIA
  // const swapOperator = await ethers.getContractAt('SwapOperator', '0x759556e9B66bdE59289a44C8E6BB3a798231153D');

  // GNOSIS
  const swapOperator = await ethers.getContractAt('SwapOperator', '0xB018ffa6c0319423730EF58a1DE57cd06b8bC328');
  console.log('swapOperator done', swapOperator.address);

  // Setup pool's swap operator
  console.log('setting pool SWP_OP/PRC_FEED');
  // await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), swapOperator.address);
  await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address);

  // Add asset to pool
  await pool.addAsset(GNOSIS_WXDAI_ADDRESS, false);
  await pool.addAsset(GNOSIS_USDC_ADDRESS, false);
  await pool.addAsset(GNOSIS_USDT_ADDRESS, false);

  // Set Swap details
  const daiMinAmount = parseEther('3000');
  const daiMaxAmount = parseEther('20000');
  const stEthMinAmount = parseEther('10');
  const stEthMaxAmount = parseEther('20');

  console.log('setting pool dai/stEth SwapDetails');
  // await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 0);
  // await pool.connect(governance).setSwapDetails(stEth.address, stEthMinAmount, stEthMaxAmount, 0);
  // await pool
  //   .connect(owner)
  //   .setSwapDetails(GNOSIS_USDC_ADDRESS, parseUnits('10', USDC_DECIMALS), parseUnits('20', USDC_DECIMALS), 250);
  // await pool
  //   .connect(owner)
  //   .setSwapDetails(GNOSIS_USDT_ADDRESS, parseUnits('10', USDC_DECIMALS), parseUnits('20', USDC_DECIMALS), 250);

  const afterBalance = await ethers.provider.getBalance(owner.address);
  console.log('afterBalance: ', afterBalance);
}

setup()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

// module.exports = setup;

// TODO: poke around the settings and check the values (pool settings, balances, master settings)
// TODO: do we need to mint weth tokens? check test
