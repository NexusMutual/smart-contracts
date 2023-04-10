const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { parseEther, hexZeroPad, toUtf8Bytes } = ethers.utils;

const evm = require('./evm')();

const {
  Address: { ETH },
} = require('./utils');
const { makeContractOrder, lastBlockTimestamp } = require('../unit/SwapOperator/helpers');
const { computeOrderUid, domain: makeDomain, SettlementEncoder, SigningScheme } = require('@cowprotocol/contracts');
const { toBytes8 } = require('../unit/utils').helpers;

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const DAI_ETH_ORACLE = '0x773616e4d11a78f511299002da57a0a94577f1f4';
const SWAP_CONTROLLER = '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f';
const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';
const STABLECOIN_WHALE = '0x66f62574ab04989737228d18c3624f7fc1edae14';
const COWSWAP_SOLVER = '0x423cEc87f19F0778f549846e0801ee267a917935';
const TRADER_PKEY = '489cddb08499334cf55b9649459915dfc6606cb7aa50e0aef22259b08d6d6fe4';

const ASSET_V1_TO_ASSET_V2 = {};
ASSET_V1_TO_ASSET_V2[ETH.toLowerCase()] = 0;
ASSET_V1_TO_ASSET_V2[DAI_ADDRESS.toLowerCase()] = 1;

const V2Addresses = {
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  PriceFeedOracle: '0xcafeaf0a0672360941b7f0b6d015797292e842c6',
  Pool: '0xcafea112Db32436c2390F5EC988f3aDB96870627',
  NXMaster: '0xcafea0047591B979c714A63283B8f902554deB66',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingPool: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  CoverImpl: '0xcafeaCbabeEd884AE94046d87C8aAB120958B8a6',
  StakingProductsImpl: '0xcafea524e89514e131eE9F8462536793d49d8738',
  IndividualClaimsImpl: '0xcafeaC308bC9B49d6686897270735b4Dc11Fa1Cf',
  YieldTokenIncidentsImpl: '0xcafea7F77b63E995aE864dA9F36c8012666F8Fa4',
  AssessmentImpl: '0xcafea40dE114C67925BeB6e8f0F0e2ee4a25Dd88',
  LegacyClaimsReward: '0xcafeaDcAcAA2CD81b3c54833D6896596d218BFaB',
  TokenController: '0xcafea53357c11b3967A8C7167Fb4973C75063DbB',
  MCR: '0xcafea444db21dc06f34570185cF0014701c7D62e',
  MemberRoles: '0xcafea22Faff6aEc1d1bfc146b2e2EABC73Fa7Acc',
  LegacyPooledStaking: '0xcafea16366682a6c0083c38b2a731BC223c53D27',
  CoverMigrator: '0xcafeac41b010299A9bec5308CCe6aFC2c4DF8D39',
  LegacyGateway: '0xcafeaD694A05815f03F19c357200c6D95968e205',
  Governance: '0xcafeafA258Be9aCb7C0De989be21A8e9583FBA65',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04',
};

const NXM_TOKEN_ADDRESS = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';
const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';
const ENZYME_FUND_VALUE_CALCULATOR_ROUTER = '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9';

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
    this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
    this.gateway = await ethers.getContractAt('LegacyGateway', '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5');
    this.quotationData = await ethers.getContractAt(
      'LegacyQuotationData',
      '0x1776651F58a17a50098d31ba3C3cD259C1903f7A',
    );
    this.individualClaims = await ethers.getContractAt(
      'IndividualClaims',
      await this.master.getLatestAddress(toUtf8Bytes('CI')),
    );
    this.coverMigrator = await ethers.getContractAt(
      'CoverMigrator',
      await this.master.getLatestAddress(toUtf8Bytes('CL')),
    );
    this.coverViewer = await ethers.getContractAt('CoverViewer', V2Addresses.CoverViewer);
    this.assessment = await ethers.getContractAt('Assessment', await this.master.getLatestAddress(toUtf8Bytes('AS')));
    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.weth = await ethers.getContractAt('IWeth', WETH_ADDRESS);
    this.cover = await ethers.getContractAt('Cover', await this.master.getLatestAddress(toUtf8Bytes('CO')));
    this.memberRoles = await ethers.getContractAt('MemberRoles', await this.master.getLatestAddress(toUtf8Bytes('MR')));
    this.governance = await ethers.getContractAt('Governance', await this.master.getLatestAddress(toUtf8Bytes('GV')));
    this.pool = await ethers.getContractAt('Pool', await this.master.getLatestAddress(toUtf8Bytes('P1')));
    this.swapOperator = await ethers.getContractAt('SwapOperator', V2Addresses.SwapOperator);
    this.nxmToken = await ethers.getContractAt('NXMToken', NXM_TOKEN_ADDRESS);
  });

  it('upgrade SwapOperator', async function () {
    const { pool, governance } = this;

    await evm.impersonate(governance.address);
    await evm.setBalance(governance.address, parseEther('1000'));

    const govSigner = await getSigner(governance.address);

    const swapOperator = await ethers.deployContract('SwapOperator', [
      COWSWAP_SETTLEMENT,
      SWAP_CONTROLLER,
      this.master.address,
      WETH_ADDRESS,
      ENZYMEV4_VAULT_PROXY_ADDRESS,
      ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      '0',
    ]);

    await pool.connect(govSigner).updateAddressParameters(toBytes8('SWP_OP'), swapOperator.address);

    this.swapOperator = swapOperator;
  });

  it('Impersonate addresses', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }

    const swapControllerAddress = await this.swapOperator.swapController();
    await evm.impersonate(swapControllerAddress);
    await evm.setBalance(swapControllerAddress, parseEther('1000'));
    this.swapController = await getSigner(swapControllerAddress);

    this.cowswapSettlement = await ethers.getContractAt('ICowSettlement', COWSWAP_SETTLEMENT);

    await evm.impersonate(STABLECOIN_WHALE);
    await evm.setBalance(STABLECOIN_WHALE, parseEther('1000'));
    this.stablecoinWhale = await getSigner(STABLECOIN_WHALE);

    this.trader = new ethers.Wallet(TRADER_PKEY, ethers.provider);

    const traderAddress = await this.trader.getAddress();

    await this.dai.connect(this.stablecoinWhale).transfer(traderAddress, parseEther('3000000'));
    await evm.setBalance(traderAddress, parseEther('20000'));

    const amountWethForTrader = parseEther('10000');
    await this.weth.connect(this.trader).deposit({ value: amountWethForTrader });

    const amountWeth = parseEther('1');
    await this.weth.connect(this.stablecoinWhale).deposit({ value: amountWeth });
    await this.weth.connect(this.stablecoinWhale).transfer(traderAddress, amountWeth);

    await evm.impersonate(COWSWAP_SOLVER);
    await evm.setBalance(COWSWAP_SOLVER, parseEther('1000'));
    this.cowswapSolver = await getSigner(COWSWAP_SOLVER);

    this.daiEthOracle = await ethers.getContractAt('Aggregator', DAI_ETH_ORACLE);
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
});
