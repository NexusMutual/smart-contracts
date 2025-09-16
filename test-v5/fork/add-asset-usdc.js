const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { addresses } = require('@nexusmutual/deployments');

const {
  Address,
  UserAddress,
  EnzymeAdress,
  V2Addresses,
  getSigner,
  submitMemberVoteGovernanceProposal,
} = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { SigningScheme, domain: makeDomain, SettlementEncoder } = require('@cowprotocol/contracts');

const evm = require('./evm')();

const { parseEther, defaultAbiCoder, toUtf8Bytes, parseUnits, keccak256, hexZeroPad } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const addOrder = async (trader, order, executedAmount, encoder) => {
  const sellToken = await ethers.getContractAt('ERC20Mock', order.sellToken);

  console.log(`Approve sell token`);
  await sellToken.connect(trader).approve(Address.COWSWAP_RELAYER, ethers.constants.MaxUint256);

  console.log('Sing Encode Trade');

  await encoder.signEncodeTrade(order, trader, SigningScheme.EIP712, {
    executedAmount,
  });
};

const makeContractOrder = order => {
  return {
    ...order,
    kind: keccak256(toUtf8Bytes(order.kind)),
    sellTokenBalance: keccak256(toUtf8Bytes(order.sellTokenBalance)),
    buyTokenBalance: keccak256(toUtf8Bytes(order.buyTokenBalance)),
  };
};

describe('usdc', function () {
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
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.pool = await ethers.getContractAt('Pool', addresses.Pool);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.stakingPool = await ethers.getContractAt('StakingPool', V2Addresses.StakingPoolImpl);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', addresses.LegacyPooledStaking);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.gateway = await ethers.getContractAt('LegacyGateway', addresses.LegacyGateway);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.safeTracker = await ethers.getContractAt('SafeTracker', addresses.SafeTracker);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
  });

  it('Impersonate cover Buyer', async function () {
    await evm.impersonate(UserAddress.DAI_NXM_HOLDER);
    await evm.setBalance(UserAddress.DAI_NXM_HOLDER, parseEther('100000'));
    this.coverBuyer = await getSigner(UserAddress.DAI_NXM_HOLDER);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('Add USDC as an asset to the pool', async function () {
    const min = parseUnits('10000000', 6).toString();
    const max = parseUnits('15000000', 6).toString();

    const poolValueInEthBefore = await this.pool.getPoolValueInEth();

    await submitMemberVoteGovernanceProposal(
      PROPOSAL_CATEGORIES.addAsset,
      defaultAbiCoder.encode(['address', 'bool', 'uint', 'uint', 'uint'], [Address.USDC_ADDRESS, true, min, max, 250]),
      this.abMembers,
      this.governance,
    );

    const poolValueInEthAfter = await this.pool.getPoolValueInEth();
    // Pool value should increase since we have usdc already in the pool
    expect(poolValueInEthAfter).to.be.gt(poolValueInEthBefore);
  });

  it('fail to buy cover that only supports DAI', async function () {
    const coverBuyerAddress = await this.coverBuyer.getAddress();

    await this.usdc.approve(this.cover.address, MaxUint256);

    await expect(
      this.cover.connect(this.coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyerAddress,
          productId: 165,
          coverAsset: 6,
          amount: 1000000,
          period: 3600 * 24 * 30, // 30 days
          maxPremiumInAsset: parseEther('1').mul(260).div(10000),
          paymentAsset: 6,
          payWithNXM: false,
          commissionRatio: 500,
          commissionDestination: coverBuyerAddress,
          ipfsData: '',
        },
        [{ poolId: 23, coverAmountInAsset: 1000000, skip: false }],
      ),
    ).to.be.revertedWithCustomError(this.cover, 'CoverAssetNotSupported');
  });

  it('fail to buy cover that only supports ETH', async function () {
    const coverBuyerAddress = await this.coverBuyer.getAddress();

    await this.usdc.connect(this.coverBuyer).approve(this.cover.address, MaxUint256);

    await expect(
      this.cover.connect(this.coverBuyer).buyCover(
        {
          coverId: 0,
          owner: coverBuyerAddress,
          productId: 167,
          coverAsset: 6,
          amount: 1000000,
          period: 3600 * 24 * 30, // 30 days
          maxPremiumInAsset: 1712106,
          paymentAsset: 6,
          payWithNXM: false,
          commissionRatio: 500,
          commissionDestination: coverBuyerAddress,
          ipfsData: '',
        },
        [{ poolId: 22, coverAmountInAsset: 1712106, skip: false }],
      ),
    ).to.be.revertedWithCustomError(this.cover, 'CoverAssetNotSupported');
  });

  it('Buy cover with USDC', async function () {
    const coverBuyerAddress = await this.coverBuyer.getAddress();

    await this.usdc.connect(this.coverBuyer).approve(this.cover.address, MaxUint256);
    await this.cover.connect(this.coverBuyer).buyCover(
      {
        coverId: 0,
        owner: coverBuyerAddress,
        productId: 1,
        coverAsset: 6,
        amount: 1000000,
        period: 3600 * 24 * 30, // 30 days
        maxPremiumInAsset: 1712106,
        paymentAsset: 6,
        payWithNXM: false,
        commissionRatio: 500,
        commissionDestination: coverBuyerAddress,
        ipfsData: '',
      },
      [{ poolId: 13, coverAmountInAsset: 1712106, skip: false }],
    );
  });

  // SWAP

  it('Prepare for swap', async function () {
    await evm.impersonate(UserAddress.DAI_HOLDER);
    await evm.setBalance(UserAddress.DAI_HOLDER, parseEther('1000'));
    this.stablecoinWhale = await getSigner(UserAddress.DAI_HOLDER);

    await evm.impersonate(Address.SWAP_CONTROLLER);
    await evm.setBalance(Address.SWAP_CONTROLLER, parseEther('100000'));
    this.swapController = await getSigner(Address.SWAP_CONTROLLER);

    this.trader = ethers.Wallet.createRandom().connect(ethers.provider);
    // top up trader address with stablecoins
    await this.usdc.connect(this.stablecoinWhale).transfer(this.trader.address, parseUnits('3000000', 6));
    await evm.setBalance(this.trader.address, parseEther('20000'));

    await evm.impersonate(Address.COWSWAP_SOLVER);
    await evm.setBalance(Address.COWSWAP_SOLVER, parseEther('1000'));
    this.cowswapSolver = await getSigner(Address.COWSWAP_SOLVER);

    const { chainId } = await ethers.provider.getNetwork();
    const domainSeparator = makeDomain(chainId, Address.COWSWAP_SETTLEMENT);

    this.encoder = new SettlementEncoder(domainSeparator);

    this.cowswapSettlement = await ethers.getContractAt('ICowSettlement', Address.COWSWAP_SETTLEMENT);
  });

  it('Places a swap order', async function () {
    const { timestamp } = await ethers.provider.getBlock('latest');
    const sellAmount = parseEther('10');
    const buyAmount = parseUnits('38000', 6);

    const usdcBalanceBefore = await this.usdc.balanceOf(this.pool.address);
    const ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);

    const usdcEthPrice = await this.priceFeedOracle.getEthForAsset(Address.USDC_ADDRESS, parseUnits('1', 6));
    const ethUsdcPrice = await this.priceFeedOracle.getAssetForEth(Address.USDC_ADDRESS, parseEther('1'));

    const order = {
      sellToken: Address.WETH_ADDRESS,
      buyToken: Address.USDC_ADDRESS,
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

    await addOrder(
      this.trader,
      {
        validTo: 0xffffffff,
        feeAmount: ethers.utils.parseEther('1.0'),
        kind: 'sell',
        partiallyFillable: false,
        sellToken: Address.USDC_ADDRESS,
        buyToken: Address.WETH_ADDRESS,
        sellAmount: buyAmount,
        buyAmount: imaginaryBuyAmount,
        appData: 1,
      },
      '0',
      this.encoder,
    );
    console.log(`Settle trade`);

    console.log('----------------------------------');
    console.log(usdcEthPrice.toString());
    console.log(ethUsdcPrice.toString());
    console.log('----------------------------------');
    console.log(buyAmount.toString());
    console.log(imaginaryBuyAmount.toString());
    console.log('----------------------------------');
    console.log(buyAmount.mul(usdcEthPrice).toString());
    console.log(imaginaryBuyAmount.mul(ethUsdcPrice).toString());
    console.log('----------------------------------');

    const encodedSettlement = this.encoder.encodedSettlement({
      [Address.USDC_ADDRESS]: usdcEthPrice.mul(1000000000000),
      [Address.WETH_ADDRESS]: ethUsdcPrice,
    });

    console.log(encodedSettlement);

    await this.cowswapSettlement.connect(this.cowswapSolver).settle(...encodedSettlement);

    await this.swapOperator.connect(this.swapController).closeOrder(contractOrder);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const usdcBalanceAfter = await this.usdc.balanceOf(this.pool.address);

    const usdcBalanceIncrease = usdcBalanceAfter.sub(usdcBalanceBefore);
    const ethBalanceDecrease = ethBalanceBefore.sub(ethBalanceAfter);

    expect(ethBalanceDecrease).to.be.equal(order.sellAmount);

    expect(usdcBalanceIncrease).to.be.equal(order.buyAmount);
  });

  require('./basic-functionality-tests');
});
