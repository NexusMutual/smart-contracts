const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { V2Addresses, UserAddress, submitGovernanceProposal, PriceFeedOracle, Address, EnzymeAddress } = require('./utils');
const { proposalCategories, constants: { PoolAddressParamType } } = require("../utils");
const { lastBlockTimestamp, makeContractOrder } = require("../unit/SwapOperator/helpers");
const { domain: makeDomain, computeOrderUid, SigningScheme } = require("@cowprotocol/contracts");

const { ENZYMEV4_VAULT_PROXY_ADDRESS } = EnzymeAddress;
const { DAI_ADDRESS, STETH_ADDRESS, RETH_ADDRESS } = Address;
const {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR,
  STETH_PRICE_FEED_ORACLE_AGGREGATOR,
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
  RETH_PRICE_FEED_ORACLE_AGGREGATOR
} = PriceFeedOracle;

const evm = require('./evm')();
describe('Swap ETH for rETH', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(UserAddress.HUGH);
    await setEtherBalance(hugh.address, parseEther('1000'));

    this.hugh = hugh;

    // Upgrade StakingProducts
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    const { memberArray: abMembersAddresses } = await memberRoles.members(1);

    const abMembers = [];
    for (const address of abMembersAddresses) {
      const abSigner = await ethers.getImpersonatedSigner(address);
      await setEtherBalance(address, parseEther('1000'));
      abMembers.push(abSigner);
    }

    this.abMembers = abMembers;
    this.governance = governance;
  });

  it('should edit proposal category 42 to match new signature', async function () {

    // the current signature of addAsset is addAsset(address,bool,uint256,uint256,uint256)
    // and does not match the signature of category 42
    await submitGovernanceProposal(
      // editCategory(uint256,string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.editCategory,
      defaultAbiCoder.encode(
        [
          'uint256',
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string',
        ],
        [41, ...proposalCategories[42]],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('should add new asset rETH', async function () {

    const isCoverAsset = false;
    const minValue = parseEther('13350');
    const maxValue = parseEther('13400');
    const maxSlippageRatio = 100;

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.addAsset,
      defaultAbiCoder.encode(
        ['address','bool','uint256','uint256','uint256'],
        [RETH_ADDRESS, isCoverAsset, minValue, maxValue, maxSlippageRatio]),
      this.abMembers,
      this.governance,
    );
  });

  it('should upgrade PriceFeedOracle contract', async function () {

    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS, RETH_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
      RETH_PRICE_FEED_ORACLE_AGGREGATOR
    ];
    console.log('Deploying new PriceFeedOracle');
    const assetDecimals = [18, 18, 18, 18];
    const priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      assetAddresses,
      assetAggregators,
      assetDecimals,
    ]);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.updatePoolAddressParameters,
      defaultAbiCoder.encode(['bytes8', 'address'], [PoolAddressParamType.priceFeedOracle, priceFeedOracle.address]),
      this.abMembers,
      this.governance,
    );
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
});
