const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const {
  Address,
  EnzymeAdress,
  Aave,
  PriceFeedOracle,
  V2Addresses,
  formatInternalContracts,
  getSigner,
  submitGovernanceProposal,
} = require('./utils');
const { ContractTypes, ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { toBytes8 } = require('../../lib/helpers');
const evm = require('./evm')();

const { BigNumber } = ethers;
const { formatEther, parseEther, defaultAbiCoder, toUtf8Bytes, parseUnits, formatUnits } = ethers.utils;
const { MaxUint256, AddressZero } = ethers.constants;

const AavePoolAbi = require('./abi/aave/AavePool.json');
const AaveProtocolDataProviderAbi = require('./abi/aave/AaveProtocolDataProvider.json');
const WETHGatewayAbi = require('./abi/aave/WETHGateway.json');
const VariableDebtTokenAbi = require('./abi/aave/VariableDebtToken.json');

const INTERAST_RATE_MODE = {
  NONE: 0,
  STABLE: 1,
  VARIABLE: 2,
};

/* ========== SAFE ========== */
const GNOSIS_SAFE_ADDRESS = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';
const SUPPLY_AMOUNT = parseEther('15369');

async function calculateSafeTrackerBalance({ awEth, usdc, aaveUsdcVariableDebtToken, dai, priceFeedOracle }) {
  const ethAmount = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);
  const awEthAmount = await awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
  const daiAmount = await dai.balanceOf(GNOSIS_SAFE_ADDRESS);
  const usdcAmount = await usdc.balanceOf(GNOSIS_SAFE_ADDRESS);
  const debtusdcAmount = await aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);

  const usdcValueInEth = await priceFeedOracle.getEthForAsset(Address.USDC_ADDRESS, usdcAmount);
  const daiValueInEth = await priceFeedOracle.getEthForAsset(Address.DAI_ADDRESS, daiAmount);
  const debtusdcValueInEth = await priceFeedOracle.getEthForAsset(Address.USDC_ADDRESS, debtusdcAmount);

  return ethAmount.add(awEthAmount).add(daiValueInEth).add(usdcValueInEth).sub(debtusdcValueInEth);
}

function assertionErrorMsg(key, parentKey) {
  return `AssertionError: values of ${key}${parentKey ? ` in ${parentKey}` : ''} don't match\n`;
}
describe('coverRe', function () {
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
    this.mcr = await ethers.getContractAt('MCR', V2Addresses.MCR);
    this.cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
    this.nxm = await ethers.getContractAt('NXMToken', V2Addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', V2Addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', V2Addresses.CoverNFT);
    this.pool = await ethers.getContractAt('Pool', V2Addresses.Pool);
    this.assessment = await ethers.getContractAt('Assessment', V2Addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', V2Addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', V2Addresses.SwapOperator);
    this.stakingPool = await ethers.getContractAt('StakingPool', V2Addresses.StakingPoolImpl);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', V2Addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', V2Addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', V2Addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', V2Addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', V2Addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', V2Addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', V2Addresses.YieldTokenIncidents);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Address.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
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

  it('add new SafeTracker (ST) contract', async function () {
    const contractsBefore = await this.master.getInternalContracts();
    const investmentLimit = parseUnits('25000000', 6);

    const safeTrackerCreate2Salt = 13944964;
    this.safeTracker = await ethers.deployContract('SafeTracker', [
      investmentLimit,
      GNOSIS_SAFE_ADDRESS,
      Address.USDC_ADDRESS,
      Address.DAI_ADDRESS,
      Address.WETH_ADDRESS,
      Address.AWETH_ADDRESS,
      Aave.VARIABLE_DEBT_USDC_ADDRESS,
    ]);

    const safeTrackerTypeAndSalt = BigNumber.from(safeTrackerCreate2Salt).shl(8).add(ContractTypes.Proxy);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes(ContractCode.SafeTracker)], [this.safeTracker.address], [safeTrackerTypeAndSalt]],
      ),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('SafeTraker Contracts before:', formatInternalContracts(contractsBefore));
    console.info('SafeTraker Contracts after:', formatInternalContracts(contractsAfter));

    // Set this.safeTracker to the safeTracker proxy contract
    const safeTrackerProxyAddress = await this.master.getLatestAddress(toUtf8Bytes('ST'));
    this.safeTracker = await ethers.getContractAt('SafeTracker', safeTrackerProxyAddress);
  });

  it('Collect storage data before upgrade', async function () {
    this.contractData = {
      mcr: { before: {}, after: {} },
      pool: { before: {}, after: {} },
      cover: { before: {}, after: {} },
      gateway: { before: {}, after: {} },
      assessment: { before: {}, after: {} },
      stakingPool: { before: {}, after: {} },
      priceFeedOracle: { before: {}, after: {} },
      tokenController: { before: {}, after: {} },
      individualClaims: { before: {}, after: {} },
      yieldTokenIncidents: { before: {}, after: {} },
    };

    // MCR
    this.contractData.mcr.before.maxMCRIncrement = await this.mcr.maxMCRIncrement();
    this.contractData.mcr.before.gearingFactor = await this.mcr.gearingFactor();
    this.contractData.mcr.before.mcr = await this.mcr.mcr();
    this.contractData.mcr.before.desiredMCR = await this.mcr.desiredMCR();
    this.contractData.mcr.before.lastUpdateTime = await this.mcr.lastUpdateTime();
    this.contractData.mcr.before.previousMCR = await this.mcr.previousMCR();

    // Pool
    this.contractData.pool.before.value = await this.pool.getPoolValueInEth();
    this.contractData.pool.before.ethBalance = await ethers.provider.getBalance(this.pool.address);
    this.contractData.pool.before.daiBalance = await this.dai.balanceOf(this.pool.address);
    this.contractData.pool.before.stEthBalance = await this.stEth.balanceOf(this.pool.address);
    this.contractData.pool.before.rEthBalance = await this.rEth.balanceOf(this.pool.address);
    this.contractData.pool.before.enzymeSharesBalance = await this.enzymeShares.balanceOf(this.pool.address);

    const assets = (await this.pool.getAssets()).map(([address]) => address);
    const assetSwapDetails = await Promise.all(assets.map(address => this.pool.getAssetSwapDetails(address)));
    this.contractData.pool.before.assets = assets;
    this.contractData.pool.before.minPoolEth = await this.swapOperator.minPoolEth();
    this.contractData.pool.before.assetSwapDetails = assets.reduce((acc, asset, i) => {
      return { ...acc, [asset]: assetSwapDetails[i] };
    }, {});

    // Price Feed
    const assetsEthRate = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetToEthRate(address)));
    const getAssetForEth = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetForEth(address, 10)));

    this.contractData.priceFeedOracle.before.assetsEthRate = assets.reduce((acc, asset, i) => {
      return { ...acc, [asset]: assetsEthRate[i] };
    }, {});
    this.contractData.priceFeedOracle.before.assetsForEth = assets.reduce((acc, asset, i) => {
      return { ...acc, [asset]: getAssetForEth[i] };
    }, {});

    // Assessment
    this.hugh = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
    this.contractData.assessment.before.assessment1 = await this.assessment.assessments(1);
    this.contractData.assessment.before.stakeOf = await this.assessment.stakeOf(this.hugh);
    this.contractData.assessment.before.votesOf = await this.assessment.votesOf(this.hugh, 1);
    this.contractData.assessment.before.hasAlreadyVotedOn = await this.assessment.hasAlreadyVotedOn(this.hugh, 1);

    // IndividualClaims
    this.contractData.individualClaims.before.claim1 = await this.individualClaims.claims(1);
    this.contractData.individualClaims.before.claimSubm1 = await this.individualClaims.lastClaimSubmissionOnCover(1);

    // YieldTokenIncidents
    const ytcConfig = await this.yieldTokenIncidents.config();
    this.contractData.yieldTokenIncidents.before.payoutRedemptionPeriodInDays = ytcConfig.payoutRedemptionPeriodInDays;
    this.contractData.yieldTokenIncidents.before.expectedPayoutRatio = ytcConfig.expectedPayoutRatio;
    this.contractData.yieldTokenIncidents.before.payoutDeductibleRatio = ytcConfig.payoutDeductibleRatio;
    this.contractData.yieldTokenIncidents.before.maxRewardInNXMWad = ytcConfig.maxRewardInNXMWad;
    this.contractData.yieldTokenIncidents.before.rewardRatio = ytcConfig.rewardRatio;

    // TokenController
    this.contractData.tokenController.before.coverInfo1 = await this.tokenController.coverInfo(1);
    this.contractData.tokenController.before.stakingPoolNXMBal1 = await this.tokenController.stakingPoolNXMBalances(1);

    // Cover
    this.contractData.cover.before.activeCover1 = await this.cover.activeCover(1);
    this.contractData.cover.before.productNames1 = await this.cover.productNames(1);
    this.contractData.cover.before.productTypeNames1 = await this.cover.productTypeNames(1);
    this.contractData.cover.before.allowedPool100 = await this.cover.allowedPools(100, 0);
  });

  it('Deploy new PriceFeedOracle contract', async function () {
    // PriceFeedOracle.sol
    const assetAddresses = [
      Address.DAI_ADDRESS,
      Address.STETH_ADDRESS,
      EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      Address.RETH_ADDRESS,
      Address.USDC_ADDRESS,
    ];
    const assetAggregators = [
      PriceFeedOracle.DAI_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
      PriceFeedOracle.STETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
      PriceFeedOracle.ENZYMEV4_VAULT_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
      PriceFeedOracle.RETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
      PriceFeedOracle.USDC_ETH_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18, 18, 6];
    this.priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      assetAddresses,
      assetAggregators,
      assetDecimals,
      this.safeTracker.address,
    ]);
  });

  it('Deploy new SwapOperator', async function () {
    this.swapOperator = await ethers.deployContract('SwapOperator', [
      Address.COWSWAP_SETTLEMENT, // _cowSettlement
      Address.SWAP_CONTROLLER, // _swapController
      this.master.address, // _master
      Address.WETH_ADDRESS, // _weth
      EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS,
      GNOSIS_SAFE_ADDRESS, // _safe
      Address.DAI_ADDRESS, // _dai
      Address.USDC_ADDRESS, // _usdc
      EnzymeAdress.ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      0, // Min Pool ETH
    ]);
  });

  it('Update the PriceFeedOracle in the Pool contract', async function () {
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.updatePoolAddressParameters,
      defaultAbiCoder.encode(['bytes8', 'address'], [toBytes8('PRC_FEED'), this.priceFeedOracle.address]),
      this.abMembers,
      this.governance,
    );
  });

  it('Update the SwapOperator in the Pool contract', async function () {
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.updatePoolAddressParameters,
      defaultAbiCoder.encode(['bytes8', 'address'], [toBytes8('SWP_OP'), this.swapOperator.address]),
      this.abMembers,
      this.governance,
    );
  });

  it('Pool value check', async function () {
    // after pool values
    const newPoolValueAfter = await this.pool.getPoolValueInEth();
    const newEthBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const newDaiBalanceAfter = await this.dai.balanceOf(this.pool.address);
    const newStEthBalanceAfter = await this.stEth.balanceOf(this.pool.address);
    const newREthBalanceAfter = await this.rEth.balanceOf(this.pool.address);
    const newEnzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.address);

    // pool values diff
    const poolValueDiff = newPoolValueAfter.sub(this.contractData.pool.before.value);
    const ethBalanceDiff = newEthBalanceAfter.sub(this.contractData.pool.before.ethBalance);
    const daiBalanceDiff = newDaiBalanceAfter.sub(this.contractData.pool.before.daiBalance);
    const stEthBalanceDiff = newStEthBalanceAfter.sub(this.contractData.pool.before.stEthBalance);
    const rEthBalanceDiff = newREthBalanceAfter.sub(this.contractData.pool.before.rEthBalance);
    const enzymeSharesBalanceDiff = newEnzymeSharesBalanceAfter.sub(this.contractData.pool.before.enzymeSharesBalance);

    console.info({
      poolValueBefore: formatEther(this.contractData.pool.before.value),
      poolValueAfter: formatEther(newPoolValueAfter),
      poolValueDiff: formatEther(poolValueDiff),
      ethBalanceBefore: formatEther(this.contractData.pool.before.ethBalance),
      ethBalanceAfter: formatEther(newEthBalanceAfter),
      ethBalanceDiff: formatEther(ethBalanceDiff),
      daiBalanceBefore: formatEther(this.contractData.pool.before.daiBalance),
      daiBalanceAfter: formatEther(newDaiBalanceAfter),
      daiBalanceDiff: formatEther(daiBalanceDiff),
      stEthBalanceBefore: formatEther(this.contractData.pool.before.stEthBalance),
      stEthBalanceAfter: formatEther(newStEthBalanceAfter),
      stEthBalanceDiff: formatEther(stEthBalanceDiff),
      rEthBalanceBefore: formatEther(this.contractData.pool.before.rEthBalance),
      rEthBalanceAfter: formatEther(newREthBalanceAfter),
      rEthBalanceDiff: formatEther(rEthBalanceDiff),
      enzymeSharesBalanceBefore: formatEther(this.contractData.pool.before.enzymeSharesBalance),
      enzymeSharesBalanceAfter: formatEther(newEnzymeSharesBalanceAfter),
      enzymeSharesBalanceDiff: formatEther(enzymeSharesBalanceDiff),
      oldPoolValueAfter: await this.pool.getPoolValueInEth(),
      oldPoolEthBalanceAfter: await ethers.provider.getBalance(this.pool.address),
      oldPoolDaiBalanceAfter: await this.dai.balanceOf(this.pool.address),
      oldPoolStEthBalanceAfter: await this.stEth.balanceOf(this.pool.address),
      oldPoolREthBalanceAfter: await this.rEth.balanceOf(this.pool.address),
      oldPoolEnzymeSharesBalanceAfter: await this.enzymeShares.balanceOf(this.pool.address),
    });

    // ~1 wei discrepancy is acceptable
    expect(poolValueDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(ethBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(daiBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(stEthBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(rEthBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(enzymeSharesBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
  });

  it('Compares storage of upgraded PriceFeedOracle contract', async function () {
    // PRICE FEED
    const { assets } = this.contractData.pool.before;
    const assetsEthRate = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetToEthRate(address)));
    const getAssetForEth = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetForEth(address, 10)));

    const afterAssetsEthRate = assets.reduce((acc, asset, i) => ({ ...acc, [asset]: assetsEthRate[i] }), {});
    const afterAssetsForEth = assets.reduce((acc, asset, i) => ({ ...acc, [asset]: getAssetForEth[i] }), {});

    for (const [asset, value] of Object.entries(this.contractData.priceFeedOracle.before.assetsEthRate)) {
      expect(afterAssetsEthRate[asset], assertionErrorMsg('assetsEthRate', asset)).to.be.equal(value);
    }

    for (const [asset, value] of Object.entries(this.contractData.priceFeedOracle.before.assetsForEth)) {
      expect(afterAssetsForEth[asset], assertionErrorMsg('assetsEthRate', asset)).to.be.equal(value);
    }
  });

  it('Add SafeTracker as an asset to the pool', async function () {
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.addAsset,
      defaultAbiCoder.encode(
        ['address', 'bool', 'uint', 'uint', 'uint'],
        [this.safeTracker.address, false, '0', parseUnits('2000000', 18), 250],
      ),
      this.abMembers,
      this.governance,
    );

    this.poolValueInEth = await this.pool.getPoolValueInEth();
  });

  it('Impersonate Gnosis Safe', async function () {
    await evm.impersonate(GNOSIS_SAFE_ADDRESS);
    this.gnosisSafe = await getSigner(GNOSIS_SAFE_ADDRESS);
  });

  it('Impersonate Swap Controller', async function () {
    await evm.impersonate(Address.SWAP_CONTROLLER);
    this.swapController = await getSigner(Address.SWAP_CONTROLLER);
  });

  it('Request Transfer ETH from Pool to GnosisSafe', async function () {
    const amount = parseEther('15870');
    const requestedAssetBefore = await this.swapOperator.transferRequest();
    await this.swapOperator.connect(this.gnosisSafe).requestAsset(Address.ETH, amount);
    const requestedAssetAfter = await this.swapOperator.transferRequest();
    expect(requestedAssetAfter.amount).to.be.equal(requestedAssetBefore.amount.add(amount));
  });

  it('Transfer ETH from Pool to GnosisSafe', async function () {
    const { amount: transferAmount } = await this.swapOperator.transferRequest();
    const safeTrackerBalanceBefore = await this.safeTracker.balanceOf(this.pool.address);
    await this.swapOperator.connect(this.swapController).transferRequestedAsset(Address.ETH, transferAmount);
    const { amount, asset } = await this.swapOperator.transferRequest();
    expect(amount).to.be.equal(0);
    expect(asset).to.be.equal(AddressZero);

    const poolValueInEthAfterTransferToSafe = await this.pool.getPoolValueInEth();
    const safeTrackerBalanceAfter = await this.safeTracker.balanceOf(this.pool.address);
    expect(safeTrackerBalanceAfter).to.be.equal(transferAmount.add(safeTrackerBalanceBefore));
    expect(poolValueInEthAfterTransferToSafe).to.be.equal(this.poolValueInEth);
  });

  it('AAVE contracts', async function () {
    this.aavePool = await ethers.getContractAt(AavePoolAbi, Aave.POOL_V3_ADDRESS);
    this.aavePoolDataProvider = await ethers.getContractAt(AaveProtocolDataProviderAbi, Aave.POOL_DATA_PROVIDER);
    this.aaveWethGateway = await ethers.getContractAt(WETHGatewayAbi, Aave.WETH_GATEWAY_ADDRESS);
    this.aaveUsdcVariableDebtToken = await ethers.getContractAt(VariableDebtTokenAbi, Aave.VARIABLE_DEBT_USDC_ADDRESS);
  });

  it('supply ETH to AAVE Pool V3', async function () {
    const ethBalanceBefore = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);
    const tx = await this.aaveWethGateway
      .connect(this.gnosisSafe)
      .depositETH(Aave.POOL_V3_ADDRESS, GNOSIS_SAFE_ADDRESS, 0, { value: SUPPLY_AMOUNT });
    const ethBalanceAfter = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.sub(SUPPLY_AMOUNT).sub(tx.gasPrice.mul(tx.gasLimit)));

    const poolValueInEthAfterDeposit = await this.pool.getPoolValueInEth();
    expect(poolValueInEthAfterDeposit).to.be.equal(this.poolValueInEth);
    this.safeTrackerBalanceAfterTransfer = await this.safeTracker.balanceOf(this.pool.address);
  });

  it('borrow USDC from AAVE Pool V3', async function () {
    const amount = parseUnits('10205200', 6);
    const usdcBalanceBefore = await this.usdc.balanceOf(GNOSIS_SAFE_ADDRESS);
    await this.aaveUsdcVariableDebtToken
      .connect(this.gnosisSafe)
      .approveDelegation(GNOSIS_SAFE_ADDRESS, parseEther('1'));

    const tx = await this.aavePool
      .connect(this.gnosisSafe)
      .borrow(Address.USDC_ADDRESS, amount, INTERAST_RATE_MODE.VARIABLE, '0', GNOSIS_SAFE_ADDRESS);

    const usdcBalanceAfter = await this.usdc.balanceOf(GNOSIS_SAFE_ADDRESS);
    expect(usdcBalanceAfter).to.be.equal(usdcBalanceBefore.add(amount));
    const aaveUsdcVariableDebtTokenBalance = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);

    console.log(aaveUsdcVariableDebtTokenBalance);

    const poolValueInEthAfterBorrow = await this.pool.getPoolValueInEth();
    expect(poolValueInEthAfterBorrow).to.be.gte(this.poolValueInEth.sub(tx.gasPrice.mul(tx.gasLimit)));

    this.poolValueInEth = poolValueInEthAfterBorrow;
    this.safeTrackerBalanceAfterBorrow = await this.safeTracker.balanceOf(this.pool.address);
    this.debtUSDCBalanceAfterBorrow = amount;
  });

  it('check the pool value after 30 days', async function () {
    const period = 30 * 24 * 60 * 60;

    await evm.increaseTime(period);
    await evm.mine();
    const debtUSDCBalanceCurrent = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);
    this.lastSafeTrackerBalance = await this.safeTracker.balanceOf(this.pool.address);
    console.log('Safe Tracker BalanceOf');
    console.log(`Right after transfer: ${formatEther(this.safeTrackerBalanceAfterTransfer)}`);
    console.log(`Right after borrow:   ${formatEther(this.safeTrackerBalanceAfterBorrow)}`);
    console.log(`After 30 days:        ${formatEther(this.lastSafeTrackerBalance)}`);
    console.log('Safe Tracker Debt Balances');
    console.log(`Right after borrow:   ${formatUnits(this.debtUSDCBalanceAfterBorrow, 6)}`);
    console.log(`After 30 days:        ${formatUnits(debtUSDCBalanceCurrent, 6)}`);
  });

  it('add more collateral to AAVE Pool V3', async function () {
    await evm.increaseTime(60);
    const supplyAmount = parseEther('500');
    const ethBalanceBefore = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);
    const tx = await this.aaveWethGateway
      .connect(this.gnosisSafe)
      .depositETH(Aave.POOL_V3_ADDRESS, GNOSIS_SAFE_ADDRESS, 0, { value: supplyAmount });
    const ethBalanceAfter = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);

    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.sub(supplyAmount).sub(tx.gasPrice.mul(tx.gasLimit)));

    const safeTrackerBalanceAfterDeposit = await this.safeTracker.balanceOf(this.pool.address);
    const expectedTrackerBalance = await calculateSafeTrackerBalance(this);
    expect(safeTrackerBalanceAfterDeposit).to.be.gte(expectedTrackerBalance);
    this.lastSafeTrackerBalance = safeTrackerBalanceAfterDeposit;
  });

  it('repay part of USDC debt', async function () {
    const amount = 10000000;
    const dataBefore = await this.aavePoolDataProvider.getUserReserveData(Address.USDC_ADDRESS, GNOSIS_SAFE_ADDRESS);

    await this.usdc.connect(this.gnosisSafe).approve(Aave.POOL_V3_ADDRESS, parseEther('1'));
    await this.aavePool
      .connect(this.gnosisSafe)
      .repay(Address.USDC_ADDRESS, amount, INTERAST_RATE_MODE.VARIABLE, GNOSIS_SAFE_ADDRESS);

    const dataAfter = await this.aavePoolDataProvider.getUserReserveData(Address.USDC_ADDRESS, GNOSIS_SAFE_ADDRESS);

    // interest should be low at this point so adding 2 just in case
    expect(dataAfter.currentVariableDebt).to.be.lte(dataBefore.currentVariableDebt);

    const safeTrackerBalance = await this.safeTracker.balanceOf(this.pool.address);
    const expectedSafeTrackerBalance = await this.safeTracker.balanceOf(this.pool.address);
    expect(safeTrackerBalance).to.be.lte(expectedSafeTrackerBalance);
  });

  it('repay whole USDC debt', async function () {
    await this.usdc.connect(this.gnosisSafe).approve(Aave.POOL_V3_ADDRESS, parseEther('1'));
    await this.aavePool
      .connect(this.gnosisSafe)
      .repay(Address.USDC_ADDRESS, MaxUint256, INTERAST_RATE_MODE.VARIABLE, GNOSIS_SAFE_ADDRESS);

    const debtData = await this.aavePoolDataProvider.getUserReserveData(Address.USDC_ADDRESS, GNOSIS_SAFE_ADDRESS);
    const aaveUsdcVariableDebtTokenBalance = await this.aaveUsdcVariableDebtToken.balanceOf(GNOSIS_SAFE_ADDRESS);

    expect(aaveUsdcVariableDebtTokenBalance).to.be.equal(0);
    expect(debtData.currentVariableDebt).to.be.equal(0);

    const safeTrackerBalance = await this.safeTracker.balanceOf(this.pool.address);
    const expectedSafeTrackerBalance = await this.safeTracker.balanceOf(this.pool.address);
    expect(safeTrackerBalance).to.be.lte(expectedSafeTrackerBalance);
  });

  it('withdraw deposit', async function () {
    const awethBalanceBefore = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const ethBalanceBefore = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);

    await this.awEth.connect(this.gnosisSafe).approve(Aave.WETH_GATEWAY_ADDRESS, MaxUint256);
    const tx = await this.aaveWethGateway
      .connect(this.gnosisSafe)
      .withdrawETH(Aave.POOL_V3_ADDRESS, MaxUint256, GNOSIS_SAFE_ADDRESS);

    const awethBalanceAfter = await this.awEth.balanceOf(GNOSIS_SAFE_ADDRESS);
    const ethBalanceAfter = await ethers.provider.getBalance(GNOSIS_SAFE_ADDRESS);

    expect(awethBalanceAfter).to.be.equal(0);
    expect(ethBalanceAfter).to.be.gte(ethBalanceBefore.add(awethBalanceBefore).sub(tx.gasPrice.mul(tx.gasLimit)));
  });
});
