const { ethers } = require('hardhat');
const { parseEther, formatEther, parseUnits } = ethers.utils;

const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';

const main = async () => {
  const TRADER_PKEY_OLD = '489cddb08499334cf55b9649459915dfc6606cb7aa50e0aef22259b08d6d6fe4';
  const TRADER_PKEY = '5fb8a6805e34bb0ab87332e575e8ce5c647a2c52a05f3b0d378bef9d832ae414';
  const OWNER_PK = 'ca0e8abd66d05a20bc204176f3829da57d7407411f308f88983820b7c5da0b48'; // has some sepolia ETH
  const owner = new ethers.Wallet(OWNER_PK, ethers.provider);
  const trader = new ethers.Wallet(TRADER_PKEY, ethers.provider);

  // SEPOLIA
  // const weth = await ethers.getContractAt('SOMockWeth', '0xfABAcE08E021F7cBb2EDc95F358ee3ef87D33Ad1');
  // const dai = await ethers.getContractAt('ERC20Mock', '0x49dc690e3c67F4544CeeaDcFc02780B128aD2578');
  // const stEth = await ethers.getContractAt('ERC20Mock', '0xD99Ab0cDB81bb15448FD6d7D3da08CE20455152d');
  // const master = await ethers.getContractAt('MasterMock', '0xEa8862d84a2D4b37E85811f98e0a4C22A5f5f364');
  // const pool = await ethers.getContractAt('PoolMockCowSwap', '0xAB1E07497166E456dFfBC608b573c3B5330a06b3');
  // const swapOperator = await ethers.getContractAt('SwapOperator', '0x759556e9B66bdE59289a44C8E6BB3a798231153D');
  // const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0xE205970C0Af83a1E6cC17FdE3a0b00CdDE90054F');

  // GNOSIS
  const USDC_DECIMALS = 6;
  const GNOSIS_USDC_ADDRESS = '0xddafbb505ad214d7b80b1f830fccc89b60fb7a83';
  const GNOSIS_USDT_ADDRESS = '0x4ECaBa5870353805a9F068101A40E0f32ed605C6';
  const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const weth = await ethers.getContractAt('SOMockWeth', '0x0315deBA093423852F02e30C950C91fa589c0f89');
  const dai = await ethers.getContractAt('ERC20Mock', '0xDb52FB80ED6adB49aD3665fD2F35bFB0d66e4EdE');
  const stEth = await ethers.getContractAt('ERC20Mock', '0x05EEBE12ec6D89E2ff984025dDDf718fb8cF1285');
  const master = await ethers.getContractAt('MasterMock', '0x3f27B9baA86077c428258fA4939F71B19a25858a');
  const pool = await ethers.getContractAt('PoolMockCowSwap', '0xfABAcE08E021F7cBb2EDc95F358ee3ef87D33Ad1');
  const swapOperator = await ethers.getContractAt('SwapOperator', '0xfEDDc8bC740E63a7CB2239E7Ee227c3b60668a6e');
  // old swapOp 1 0x70430e1970543d1f5317519325A485A580D87c69
  // old swapOp 2 0x56AC1761460d30A809F472D4B14C4d8389D03B9D
  // old swapOp 3 0x5e3E6c9611b4f0B4C4F11b9e8CF16Ac4169b2E07
  // old swapOp 4 0xDcD3D2984976E8066c3B511624701158ae7ed198 - same as PR
  // old swapOp 5 0x2CEb3A2E6a9118d108Df01dd37d7299413026872 (closeOrder - has invalidateOrder() call)
  // old version  0x15384Cb305E3027FF4aDF6f383F27121EF3ADfE8 - old version before PR refactor + (closeOrder - has invalidateOrder() call)
  // current 0xfEDDc8bC740E63a7CB2239E7Ee227c3b60668a6e
  // fully filled closeOrder invalidateOrder - works as expected
  const priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', '0xcB7542DcC55129a099601a081E1c276799716478');

  // transfer asset back
  // console.log(await swapOperator.currentOrderUID());
  // const usdcAmount = parseUnits('5.9', USDC_DECIMALS);
  await swapOperator.transferAssetToController(GNOSIS_USDC_ADDRESS, parseUnits('10.996408', USDC_DECIMALS));
  // await swapOperator.transferAssetToController(GNOSIS_USDT_ADDRESS, parseUnits('39.987731', USDC_DECIMALS));
  // await swapOperator.transferAssetToController(NATIVE_TOKEN, parseEther('30'));
  // await swapOperator.returnAssetToPool(GNOSIS_USDT_ADDRESS);
  // console.log('pool.swapOperator: ', await pool.swapOperator());
  // console.log('swapOperator.currentOrderUID(): ', await swapOperator.currentOrderUID());

  // console.log(await pool.getAssets());
  // console.log('WxDAI', await pool.getAsset('0xe91d153e0b41518a2ce8dd3d7944fa863463a97d'));
  // console.log('USDC', await pool.getAsset(GNOSIS_USDC_ADDRESS));

  // console.log('weth: ', await swapOperator.weth());
  // console.log('pool swapOperator', await pool.swapOperator());
  // add asset
  // await pool.addAsset('0xe91d153e0b41518a2ce8dd3d7944fa863463a97d', false);
  // await pool.addAsset(USDT_ADDRESS, false);

  // set swap details
  // await pool
  //   .connect(owner)
  //   .setSwapDetails(GNOSIS_USDC_ADDRESS, parseUnits('10', USDC_DECIMALS), parseUnits('20', USDC_DECIMALS), 250);
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
