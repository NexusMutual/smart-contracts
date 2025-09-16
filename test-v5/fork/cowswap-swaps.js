const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const crypto = require('crypto');
const { parseEther, hexZeroPad, toUtf8Bytes } = ethers.utils;

const evm = require('./evm')();
const { makeContractOrder, lastBlockTimestamp } = require('../unit/SwapOperator/helpers');
const { computeOrderUid, domain: makeDomain, SettlementEncoder, SigningScheme } = require('@cowprotocol/contracts');

const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ETH_ORACLE = '0x773616e4d11a78f511299002da57a0a94577f1f4';
const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';
const STABLECOIN_WHALE = '0x66f62574ab04989737228d18c3624f7fc1edae14';
const COWSWAP_SOLVER = '0x423cEc87f19F0778f549846e0801ee267a917935';
const TRADER_PKEY = crypto.randomBytes(32).toString('hex');

const NXM_TOKEN_ADDRESS = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

const addOrder = async (trader, order, executedAmount, encoder) => {
  const sellToken = await ethers.getContractAt('ERC20Mock', order.sellToken);

  console.log(`Approve sell token`);
  await sellToken.connect(trader).approve(COWSWAP_RELAYER, ethers.constants.MaxUint256);

  console.log('Sing Encode Trade');

  await encoder.signEncodeTrade(order, trader, SigningScheme.EIP712, {
    executedAmount,
  });
};

describe('CowSwap swaps', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    await getSigner('0x1eE3ECa7aEF17D1e74eD7C447CcBA61aC76aDbA9');

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.log('Snapshot ID: ', await evm.snapshot());
      }
    }

    const { chainId } = await ethers.provider.getNetwork();
    const domainSeparator = makeDomain(chainId, COWSWAP_SETTLEMENT);

    this.encoder = new SettlementEncoder(domainSeparator);
  });

  it('load contracts', async function () {
    this.master = await ethers.getContractAt('NXMaster', '0x01BFd82675DBCc7762C84019cA518e701C0cD07e');
    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.weth = await ethers.getContractAt('IWeth', WETH_ADDRESS);
    this.pool = await ethers.getContractAt('Pool', await this.master.getLatestAddress(toUtf8Bytes('P1')));
    this.swapOperator = await ethers.getContractAt('SwapOperator', await this.pool.swapOperator());
    this.nxmToken = await ethers.getContractAt('NXMToken', NXM_TOKEN_ADDRESS);
    this.cowswapSettlement = await ethers.getContractAt('ICowSettlement', COWSWAP_SETTLEMENT);
    this.daiEthOracle = await ethers.getContractAt('Aggregator', DAI_ETH_ORACLE);
    this.enzymeVault = await ethers.getContractAt('IEnzymeV4Vault', ENZYMEV4_VAULT_PROXY_ADDRESS);
  });

  it('Impersonate addresses', async function () {
    const swapControllerAddress = await this.swapOperator.swapController();
    await evm.impersonate(swapControllerAddress);
    await evm.setBalance(swapControllerAddress, parseEther('1000'));
    this.swapController = await getSigner(swapControllerAddress);

    await evm.impersonate(STABLECOIN_WHALE);
    await evm.setBalance(STABLECOIN_WHALE, parseEther('1000'));
    this.stablecoinWhale = await getSigner(STABLECOIN_WHALE);

    // This trader sits on the other side of the trade as the buyer for what SwapOperator is selling
    this.trader = new ethers.Wallet(TRADER_PKEY, ethers.provider);
    const traderAddress = await this.trader.getAddress();

    // top up trader address with stablecoins
    await this.dai.connect(this.stablecoinWhale).transfer(traderAddress, parseEther('3000000'));
    await evm.setBalance(traderAddress, parseEther('20000'));

    // top up trader with WETH
    const amountWethForTrader = parseEther('10000');
    await this.weth.connect(this.trader).deposit({ value: amountWethForTrader });

    await evm.impersonate(COWSWAP_SOLVER);
    await evm.setBalance(COWSWAP_SOLVER, parseEther('1000'));
    this.cowswapSolver = await getSigner(COWSWAP_SOLVER);
  });

  it('executes CowSwap swap of ETH for DAI', async function () {
    const { swapOperator, pool, swapController } = this;

    const daiPriceInEth = await this.daiEthOracle.latestAnswer();

    const sellAmount = parseEther('100');
    const buyAmount = sellAmount.mul(parseEther('1')).div(daiPriceInEth);
    // Build order struct, domain separator and calculate UID
    const order = {
      sellToken: WETH_ADDRESS,
      buyToken: DAI_ADDRESS,
      receiver: swapOperator.address,
      sellAmount,
      buyAmount,
      validTo: (await lastBlockTimestamp()) + 650,
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    const contractOrder = makeContractOrder(order);

    const { chainId } = await ethers.provider.getNetwork();

    const ethBalanceBefore = await ethers.provider.getBalance(pool.address);
    const daiBalanceBefore = await this.dai.balanceOf(pool.address);

    const domain = makeDomain(chainId, COWSWAP_SETTLEMENT);
    const orderUID = computeOrderUid(domain, order, order.receiver);

    await swapOperator.connect(swapController).placeOrder(contractOrder, orderUID);

    const preSignSignature = { data: swapOperator.address, scheme: SigningScheme.PRESIGN };
    // encode the order once SwapOperator has submitted the signature
    await this.encoder.encodeTrade(order, preSignSignature);

    // lower the imaginary buy amount slightly so the limit price is respected on both sides of the trades
    const imaginaryBuyAmount = sellAmount.sub(parseEther('0.1'));

    await addOrder(
      this.trader,
      {
        validTo: 0xffffffff,
        feeAmount: ethers.utils.parseEther('1.0'),
        kind: 'buy',
        partiallyFillable: false,
        sellToken: DAI_ADDRESS,
        buyToken: WETH_ADDRESS,
        sellAmount: buyAmount,
        buyAmount: imaginaryBuyAmount,
        appData: 1,
      },
      '0',
      this.encoder,
    );
    console.log(`Settle trade`);

    const sellPrice = parseEther('1');
    const buyPrice = daiPriceInEth;

    const encodedSettlement = this.encoder.encodedSettlement({
      [DAI_ADDRESS]: buyPrice,
      [WETH_ADDRESS]: sellPrice,
    });

    await this.cowswapSettlement.connect(this.cowswapSolver).settle(...encodedSettlement);

    await swapOperator.connect(swapController).closeOrder(contractOrder);

    const ethBalanceAfter = await ethers.provider.getBalance(pool.address);
    const daiBalanceAfter = await this.dai.balanceOf(pool.address);

    const daiBalanceIncrease = daiBalanceAfter.sub(daiBalanceBefore);
    const ethBalanceDecrease = ethBalanceBefore.sub(ethBalanceAfter);

    expect(ethBalanceDecrease).to.be.equal(order.sellAmount.add(order.feeAmount));

    expect(daiBalanceIncrease).to.be.equal(order.buyAmount.add(1));
  });

  it('executes CowSwap swap of DAI for ETH', async function () {
    const { swapOperator, pool, swapController } = this;

    // 1 hour
    await evm.increaseTime(3600);

    // add DAI to the pool so that it exceeds the maxAmount

    const daiSwapDetails = await this.pool.swapDetails(this.dai.address);

    const currentDAIBalance = await this.dai.balanceOf(this.pool.address);

    const extraDAI = parseEther('100000');
    const daiToBeTransferred = daiSwapDetails.maxAmount.sub(currentDAIBalance).add(extraDAI);

    this.dai.connect(this.stablecoinWhale).transfer(this.pool.address, daiToBeTransferred);

    const daiPriceInEth = await this.daiEthOracle.latestAnswer();

    const sellAmount = parseEther('100000');
    const buyAmount = sellAmount.mul(daiPriceInEth).div(parseEther('1'));

    // Build order struct, domain separator and calculate UID
    const order = {
      sellToken: DAI_ADDRESS,
      buyToken: WETH_ADDRESS,
      receiver: swapOperator.address,
      sellAmount,
      buyAmount,
      validTo: (await lastBlockTimestamp()) + 650,
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    const contractOrder = makeContractOrder(order);

    const { chainId } = await ethers.provider.getNetwork();

    const daiBalanceBefore = await this.dai.balanceOf(pool.address);

    const domain = makeDomain(chainId, COWSWAP_SETTLEMENT);
    const orderUID = computeOrderUid(domain, order, order.receiver);

    await swapOperator.connect(swapController).placeOrder(contractOrder, orderUID);

    const preSignSignature = { data: swapOperator.address, scheme: SigningScheme.PRESIGN };
    // encode the order once SwapOperator has submitted the signature
    await this.encoder.encodeTrade(order, preSignSignature);

    // lower the imaginary buy amount slightly so the limit price is respected on both sides of the trades
    const imaginaryBuyAmount = sellAmount.sub(parseEther('1'));

    await addOrder(
      this.trader,
      {
        validTo: 0xffffffff,
        feeAmount: ethers.utils.parseEther('1.0'),
        kind: 'buy',
        partiallyFillable: false,
        sellToken: WETH_ADDRESS,
        buyToken: DAI_ADDRESS,
        sellAmount: buyAmount,
        buyAmount: imaginaryBuyAmount,
        appData: 1,
      },
      '0',
      this.encoder,
    );
    console.log(`Settle trade`);

    const sellPrice = parseEther('1');
    const buyPrice = daiPriceInEth;

    const encodedSettlement = this.encoder.encodedSettlement({
      [WETH_ADDRESS]: sellPrice,
      [DAI_ADDRESS]: buyPrice,
    });

    encodedSettlement[2] = encodedSettlement[2].slice(2, 4);
    await this.cowswapSettlement.connect(this.cowswapSolver).settle(...encodedSettlement);

    console.log('Close order');
    await swapOperator.connect(swapController).closeOrder(contractOrder);
    const daiBalanceAfter = await this.dai.balanceOf(pool.address);
    const daiBalanceDecrease = daiBalanceBefore.sub(daiBalanceAfter);

    expect(daiBalanceDecrease).to.be.equal(order.sellAmount.add(order.feeAmount));
  });

  it('initializes swap,closes order without fulfilment and recover enzyme asset', async function () {
    const { swapOperator, swapController } = this;

    // 1 hour
    await evm.increaseTime(3600);

    // add DAI to the pool so that it exceeds the maxAmount

    const daiSwapDetails = await this.pool.swapDetails(this.dai.address);

    const currentDAIBalance = await this.dai.balanceOf(this.pool.address);

    const extraDAI = parseEther('100000');
    const daiToBeTransferred = daiSwapDetails.maxAmount.sub(currentDAIBalance).add(extraDAI);

    this.dai.connect(this.stablecoinWhale).transfer(this.pool.address, daiToBeTransferred);

    const daiPriceInEth = await this.daiEthOracle.latestAnswer();

    const sellAmount = parseEther('100000');
    const buyAmount = sellAmount.mul(daiPriceInEth).div(parseEther('1'));

    // Build order struct, domain separator and calculate UID
    const order = {
      sellToken: DAI_ADDRESS,
      buyToken: WETH_ADDRESS,
      receiver: swapOperator.address,
      sellAmount,
      buyAmount,
      validTo: (await lastBlockTimestamp()) + 650,
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    const contractOrder = makeContractOrder(order);

    const { chainId } = await ethers.provider.getNetwork();

    const domain = makeDomain(chainId, COWSWAP_SETTLEMENT);
    const orderUID = computeOrderUid(domain, order, order.receiver);

    await swapOperator.connect(swapController).placeOrder(contractOrder, orderUID);

    // deposit assets that should be recovered.
    const excessSharesAmountInSwapOperator = parseEther('1000');
    const accessorAddress = await this.enzymeVault.getAccessor();

    await evm.impersonate(accessorAddress);
    await evm.setBalance(accessorAddress, parseEther('1000'));
    const accessor = await getSigner(accessorAddress);

    await this.enzymeVault.connect(accessor).mintShares(swapOperator.address, excessSharesAmountInSwapOperator);

    await expect(
      swapOperator.connect(swapController).recoverAsset(this.enzymeVault.address, this.pool.address),
    ).to.revertedWith('SwapOp: an order is already in place');

    // close order prematurely
    await swapOperator.connect(swapController).closeOrder(contractOrder);

    // recover asset
    const sharesToken = await ethers.getContractAt('ERC20Mock', this.enzymeVault.address);
    const sharesBalanceBefore = await sharesToken.balanceOf(this.pool.address);
    await swapOperator.connect(swapController).recoverAsset(this.enzymeVault.address, this.pool.address);
    const sharesBalanceAfter = await sharesToken.balanceOf(this.pool.address);

    const balanceIncrease = sharesBalanceAfter.sub(sharesBalanceBefore);

    expect(balanceIncrease).to.be.equal(excessSharesAmountInSwapOperator);
  });
});
