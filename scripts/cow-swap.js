require('dotenv').config();
const { ethers } = require('hardhat');
const { parseEther, formatEther, parseUnits } = ethers.utils;

const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

const main = async () => {

  const owner = new ethers.Wallet(process.env.GNOSIS_ACCOUNT_KEY, ethers.provider);
  // SEPOLIA
  // const weth = await ethers.getContractAt('SOMockWeth', '0xfABAcE08E021F7cBb2EDc95F358ee3ef87D33Ad1');
  // const dai = await ethers.getContractAt('ERC20Mock', '0x49dc690e3c67F4544CeeaDcFc02780B128aD2578');
  // const stEth = await ethers.getContractAt('ERC20Mock', '0xD99Ab0cDB81bb15448FD6d7D3da08CE20455152d');
  // const master = await ethers.getContractAt('MasterMock', '0xEa8862d84a2D4b37E85811f98e0a4C22A5f5f364');
  // const pool = await ethers.getContractAt('PoolMockCowSwap', '0xAB1E07497166E456dFfBC608b573c3B5330a06b3');
  // const swapOperator = await ethers.getContractAt('SwapOperator', '0x759556e9B66bdE59289a44C8E6BB3a798231153D');
  // const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0xE205970C0Af83a1E6cC17FdE3a0b00CdDE90054F');

// WETH_ADDRESS_OVERRIDE=0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d
// POOL_ADDRESS_OVERRIDE=0x0adaa8c1322dA71AE998ba9746Dfeaf577B4FC15
// SWAP_OPERATOR_ADDRESS_OVERRIDE=0xC21912b73c1c34C88c45730a411339B50752b4e4
// PRICE_FEED_ORACLE_ADDRESS_OVERRIDE=0x0BA5771973F6a17D44B64D476B6E98919ff55F2e

  // GNOSIS
  const USDC_DECIMALS = 6;
  const GNOSIS_USDC_ADDRESS = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';
  const GNOSIS_USDT_ADDRESS = '0x4ECaBa5870353805a9F068101A40E0f32ed605C6';
  const GNOSIS_WXDAI_ADDRESS = '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d';
  const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const pool = await ethers.getContractAt('PoolMockCowSwap', '0x7183a0272aBF15B35109fe9992b16304cf5C8860');
  const swapOperator = await ethers.getContractAt('SwapOperator', '0xB018ffa6c0319423730EF58a1DE57cd06b8bC328');
  const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0x667a530889ce2d890B57E9bEaAed0A2F00ac9340');

  // transfer asset back
  // console.log(await swapOperator.currentOrderUID());
  // const usdcAmount = parseUnits('5.9', USDC_DECIMALS);
  // await swapOperator.requestAsset(GNOSIS_USDC_ADDRESS, parseUnits('1', USDC_DECIMALS));
  // await swapOperator.transferAssetToController(GNOSIS_USDC_ADDRESS, parseUnits('1', USDC_DECIMALS));

  // await swapOperator.transferAssetToController(GNOSIS_USDT_ADDRESS, parseUnits('39.987731', USDC_DECIMALS));
  // await swapOperator.transferAssetToController(NATIVE_TOKEN, parseEther('30'));
  // await swapOperator.returnAssetToPool(GNOSIS_USDT_ADDRESS);
  // await pool.addAsset(GNOSIS_WXDAI_ADDRESS, false);
  // await pool.addAsset(GNOSIS_USDC_ADDRESS, false);
  // await pool.addAsset(GNOSIS_USDT_ADDRESS, false);
  // console.log('pool.swapOperator: ', await pool.swapOperator());
  // console.log('pool.priceFeedOracle: ', await pool.priceFeedOracle());
  // console.log('swapOperator.swapController: ', await swapOperator.swapController());
  // console.log('swapOperator.weth: ', await swapOperator.weth());
  // console.log('swapOperator.currentOrderUID(): ', await swapOperator.currentOrderUID());

  // console.log(await pool.getAssets());
  // console.log('WxDAI', await pool.getAsset('0xe91d153e0b41518a2ce8dd3d7944fa863463a97d'));
  // console.log('USDC', await pool.getAsset(GNOSIS_USDC_ADDRESS));

  // console.log('weth: ', await swapOperator.weth());
  // console.log('pool swapOperator', await pool.swapOperator());
  // add asset
  // await pool.addAsset('0xe91d153e0b41518a2ce8dd3d7944fa863463a97d', false);
  // await pool.addAsset(USDT_ADDRESS, false);
  // await pool.addAsset(USDC_ADDRESS, false);

  // set swap details
  await pool
    .connect(owner)
    .setSwapDetails(GNOSIS_USDC_ADDRESS, parseUnits('15', USDC_DECIMALS), parseUnits('30', USDC_DECIMALS), 250);
  // await pool
  //   .connect(owner)
  //   .setSwapDetails(GNOSIS_USDT_ADDRESS, parseUnits('10', USDC_DECIMALS), parseUnits('20', USDC_DECIMALS), 250);
  // await pool.connect(owner).setSwapDetails(dai.address, parseEther('3000'), parseEther('20000'), 250);
  // await pool.connect(owner).setSwapDetails(stEth.address, parseEther('10'), parseEther('20'), 250);

  // console.log(await swapOperator.currentOrderUID());
  // console.log(
  //   await swapOperator.closeOrder({
  //     sellToken: '0xe91d153e0b41518a2ce8dd3d7944fa863463a97d',
  //     buyToken: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83',
  //     receiver: '0x2ceb3a2e6a9118d108df01dd37d7299413026872',
  //     sellAmount: '19000000000000000000',
  //     buyAmount: '19001024',
  //     validTo: 1709041513,
  //     appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
  //     feeAmount: '0',
  //     partiallyFillable: true,
  //     kind: '0xf3b277728b3fee749481eb3e0b3b48980dbbab78658fc419025cb16eee346775',
  //     sellTokenBalance: '0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9',
  //     buyTokenBalance: '0x5a28e9363bb942b639270062aa6bb295f434bcdfc42c97267bf003f272060dc9',
  //   }),
  // );

  // {
  //   sellToken: '0x4ecaba5870353805a9f068101a40e0f32ed605c6',
  //   buyToken: '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83',
  //   receiver: '0x56ac1761460d30a809f472d4b14c4d8389d03b9d',
  //   sellAmount: '9998904',
  //   buyAmount: '10002897',
  //   validTo: 1707989244,
  //   appData: '0x0000000000000000000000000000000000000000000000000000000000000000',
  //   feeAmount: '1096',
  //   kind: 'sell',
  //   partiallyFillable: false,
  //   sellTokenBalance: 'erc20',
  //   buyTokenBalance: 'erc20',
  //   signingScheme: 'eip712'
  // }
  // balances
  // const poolDaiBalance = await dai.balanceOf(pool.address);
  // const poolStEthBalance = await stEth.balanceOf(pool.address);
  // const poolWethBalance = await weth.balanceOf(pool.address);
  // console.log({
  //   poolDaiBalance: formatEther(poolDaiBalance),
  //   poolStEthBalance: formatEther(poolStEthBalance),
  //   poolWethBalance: formatEther(poolWethBalance),
  // });

  // const traderDaiBalance = await dai.balanceOf(trader.address);
  // const traderStEthBalance = await stEth.balanceOf(trader.address);
  // const traderWethBalance = await weth.balanceOf(trader.address);
  // console.log({
  //   traderDaiBalance: formatEther(traderDaiBalance),
  //   traderStEthBalance: formatEther(traderStEthBalance),
  //   traderWethBalance: formatEther(traderWethBalance),
  // });

  // const maxPriorityFeePerGas = parseUnits('1.5', 'gwei');
  // const maxFeePerGas = parseUnits('50', 'gwei');
  // await dai
  //   .connect(trader)
  //   .approve(COWSWAP_RELAYER, ethers.constants.MaxUint256, { maxFeePerGas, maxPriorityFeePerGas });
  // await weth
  //   .connect(trader)
  //   .approve(COWSWAP_RELAYER, ethers.constants.MaxUint256, { maxFeePerGas, maxPriorityFeePerGas });
  // await stEth
  //   .connect(trader)
  //   .approve(COWSWAP_RELAYER, ethers.constants.MaxUint256, { maxFeePerGas, maxPriorityFeePerGas });
  console.log('sent');
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

// BUY
// ETH -> DAI (dai is buyToken)
// pool DAI balance (2500) must be < minAmount (3000)
// pool DAI balance + buyAmount must be <= maxAmount (20000)
//
// sellAmount 1 ETH
// buyAmount 2500 DAI

// SELL
// stETH -> DAI
// pool stETH balance (50) MUST be > maxAmount (20)
// sell amount must NOT make pool stETH BELOW minAmount (10)
//
// sellAmount 1 stETH
// buyAmount 2500 DAI
