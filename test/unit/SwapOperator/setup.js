const { ethers, network } = require('hardhat');
// const { getAccounts } = require('../../utils/accounts');
const { hex } = require('../utils').helpers;
const { evm } = require('../utils');

const { parseEther } = ethers.utils;

const COW_SETTLEMENT_ADDRESS = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

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

  // Owner and governance account is the same
  const OWNER_PK = 'ca0e8abd66d05a20bc204176f3829da57d7407411f308f88983820b7c5da0b48'; // has some sepolia ETH
  const TRADER_PK = '5fb8a6805e34bb0ab87332e575e8ce5c647a2c52a05f3b0d378bef9d832ae414';
  const owner = new ethers.Wallet(OWNER_PK, ethers.provider);
  const trader = new ethers.Wallet(TRADER_PK, ethers.provider);
  const governance = owner;
  const beforeBalance = await ethers.provider.getBalance(owner.address);

  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('PoolMockCowSwap');
  const SwapOperator = await ethers.getContractFactory('SwapOperator');
  const ERC20Dai = await ethers.getContractFactory('ERC20Dai');
  const ERC20StEth = await ethers.getContractFactory('ERC20StEth');
  const SOMockWeth = await ethers.getContractFactory('SOMockWeth');
  const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
  const ChainlinkAggregatorMock = await ethers.getContractFactory('ChainlinkAggregatorMock');
  // const TokenController = await ethers.getContractFactory('TokenControllerMock');
  // const TokenMock = await ethers.getContractFactory('NXMTokenMock');
  // const LegacyPool = await ethers.getContractFactory('LegacyPool');
  // const MCR = await ethers.getContractFactory('MCR');
  // const ERC20CustomDecimalsMock = await ethers.getContractFactory('ERC20CustomDecimalsMock');
  // const SOMockSettlement = await ethers.getContractFactory('SOMockSettlement');
  // const SOMockVaultRelayer = await ethers.getContractFactory('SOMockVaultRelayer');
  // const SOMockEnzymeV4Comptroller = await ethers.getContractFactory('SOMockEnzymeV4Comptroller');
  // const SOMockEnzymeFundValueCalculatorRouter = await ethers.getContractFactory(
  //   'SOMockEnzymeFundValueCalculatorRouter',
  // );
  // const SOMockEnzymeV4Vault = await ethers.getContractFactory('SOMockEnzymeV4Vault');

  // Deploy WETH + ERC20 test tokens
  console.log('current balance: ', beforeBalance.toString());
  // const weth = await SOMockWeth.deploy();
  // const dai = await ERC20Dai.deploy();
  // const stEth = await ERC20StEth.deploy();

  // Deploy Master, MCR, TC, NXMToken
  // const master = await MasterMock.deploy();

  // SEPOLIA
  // const weth = await ethers.getContractAt('SOMockWeth', '0xfABAcE08E021F7cBb2EDc95F358ee3ef87D33Ad1');
  // const dai = await ethers.getContractAt('ERC20Mock', '0x49dc690e3c67F4544CeeaDcFc02780B128aD2578');
  // const stEth = await ethers.getContractAt('ERC20Mock', '0xD99Ab0cDB81bb15448FD6d7D3da08CE20455152d');
  // const master = await ethers.getContractAt('MasterMock', '0xEa8862d84a2D4b37E85811f98e0a4C22A5f5f364');

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
  // })

  // SEPOLIA
  // const daiAggregator = await ethers.getContractAt(
  //   'ChainlinkAggregatorMock',
  //   '0x228A206b28B66Aff45c7c666EFA9EbBab8cD335A',
  // );
  // const stethAggregator = await ethers.getContractAt(
  //   'ChainlinkAggregatorMock',
  //   '0xAaA081A81bD34dB71F0262927c1d5e5ECe8DC33e',
  // );

  // GNOSIS
  const daiAggregator = await ethers.getContractAt(
    'ChainlinkAggregatorMock',
    '0x472c54eb97e224bbf957ac2b43caf93fad1f27d6',
  );
  const stethAggregator = await ethers.getContractAt(
    'ChainlinkAggregatorMock',
    '0xa9d715ef755c69680c0d5ee8100d86d1db82148e',
  );
  // const usdcAggregator = await ChainlinkAggregatorMock.deploy();
  // const usdtAggregator = await ChainlinkAggregatorMock.deploy();
  // await usdcAggregator.setLatestAnswer(parseEther('1')); // gnosis 1 usdc = 1 xdai
  // await usdtAggregator.setLatestAnswer(parseEther('1')); // gnosis 1 usdc = 1 xdai
  // console.log({
  //   usdcAggregator: usdcAggregator.address,
  //   usdtAggregator: usdtAggregator.address,
  // });

  // console.log('setting lastest answer daiAggregator');
  // await daiAggregator.setLatestAnswer(0.0004 * 1e18); // 1 dai = 0.0004 eth, 1 eth = 2500 dai
  // console.log('setting lastest answer stethAggregator');
  // await stethAggregator.setLatestAnswer(parseEther('1')); // 1 steth = 1 eth
  // const usdcAggregator = await ChainlinkAggregatorMock.deploy();
  // await usdcAggregator.setLatestAnswer(0.0004 * 1e18); // 1 usdc = 0.0004 eth, 1 eth = 2500 dai

  // const enzymeV4VaultAggregator = await ChainlinkAggregatorMock.deploy();
  // await enzymeV4VaultAggregator.setLatestAnswer(parseEther('1')); // 1 ETH = 1 share

  /* deploy enzyme mocks */
  // const enzymeV4Comptroller = await SOMockEnzymeV4Comptroller.deploy(weth.address);

  /* move weth to Comptroller */

  // const comptrollerWethReserves = parseEther('10000');
  // await weth.deposit({ value: comptrollerWethReserves });
  // await weth.transfer(enzymeV4Comptroller.address, comptrollerWethReserves);

  // const enzymeV4Vault = await SOMockEnzymeV4Vault.deploy(
  //   enzymeV4Comptroller.address,
  //   'Enzyme V4 Vault Share ETH',
  //   'EVSE',
  //   18,
  // );

  // await enzymeV4Comptroller.setVault(enzymeV4Vault.address);

  // const enzymeFundValueCalculatorRouter = await SOMockEnzymeFundValueCalculatorRouter.deploy(weth.address);

  console.log('deploying priceFeedOracle');
  // Deploy PriceFeedOracle
  const GNOSIS_USDC_ADDRESS = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';
  const GNOSIS_USDT_ADDRESS = '0x4ECaBa5870353805a9F068101A40E0f32ed605C6';
  // const priceFeedOracle = await PriceFeedOracle.deploy(
  //   [dai.address, stEth.address, GNOSIS_USDC_ADDRESS, GNOSIS_USDT_ADDRESS],
  //   [daiAggregator.address, stethAggregator.address, usdcAggregator.address, usdtAggregator.address],
  //   [18, 18, 6, 6],
  // );
  // SEPOLIA
  // const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0xE205970C0Af83a1E6cC17FdE3a0b00CdDE90054F');
  // GNOSIS
  const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0xcB7542DcC55129a099601a081E1c276799716478');
  console.log('priceFeedOracle done', priceFeedOracle.address);

  // const pool = await Pool.deploy(owner.address, dai.address, stEth.address);
  // console.log('pool deploy done', pool.address);
  // SEPOLIA
  // const pool = await ethers.getContractAt('PoolMockCowSwap', '0xAB1E07497166E456dFfBC608b573c3B5330a06b3');
  // GNOSIS
  const pool = await ethers.getContractAt('PoolMockCowSwap', '0xfABAcE08E021F7cBb2EDc95F358ee3ef87D33Ad1');

  // Setup master, token, token controller, pool and mcr connections
  // console.log('setting master enrollGovernance/P1 setLatestAddress');
  // await master.enrollGovernance(governance.address);
  // await master.setLatestAddress(hex('P1'), pool.address);

  // Deploy SwapOperator
  // console.log('deploying swapOperator...');
  const GNOSIS_WRAPPED_XDAI = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d';
  const swapOperator = await SwapOperator.deploy(
    COW_SETTLEMENT_ADDRESS,
    owner.address, // swapController account
    master.address,
    GNOSIS_WRAPPED_XDAI,
    ethers.constants.AddressZero, // enzymeV4Vault
    ethers.constants.AddressZero, // enzymeFundValueCalculatorRouter
    parseEther('0.0001'),
  );
  console.log('swapOperator done', swapOperator.address);

  // SEPOLIA
  // const swapOperator = await ethers.getContractAt('SwapOperator', '0x759556e9B66bdE59289a44C8E6BB3a798231153D');

  // GNOSIS
  // const swapOperator = await ethers.getContractAt('SwapOperator', '0x70430e1970543d1f5317519325A485A580D87c69');

  // Setup pool's swap operator
  console.log('setting pool SWP_OP/PRC_FEED');
  await pool.connect(governance).updateAddressParameters(hex('SWP_OP'.padEnd(8, '\0')), swapOperator.address);
  // await pool.connect(governance).updateAddressParameters(hex('PRC_FEED'.padEnd(8, '\0')), priceFeedOracle.address);

  // Set Swap details
  const daiMinAmount = parseEther('3000');
  const daiMaxAmount = parseEther('20000');
  const stethMinAmount = parseEther('10');
  const stethMaxAmount = parseEther('20');

  console.log('setting pool dai/stEth SwapDetails');
  // await pool.connect(governance).setSwapDetails(dai.address, daiMinAmount, daiMaxAmount, 0);
  // await pool.connect(governance).setSwapDetails(stEth.address, stethMinAmount, stethMaxAmount, 0);

  // Fund the pool contract
  console.log('minting stEth and dai to pool');
  // await stEth.mint(pool.address, parseEther('50'));
  // await dai.mint(pool.address, parseEther('2500'));

  // mint / approve trader
  console.log('minting stETH and dai to trader');
  // await weth.mint(trader.address, parseEther('500'));
  // await stEth.mint(trader.address, parseEther('500'));
  // await dai.mint(trader.address, parseEther('1500000'));

  // approve cow swap relayer
  console.log('approving cowswap relayer');
  // await dai.connect(trader).approve(COWSWAP_RELAYER, ethers.constants.MaxUint256);
  // await weth.connect(trader).approve(COWSWAP_RELAYER, ethers.constants.MaxUint256);
  // await stEth.connect(trader).approve(COWSWAP_RELAYER, ethers.constants.MaxUint256);

  // const afterBalance = await ethers.provider.getBalance(owner.address);

  // console.log({ beforeBalance: beforeBalance.toString(), afterBalance: afterBalance.toString() });

  // return {
  //   accounts: {
  //     ...accounts,
  //     governanceAccounts: [governance],
  //   },
  //   contracts: {
  //     // cowSettlement,
  //     // cowVaultRelayer,
  //     dai,
  //     weth,
  //     stEth,
  //     // usdc,
  //     master,
  //     pool,
  //     swapOperator,
  //     priceFeedOracle,
  //     daiAggregator,
  //     // enzymeV4Vault,
  //     // enzymeV4Comptroller,
  //     // enzymeFundValueCalculatorRouter,
  //   },
  // };

  // TODO:
  // add USDC / USDT as pool asset
  // add USDC / USDT swap details
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
