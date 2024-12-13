const { SigningScheme, domain: makeDomain, SettlementEncoder } = require('@cowprotocol/contracts');
const { abis, addresses } = require('@nexusmutual/deployments');
const chai = require('chai');
const { ethers, network } = require('hardhat');

const {
  Address,
  UserAddress,
  EnzymeAdress,
  AggregatorType,
  PriceFeedOracle,
  V2Addresses,
  getSigner,
  submitMemberVoteGovernanceProposal,
  submitGovernanceProposal,
} = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { toBytes8 } = require('../../lib/helpers');

const evm = require('./evm')();

const { expect } = chai;
const { BigNumber } = ethers;
const { formatUnits, formatEther } = ethers.utils;

const { parseEther, defaultAbiCoder, toUtf8Bytes, parseUnits, keccak256, hexZeroPad } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const addOrder = async (trader, order, executedAmount, encoder) => {
  const sellToken = await ethers.getContractAt('ERC20Mock', order.sellToken);

  console.log(`Approve sell token`);
  await sellToken.connect(trader).approve(Address.COWSWAP_RELAYER, ethers.constants.MaxUint256);

  console.log('Sign Encode Trade');

  await encoder.signEncodeTrade(order, trader, SigningScheme.EIP712, { executedAmount });
};

const makeContractOrder = order => {
  return {
    ...order,
    kind: keccak256(toUtf8Bytes(order.kind)),
    sellTokenBalance: keccak256(toUtf8Bytes(order.sellTokenBalance)),
    buyTokenBalance: keccak256(toUtf8Bytes(order.buyTokenBalance)),
  };
};

describe('add cbBTC asset to Pool', function () {
  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', V2Addresses.NXMaster));
    const contractAddress = await this.master?.getLatestAddress(toUtf8Bytes(contractCode));
    return ethers.getContractAt(contractName, contractAddress);
  }

  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
  });

  it('load contracts', async function () {
    this.mcr = await ethers.getContractAt(abis.MCR, addresses.MCR);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
    this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.stakingPool = await ethers.getContractAt(abis.StakingPool, V2Addresses.StakingPoolImpl);
    this.priceFeedOracle = await ethers.getContractAt(abis.PriceFeedOracle, addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.IndividualClaims, addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt(abis.LegacyQuotationData, addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt(abis.LegacyClaimsReward, addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt(abis.ProposalCategory, addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.pooledStaking = await ethers.getContractAt(abis.LegacyPooledStaking, addresses.LegacyPooledStaking);
    this.yieldTokenIncidents = await ethers.getContractAt(abis.YieldTokenIncidents, addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);

    this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);
    this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

    // Token Mocks
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Address.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
  });

  it('Impersonate cover Buyer', async function () {
    await Promise.all([
      evm.impersonate(UserAddress.DAI_NXM_HOLDER),
      evm.setBalance(UserAddress.DAI_NXM_HOLDER, parseEther('100000')),
    ]);
    this.coverBuyer = await getSigner(UserAddress.DAI_NXM_HOLDER);
  });

  it('Impersonate cbBTC whale', async function () {
    await Promise.all([
      evm.impersonate(UserAddress.CBBTC_WHALE),
      evm.setBalance(UserAddress.CBBTC_WHALE, parseEther('100000')),
    ]);
    this.cbBtcWhale = await getSigner(UserAddress.CBBTC_WHALE);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    const impersonatePromises = abMembers.map(async address => {
      await Promise.all([evm.impersonate(address), evm.setBalance(address, parseEther('1000'))]);
      return getSigner(address);
    });
    this.abMembers = await Promise.all(impersonatePromises);
  });

  it('Deploy new PriceFeedOracle contract', async function () {
    const priceFeedAssets = [
      {
        address: Address.DAI_ADDRESS,
        aggregator: PriceFeedOracle.DAI_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: Address.STETH_ADDRESS,
        aggregator: PriceFeedOracle.STETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS,
        aggregator: PriceFeedOracle.ENZYMEV4_VAULT_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: Address.RETH_ADDRESS,
        aggregator: PriceFeedOracle.RETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 18,
      },
      {
        address: Address.USDC_ADDRESS,
        aggregator: PriceFeedOracle.USDC_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.ETH,
        decimals: 6,
      },
      {
        address: Address.CBBTC_ADDRESS,
        aggregator: PriceFeedOracle.CBBTC_USD_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.USD,
        decimals: 8,
      },
      {
        address: Address.ETH,
        aggregator: PriceFeedOracle.ETH_USD_PRICE_FEED_ORACLE_AGGREGATOR,
        aggregatorType: AggregatorType.USD,
        decimals: 18,
      },
    ];

    this.priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      priceFeedAssets.map(asset => asset.address),
      priceFeedAssets.map(asset => asset.aggregator),
      priceFeedAssets.map(asset => asset.aggregatorType),
      priceFeedAssets.map(asset => asset.decimals),
      this.safeTracker.address,
    ]);
  });

  it('Update the PriceFeedOracle in the Pool contract', async function () {
    const poolPriceFeedOracleBefore = await this.pool.priceFeedOracle();
    expect(poolPriceFeedOracleBefore).to.not.equal(this.priceFeedOracle.address);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.updatePoolAddressParameters,
      defaultAbiCoder.encode(['bytes8', 'address'], [toBytes8('PRC_FEED'), this.priceFeedOracle.address]),
      this.abMembers,
      this.governance,
    );

    const poolPriceFeedOracleAfter = await this.pool.priceFeedOracle();
    expect(poolPriceFeedOracleAfter).to.equal(this.priceFeedOracle.address);
  });

  it('Add cbBTC as an asset to the pool', async function () {
    const poolAssetsBefore = await this.pool.getAssets();

    const min = parseUnits('150', 8); // 150 cbBTC
    const max = parseUnits('200', 8); // 200 cbBTC

    const poolValueInEthBefore = await this.pool.getPoolValueInEth();

    await submitMemberVoteGovernanceProposal(
      PROPOSAL_CATEGORIES.addAsset,
      defaultAbiCoder.encode(['address', 'bool', 'uint', 'uint', 'uint'], [Address.CBBTC_ADDRESS, true, min, max, 250]),
      this.abMembers,
      this.governance,
    );

    const poolValueInEthAfter = await this.pool.getPoolValueInEth();
    expect(poolValueInEthAfter).to.be.gt(poolValueInEthBefore);

    const poolAssetsAfter = await this.pool.getAssets();
    expect(poolAssetsAfter).to.have.lengthOf(poolAssetsBefore.length + 1);

    const latestPoolAsset = poolAssetsAfter.at(-1);
    expect(latestPoolAsset.assetAddress).to.equal(Address.CBBTC_ADDRESS);
    expect(latestPoolAsset.isCoverAsset).to.equal(true);
    expect(latestPoolAsset.isAbandoned).to.equal(false);
  });

  it('fail to buy cover that only supports DAI', async function () {
    const coverBuyerAddress = await this.coverBuyer.getAddress();

    await this.cbBTC.approve(this.cover.address, MaxUint256);

    const buyCoverOnlyDai = this.cover.connect(this.coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: 165,
        coverAsset: 7,
        amount: 1000000,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseEther('1').mul(260).div(10000),
        paymentAsset: 7,
        payWithNXM: false,
        commissionRatio: 500,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId: 23, coverAmountInAsset: 1000000, skip: false }],
    );

    await expect(buyCoverOnlyDai).to.be.reverted;
  });

  it('fail to buy cover that only supports ETH', async function () {
    const coverBuyerAddress = await this.coverBuyer.getAddress();

    await this.cbBTC.connect(this.coverBuyer).approve(this.cover.address, MaxUint256);

    const buyCoverOnlyEth = this.cover.connect(this.coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: 167,
        coverAsset: 7,
        amount: 1000000,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: 1712106,
        paymentAsset: 7,
        payWithNXM: false,
        commissionRatio: 500,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId: 22, coverAmountInAsset: 1712106, skip: false }],
    );

    await expect(buyCoverOnlyEth).to.be.reverted;
  });

  it('Buy cover with cbBTC', async function () {
    const coverBuyerAddress = await this.coverBuyer.getAddress();

    // Transfer some cbBTC to cover buyer
    await this.cbBTC.connect(this.cbBtcWhale).transfer(coverBuyerAddress, parseUnits('10', 8));

    const poolCbBtcBalanceBefore = await this.cbBTC.balanceOf(this.pool.address);

    await this.cbBTC.connect(this.coverBuyer).approve(this.cover.address, MaxUint256);
    await this.cover.connect(this.coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: 1,
        coverAsset: 7,
        amount: parseUnits('0.1', 8), // 0.1 cbBTC
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: parseUnits('0.001', 8), // 0.001 cbBTC
        paymentAsset: 7,
        payWithNXM: false,
        commissionRatio: 500,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId: 13, coverAmountInAsset: parseUnits('0.1', 8), skip: false }],
    );

    const poolCbBtcBalanceAfter = await this.cbBTC.balanceOf(this.pool.address);

    expect(poolCbBtcBalanceAfter).to.be.gt(poolCbBtcBalanceBefore);
  });

  // SWAP

  it('Prepare for swap', async function () {
    this.trader = ethers.Wallet.createRandom().connect(ethers.provider);

    // impersonate addresses
    await Promise.all([
      evm.impersonate(UserAddress.DAI_HOLDER),
      evm.impersonate(Address.SWAP_CONTROLLER),
      await evm.impersonate(Address.SWAP_CONTROLLER),
    ]);

    await Promise.all([
      // top up addresses with ETH
      evm.setBalance(UserAddress.DAI_HOLDER, parseEther('1000')),
      evm.setBalance(Address.SWAP_CONTROLLER, parseEther('100000')),
      evm.setBalance(this.trader.address, parseEther('20000')),
      evm.setBalance(Address.COWSWAP_SOLVER, parseEther('1000')),
      // top up trader address with cbBTC
      this.cbBTC.connect(this.cbBtcWhale).transfer(this.trader.address, parseUnits('10', 8)),
    ]);

    [this.swapController, this.cowswapSolver, this.cowswapSettlement] = await Promise.all([
      getSigner(Address.SWAP_CONTROLLER),
      getSigner(Address.COWSWAP_SOLVER),
      ethers.getContractAt('ICowSettlement', Address.COWSWAP_SETTLEMENT),
    ]);

    const { chainId } = await ethers.provider.getNetwork();
    const domainSeparator = makeDomain(chainId, Address.COWSWAP_SETTLEMENT);

    this.encoder = new SettlementEncoder(domainSeparator);
  });

  it('Places a swap order', async function () {
    const { timestamp } = await ethers.provider.getBlock('latest');

    // 1 BTC to ETH
    const cbBtcEthPrice = await this.priceFeedOracle.getEthForAsset(Address.CBBTC_ADDRESS, parseUnits('1', 8));
    // 1 ETH to BTC
    const ethCbBtcPrice = await this.priceFeedOracle.getAssetForEth(Address.CBBTC_ADDRESS, parseEther('1'));

    // Calculate buyAmount based on ethCbBtcPrice
    const sellAmount = parseEther('10');
    const buyAmount = await this.priceFeedOracle.getAssetForEth(Address.CBBTC_ADDRESS, sellAmount);

    const cbBTCBalanceBefore = await this.cbBTC.balanceOf(this.pool.address);
    const ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);

    const order = {
      sellToken: Address.WETH_ADDRESS,
      buyToken: Address.CBBTC_ADDRESS,
      receiver: this.swapOperator.address,
      sellAmount,
      buyAmount,
      validTo: timestamp + 3600,
      appData: hexZeroPad(0, 32),
      feeAmount: 0,
      partiallyFillable: false,
      kind: 'buy',
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    const contractOrder = makeContractOrder(order);

    const orderId = await this.swapOperator.connect(this.swapController).getUID(contractOrder);
    await this.swapOperator.connect(this.swapController).placeOrder(contractOrder, orderId);

    const isInProgress = await this.swapOperator.orderInProgress();
    expect(isInProgress).to.be.equal(true);

    const preSignSignature = { data: this.swapOperator.address, scheme: SigningScheme.PRESIGN };

    // encode the order once SwapOperator has submitted the signature
    await this.encoder.encodeTrade(order, preSignSignature);

    // lower the imaginary buy amount slightly so the limit price is respected on both sides of the trades
    const imaginaryBuyAmount = sellAmount.sub(parseEther('0.1'));

    const otherSideOrder = {
      validTo: 0xffffffff,
      feeAmount: ethers.utils.parseUnits('0.01', 8),
      kind: 'sell',
      partiallyFillable: false,
      sellToken: Address.CBBTC_ADDRESS,
      buyToken: Address.WETH_ADDRESS,
      sellAmount: buyAmount,
      buyAmount: imaginaryBuyAmount,
      appData: 1,
    };

    await addOrder(this.trader, otherSideOrder, '0', this.encoder);

    console.log('---------------SWAPOPERATOR ORDER-------------------');
    console.log('sellAmount: ', formatEther(sellAmount), ' ETH');
    console.log('buyAmount: ', formatUnits(buyAmount, 8), ' CBBTC');
    console.log('---------------OTHERSIDE ORDER----------------------');
    console.log('sellAmount: ', formatUnits(buyAmount, 8), ' CBBTC');
    console.log('buyAmount: ', formatEther(imaginaryBuyAmount), ' ETH');
    console.log('----------------------------------');
    console.log('cbBtcEthPrice: ', formatEther(cbBtcEthPrice));
    console.log('ethCbBtcPrice: ', formatUnits(ethCbBtcPrice, 8));

    // prices in terms of ETH
    const prices = {
      // NOTE: prices address keys needs to be check summed
      [Address.CBBTC_ADDRESS]: cbBtcEthPrice,
      [Address.WETH_ADDRESS]: BigNumber.from('10').pow(8), // 10^8 because cbBTC is 8 decimals
    };

    // NOTE: sell order value needs to >= buy order value
    console.log('---------------SWAPOPERATOR ORDER PRICING-------------------');
    console.log('BUY AMOUNT * BUY PRICE:  ', order.buyAmount.mul(prices[Address.CBBTC_ADDRESS]).toString());
    console.log('SELL AMOUNT * SELL PRICE:', order.sellAmount.mul(prices[Address.WETH_ADDRESS]).toString());
    console.log('---------------OTHERSIDE ORDER PRICING----------------------');
    console.log('BUY AMOUNT * BUY PRICE:  ', otherSideOrder.buyAmount.mul(prices[Address.WETH_ADDRESS]).toString());
    console.log('SELL AMOUNT * SELL PRICE:', otherSideOrder.sellAmount.mul(prices[Address.CBBTC_ADDRESS]).toString());
    console.log('----------------------------------');

    const encodedSettlement = this.encoder.encodedSettlement(prices);

    await this.cowswapSettlement.connect(this.cowswapSolver).settle(...encodedSettlement);
    await this.swapOperator.connect(this.swapController).closeOrder(contractOrder);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const cbBTCBalanceAfter = await this.cbBTC.balanceOf(this.pool.address);

    const cbBTCBalanceIncrease = cbBTCBalanceAfter.sub(cbBTCBalanceBefore);
    const ethBalanceDecrease = ethBalanceBefore.sub(ethBalanceAfter);

    const expectedBuyOrderInEthValue = order.buyAmount.mul(cbBtcEthPrice).div(BigNumber.from('10').pow(8));
    expect(cbBTCBalanceIncrease).to.be.equal(order.buyAmount);
    expect(ethBalanceDecrease).to.be.equal(expectedBuyOrderInEthValue);
  });

  require('./basic-functionality-tests');
});
