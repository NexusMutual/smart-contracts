const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, hexZeroPad, toUtf8Bytes } = ethers.utils;
const { V2Addresses, UserAddress, submitGovernanceProposal, voteGovernanceProposal, closeGovernanceProposal, submitGovernanceProposalWithCreateProposalWithSolution,
  PriceFeedOracle, Address, EnzymeAddress } = require('./utils');
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

const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';
const COWSWAP_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110';
const COWSWAP_SOLVER = '0x423cEc87f19F0778f549846e0801ee267a917935';
const TRADER_PKEY = '489cddb08499334cf55b9649459915dfc6606cb7aa50e0aef22259b08d6d6fe4';
const RETH_WHALE = '0x7d6149aD9A573A6E2Ca6eBf7D4897c1B766841B4';

const ROCKET_POOL_VAULT = '0xDD3f50F8A6CafbE9b31a427582963f465E745AF8';

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


const evm = require('./evm')();
describe('Swap ETH for rETH', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(UserAddress.HUGH);
    await setEtherBalance(hugh.address, parseEther('2000000'));

    this.hugh = hugh;

    const blockNumber = await ethers.provider.getBlockNumber();
    console.log({
      blockNumber
    })


    // Upgrade StakingProducts
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);

    this.master = await ethers.getContractAt('NXMaster', '0x01BFd82675DBCc7762C84019cA518e701C0cD07e');
    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.weth = await ethers.getContractAt('IWeth', WETH_ADDRESS);
    this.pool = await ethers.getContractAt('Pool', await this.master.getLatestAddress(toUtf8Bytes('P1')));
    this.swapOperator = await ethers.getContractAt('SwapOperator', await this.pool.swapOperator());
    this.cowswapSettlement = await ethers.getContractAt('ICowSettlement', COWSWAP_SETTLEMENT);
    this.rEthEthOracle = await ethers.getContractAt('Aggregator', RETH_PRICE_FEED_ORACLE_AGGREGATOR);
    this.enzymeVault = await ethers.getContractAt('IEnzymeV4Vault', ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.rETH = await ethers.getContractAt('ERC20Mock', RETH_ADDRESS);
    this.rocketPoolVault = await ethers.getContractAt('IRocketPoolVault', ROCKET_POOL_VAULT);

    const { memberArray: abMembersAddresses } = await memberRoles.members(1);

    const abMembers = [];
    for (const address of abMembersAddresses) {
      const abSigner = await ethers.getImpersonatedSigner(address);
      await setEtherBalance(address, parseEther('1000000'));
      abMembers.push(abSigner);
    }

    this.abMembers = abMembers;
    this.governance = governance;
  });

  it('Impersonate addresses', async function () {
    const swapControllerAddress = await this.swapOperator.swapController();
    await evm.impersonate(swapControllerAddress);
    await evm.setBalance(swapControllerAddress, parseEther('1000'));
    this.swapController = await getSigner(swapControllerAddress);

    // This trader sits on the other side of the trade as the buyer for what SwapOperator is selling
    this.trader = new ethers.Wallet(TRADER_PKEY, ethers.provider);
    const traderAddress = await this.trader.getAddress();
    await evm.setBalance(traderAddress, parseEther('1000000'));

    await evm.impersonate(RETH_WHALE);
    await evm.setBalance(RETH_WHALE, parseEther('1000'));
    this.rETHWhale = await getSigner(RETH_WHALE);

    // TODO: uncomment to test trade
    // await this.rocketPoolVault.connect(this.trader).deposit({
    //   value: parseEther('20000'),
    // });

    // top up trader with WETH
    const amountWethForTrader = parseEther('10000');
    await this.weth.connect(this.trader).deposit({ value: amountWethForTrader });

    await evm.impersonate(COWSWAP_SOLVER);
    await evm.setBalance(COWSWAP_SOLVER, parseEther('1000'));
    this.cowswapSolver = await getSigner(COWSWAP_SOLVER);
  });

  it('should edit proposal category 42 to match new signature', async function () {

    const proposalCategoryParameters = [42, ...proposalCategories[42]];

    proposalCategoryParameters[7] = 'QmR4HufqCMP6kYUCMPxQNLnJTYsnudPiVErhZAFQghc78B';
    proposalCategoryParameters[8] = '0xcafea112Db32436c2390F5EC988f3aDB96870627';
    console.log({
      proposalCategoryParametersForCategory42: proposalCategoryParameters,
    });



    // the current signature of addAsset is addAsset(address,bool,uint256,uint256,uint256)
    // and does not match the signature of category 42

    await voteGovernanceProposal(199, this.abMembers, this.governance);


  });

  it('should edit proposal category 41 to match new signature', async function () {

    const proposalCategoryParameters = [41, ...proposalCategories[41]];

    console.log({
      proposalCategoryParametersforCategory41: proposalCategoryParameters
    });
    // the current signature of addAsset is setSwapDetails(address,uint,uint,uint)
    // and does not match the signature of category 41
    await closeGovernanceProposal(200, this.abMembers, this.governance);
  });


  it('should upgrade PriceFeedOracle contract', async function () {

    const { pool } = this;

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

    const proposalParameters = [PoolAddressParamType.priceFeedOracle, priceFeedOracle.address];

    console.log({
      proposalParameters
    });

    console.log({
      pool: pool.address
    })

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.updatePoolAddressParameters,
      defaultAbiCoder.encode(['bytes8', 'address'], proposalParameters),
      this.abMembers,
      this.governance,
    );

    const priceFeedOracleAddress = await pool.priceFeedOracle();
    expect(priceFeedOracleAddress).to.be.equal(priceFeedOracle.address);
  });

  it('add new category for setAssetDetails', async function () {

    const proposalCategoryParameters = proposalCategories[45];

    console.log({
      proposalCategoryParametersforCategory45: proposalCategoryParameters
    });
    // the current signature of addAsset is setSwapDetails(address,uint,uint,uint)
    // and does not match the signature of category 41
    await submitGovernanceProposal(
      // addCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.addCategory,
      defaultAbiCoder.encode(
        [
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
        proposalCategoryParameters,
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('should add new asset rETH', async function () {
    const { pool } = this;

    const poolValueInEth = await pool.getPoolValueInEth();
    console.log({
      poolValueInEthBeforeAddingAsset: poolValueInEth.toString()
    });

    const isCoverAsset = false;
    const minValue = parseEther('13350');
    const maxValue = parseEther('13400');
    const maxSlippageRatio = 50; // 0.5%

    const proposalParameters = [RETH_ADDRESS, isCoverAsset, minValue, maxValue, maxSlippageRatio];


    console.log({
      proposalParameters: [RETH_ADDRESS, isCoverAsset, minValue.toString(), maxValue.toString(), maxSlippageRatio]
    })
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.addAsset,
      defaultAbiCoder.encode(
        ['address','bool','uint256','uint256','uint256'],
        proposalParameters),
      this.abMembers,
      this.governance,
    );

    // const assetsAfter = await pool.getAssets();
    //
    // console.log({
    //   assetsAfter
    // })

    const rethSwapDetails = await pool.getAssetSwapDetails(RETH_ADDRESS);

    expect(rethSwapDetails.minAmount).to.be.equal(minValue);
    expect(rethSwapDetails.maxAmount).to.be.equal(maxValue);
    expect(rethSwapDetails.lastSwapTime).to.be.equal(0);
    expect(rethSwapDetails.maxSlippageRatio).to.be.equal(maxSlippageRatio);
  });

  it('checks total pool value after adding new oracle and assets', async function () {
    const { pool } = this;

    const poolValueInEthBefore = await pool.getPoolValueInEth();
    console.log({
      poolValueInEth: poolValueInEthBefore.toString()
    });

    const rETHDepositedToPool = parseEther('1000');

    await this.rETH.connect(this.rETHWhale).transfer(pool.address, rETHDepositedToPool);
  });

  it('should test setAssetSwapDetails with new values', async function () {

    const { pool } = this;

    const minValue = parseEther('14000');
    const maxValue = parseEther('15000');
    const maxSlippageRatio = 100; // 1%

    const proposalParameters = [RETH_ADDRESS, minValue, maxValue, maxSlippageRatio];

    console.log({
      proposalParameters: [RETH_ADDRESS, minValue.toString(), maxValue.toString(), maxSlippageRatio]
    })
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.setAssetDetails,
      defaultAbiCoder.encode(
        ['address','uint256','uint256','uint256'],
        proposalParameters),
      this.abMembers,
      this.governance,
    );

    const rethSwapDetails = await pool.getAssetSwapDetails(RETH_ADDRESS);

    expect(rethSwapDetails.minAmount).to.be.equal(minValue);
    expect(rethSwapDetails.maxAmount).to.be.equal(maxValue);
    expect(rethSwapDetails.lastSwapTime).to.be.equal(0);
    expect(rethSwapDetails.maxSlippageRatio).to.be.equal(maxSlippageRatio);
  });

  it('should test setAssetDetails with new values', async function () {
    const { pool } = this;

    const assets = await pool.getAssets();
    const lastAssetId = assets.length - 1;

    console.log(`Editing asset with id ${lastAssetId}`);


    // make the asset abandoned
    const proposalParameters = [lastAssetId, false, true];

    await submitGovernanceProposal(
      45,
      defaultAbiCoder.encode(
        ['uint256','bool','bool'],
        proposalParameters),
      this.abMembers,
      this.governance,
    );

    const rethDetails = await pool.assets(lastAssetId);

    expect(rethDetails.isAbandoned).to.be.equal(true);
  });

  it.skip('executes CowSwap swap of ETH for rETH', async function () {
    const { swapOperator, pool, swapController } = this;

    const rethPriceInEth = await this.rEthEthOracle.latestAnswer();

    console.log(`Rate rETH/ETH = ${rethPriceInEth}`);

    const sellAmount = parseEther('14400');
    const buyAmount = sellAmount.mul(parseEther('1')).div(rethPriceInEth);
    // Build order struct, domain separator and calculate UID
    const order = {
      sellToken: WETH_ADDRESS,
      buyToken: RETH_ADDRESS,
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
    const rETHBalanceBefore = await this.rETH.balanceOf(pool.address);

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
        partiallyFillable: true,
        sellToken: RETH_ADDRESS,
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
    const buyPrice = rethPriceInEth;

    const encodedSettlement = this.encoder.encodedSettlement({
      [RETH_ADDRESS]: buyPrice,
      [WETH_ADDRESS]: sellPrice,
    });

    await this.cowswapSettlement.connect(this.cowswapSolver).settle(...encodedSettlement);

    await swapOperator.connect(swapController).closeOrder(contractOrder);

    const ethBalanceAfter = await ethers.provider.getBalance(pool.address);
    const rEthBalanceAfter = await this.rETH.balanceOf(pool.address);

    const rETHBalanceIncrease = rEthBalanceAfter.sub(rETHBalanceBefore);
    const ethBalanceDecrease = ethBalanceBefore.sub(ethBalanceAfter);

    expect(ethBalanceDecrease).to.be.equal(order.sellAmount.add(order.feeAmount));

    expect(rETHBalanceIncrease).to.be.equal(order.buyAmount.add(1));
  });
});
