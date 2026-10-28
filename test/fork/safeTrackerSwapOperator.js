const { ethers, network, nexus, tracer } = require('hardhat');
const { expect } = require('chai');
const { abis, addresses } = require('@nexusmutual/deployments');
const { setBalance, takeSnapshot, time } = require('@nomicfoundation/hardhat-network-helpers');
const {
  revertToSnapshot,
  Addresses,
  createSafeExecutor,
  getFundedSigner,
  executeGovernorProposal,
  getImplementation,
  refreshRedstoneFeed,
  setNamespacedERC20Balance,
  setUSDCBalance,
} = require('./utils');

const { deployContract, parseEther, parseUnits } = ethers;
const { AggregatorType, ContractIndexes, SwapKind } = nexus.constants;

describe('SafeTracker and SwapOperator upgrade', function () {
  before(async function () {
    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await revertToSnapshot(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        const { snapshotId } = await takeSnapshot();
        console.info('Snapshot ID: ', snapshotId);
      }
    }

    const [deployer] = await ethers.getSigners();
    await setBalance(deployer.address, ethers.parseEther('1000'));
  });

  it('load contracts', async function () {
    this.registry = await ethers.getContractAt(abis.Registry, addresses.Registry);
    this.cover = await ethers.getContractAt(abis.Cover, addresses.Cover);
    this.nxm = await ethers.getContractAt(abis.NXMToken, addresses.NXMToken);
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt(abis.CoverNFT, addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt(abis.CoverProducts, addresses.CoverProducts);
    this.pool = await ethers.getContractAt(abis.Pool, addresses.Pool);
    this.safeTracker = await ethers.getContractAt(abis.SafeTracker, addresses.SafeTracker);
    this.assessments = await ethers.getContractAt(abis.Assessments, addresses.Assessments);
    this.claims = await ethers.getContractAt(abis.Claims, addresses.Claims);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt(abis.StakingProducts, addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
    this.tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
    this.individualClaims = await ethers.getContractAt(abis.Claims, addresses.Claims);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
    this.ramm = await ethers.getContractAt(abis.Ramm, addresses.Ramm);
    this.limitOrders = await ethers.getContractAt(abis.LimitOrders, addresses.LimitOrders);
    this.governor = await ethers.getContractAt(abis.Governor, addresses.Governor);
    this.assessmentsViewer = await ethers.getContractAt(abis.Assessments, addresses.Assessments);
    this.coverViewer = await ethers.getContractAt(abis.CoverViewer, addresses.CoverViewer);
    this.stakingViewer = await ethers.getContractAt(abis.StakingViewer, addresses.StakingViewer);

    // External contracts
    this.coverBroker = await ethers.getContractAt(abis.CoverBroker, addresses.CoverBroker);

    // Token Mocks
    this.weth = await ethers.getContractAt('WETH9', Addresses.WETH_ADDRESS);
    this.cbBTC = await ethers.getContractAt('ERC20Mock', Addresses.CBBTC_ADDRESS);
    this.dai = await ethers.getContractAt('ERC20Mock', Addresses.DAI_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Addresses.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Addresses.STETH_ADDRESS);
    this.awEth = await ethers.getContractAt('ERC20Mock', Addresses.AWETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);

    // safe executor
    this.executeSafeTransaction = await createSafeExecutor(Addresses.ADVISORY_BOARD_MULTISIG);

    Object.entries(addresses).forEach(([k, v]) => (tracer.nameTags[v] = `#[${k}]`));
  });

  it('Impersonate AB members', async function () {
    const boardSeats = await this.registry.ADVISORY_BOARD_SEATS();
    this.abMembers = [];
    for (let i = 1; i <= boardSeats; i++) {
      const address = await this.registry.getMemberAddressBySeat(i);
      this.abMembers.push(await getFundedSigner(address));
    }
  });

  it('Collect storage data before upgrade', async function () {
    const swapRequest = await this.swapOperator.swapRequest();

    this.beforeUpgrade = {
      safeTracker: {
        coverReInvestmentUSDC: await this.safeTracker.coverReInvestmentUSDC(),
        safe: await this.safeTracker.safe(),
        investmentLimit: await this.safeTracker.investmentLimit(),
        usdc: await this.safeTracker.usdc(),
        aweth: await this.safeTracker.aweth(),
        debtUsdc: await this.safeTracker.debtUsdc(),
        totalSupply: await this.safeTracker.totalSupply(),
        safeEthBalance: await ethers.provider.getBalance(await this.safeTracker.safe()),
      },
      swapOperator: {
        swapController: await this.swapOperator.swapController(),
        currentOrderUID: await this.swapOperator.currentOrderUID(),
        cowSettlement: await this.swapOperator.cowSettlement(),
        enzymeV4VaultProxyAddress: await this.swapOperator.enzymeV4VaultProxyAddress(),
        weth: await this.swapOperator.weth(),
        swapRequest: {
          fromAsset: swapRequest.fromAsset,
          toAsset: swapRequest.toAsset,
          fromAmount: swapRequest.fromAmount,
          toAmount: swapRequest.toAmount,
          swapKind: swapRequest.swapKind,
          deadline: swapRequest.deadline,
        },
      },
    };
  });

  it('Upgrade SafeTracker and SwapOperator', async function () {
    const { safeTracker: safeTrackerBefore, swapOperator: swapOperatorBefore } = this.beforeUpgrade;

    const safeTracker = await deployContract('SafeTracker', [
      this.registry.target,
      safeTrackerBefore.investmentLimit,
      safeTrackerBefore.safe,
      safeTrackerBefore.usdc,
      safeTrackerBefore.aweth,
      safeTrackerBefore.debtUsdc,
    ]);

    const swapOperator = await deployContract('SwapOperator', [
      this.registry.target,
      swapOperatorBefore.cowSettlement,
      swapOperatorBefore.enzymeV4VaultProxyAddress,
      swapOperatorBefore.weth,
    ]);

    const transactions = [
      {
        target: this.registry,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_SAFE_TRACKER,
          safeTracker.target,
        ]),
      },
      {
        target: this.registry,
        value: 0n,
        data: this.registry.interface.encodeFunctionData('upgradeContract', [
          ContractIndexes.C_SWAP_OPERATOR,
          swapOperator.target,
        ]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions, 'Upgrade SafeTracker and SwapOperator');

    expect(await getImplementation(this.safeTracker)).to.equal(safeTracker.target);
    expect(await getImplementation(this.swapOperator)).to.equal(swapOperator.target);

    this.safeTracker = await ethers.getContractAt('SafeTracker', addresses.SafeTracker);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
  });

  it('Compares storage of upgraded SafeTracker and SwapOperator', async function () {
    const { safeTracker: safeTrackerBefore, swapOperator: swapOperatorBefore } = this.beforeUpgrade;

    expect(await this.safeTracker.offchainInvestmentUSDC()).to.equal(safeTrackerBefore.coverReInvestmentUSDC);
    expect(await this.safeTracker.safe()).to.equal(safeTrackerBefore.safe);
    expect(await this.safeTracker.investmentLimit()).to.equal(safeTrackerBefore.investmentLimit);
    expect(await this.safeTracker.usdc()).to.equal(safeTrackerBefore.usdc);
    expect(await this.safeTracker.aweth()).to.equal(safeTrackerBefore.aweth);
    expect(await this.safeTracker.debtUsdc()).to.equal(safeTrackerBefore.debtUsdc);
    expect((await this.safeTracker.getAssets()).length).to.equal(0);

    expect(await this.swapOperator.swapController()).to.equal(swapOperatorBefore.swapController);
    expect(await this.swapOperator.currentOrderUID()).to.equal(swapOperatorBefore.currentOrderUID);
    expect(await this.swapOperator.cowSettlement()).to.equal(swapOperatorBefore.cowSettlement);
    expect(await this.swapOperator.enzymeV4VaultProxyAddress()).to.equal(swapOperatorBefore.enzymeV4VaultProxyAddress);
    expect(await this.swapOperator.weth()).to.equal(swapOperatorBefore.weth);

    const swapRequest = await this.swapOperator.swapRequest();
    expect(swapRequest.fromAsset).to.equal(swapOperatorBefore.swapRequest.fromAsset);
    expect(swapRequest.toAsset).to.equal(swapOperatorBefore.swapRequest.toAsset);
    expect(swapRequest.fromAmount).to.equal(swapOperatorBefore.swapRequest.fromAmount);
    expect(swapRequest.toAmount).to.equal(swapOperatorBefore.swapRequest.toAmount);
    expect(swapRequest.swapKind).to.equal(swapOperatorBefore.swapRequest.swapKind);
    expect(swapRequest.deadline).to.equal(swapOperatorBefore.swapRequest.deadline);
  });

  it('Safe adds WETH and USDC to SafeTracker', async function () {
    const { safeTracker: safeTrackerBefore } = this.beforeUpgrade;
    const safe = safeTrackerBefore.safe;
    const weth = await ethers.getContractAt('WETH9', Addresses.WETH_ADDRESS);
    const usdc = await ethers.getContractAt('ERC20Mock', Addresses.USDC_ADDRESS);
    const pool = await ethers.getContractAt('Pool', addresses.Pool);

    // the old implementation counted the safe's weth and usdc implicitly, the new one only counts registered assets
    const safeWethBalance = await weth.balanceOf(safe);
    const safeUsdcValueInEth = await pool.getEthForAsset(usdc, await usdc.balanceOf(safe));
    expect(await this.safeTracker.totalSupply()).to.equal(
      safeTrackerBefore.totalSupply - safeWethBalance - safeUsdcValueInEth,
    );

    // funding the signer changes the safe eth balance which is part of the safe tracker balance
    const safeSigner = await getFundedSigner(safe);

    // weth is 1:1 to eth so the safe tracker is used as its own oracle (same as in the pool)
    await expect(this.safeTracker.connect(safeSigner).addAsset(weth, this.safeTracker))
      .to.emit(this.safeTracker, 'AssetAdded')
      .withArgs(weth.target, this.safeTracker.target);

    await expect(this.safeTracker.connect(safeSigner).addAsset(usdc, Addresses.CHAINLINK_USDC_ETH))
      .to.emit(this.safeTracker, 'AssetAdded')
      .withArgs(usdc.target, Addresses.CHAINLINK_USDC_ETH);

    const assets = await this.safeTracker.getAssets();
    expect(assets.length).to.equal(2);
    expect(assets[0].assetAddress).to.equal(weth.target);
    expect(assets[1].assetAddress).to.equal(usdc.target);
    expect(assets[0].isAbandoned).to.equal(false);
    expect(assets[1].isAbandoned).to.equal(false);

    const wethOracle = await this.safeTracker.oracles(weth);
    expect(wethOracle.aggregator).to.equal(this.safeTracker.target);
    expect(wethOracle.assetDecimals).to.equal(18n);

    const usdcOracle = await this.safeTracker.oracles(usdc);
    expect(usdcOracle.aggregator).to.equal(Addresses.CHAINLINK_USDC_ETH);
    expect(usdcOracle.assetDecimals).to.equal(6n);

    // same usdc oracle as the pool, so the balance matches the pre-upgrade one apart from the safe eth balance change
    const safeEthBalanceDiff = (await ethers.provider.getBalance(safe)) - safeTrackerBefore.safeEthBalance;
    expect(await this.safeTracker.totalSupply()).to.equal(safeTrackerBefore.totalSupply + safeEthBalanceDiff);

    // weth sent to the safe is counted 1:1
    const wethAmount = parseEther('10');
    const totalSupplyBefore = await this.safeTracker.totalSupply();
    const [deployer] = await ethers.getSigners();
    await weth.connect(deployer).deposit({ value: wethAmount });
    await weth.connect(deployer).transfer(safe, wethAmount);
    expect(await this.safeTracker.totalSupply()).to.equal(totalSupplyBefore + wethAmount);

    // usdc sent to the safe is counted using the chainlink usdc / eth oracle
    const usdcBalanceBefore = await usdc.balanceOf(safe);
    const usdcBalanceAfter = usdcBalanceBefore + parseUnits('100000', 6);
    await setUSDCBalance(usdc.target, safe, usdcBalanceAfter);
    expect(await this.safeTracker.totalSupply()).to.equal(
      totalSupplyBefore +
        wethAmount -
        (await this.safeTracker.getEthForAsset(usdc, usdcBalanceBefore)) +
        (await this.safeTracker.getEthForAsset(usdc, usdcBalanceAfter)),
    );
  });

  it('Add weETH to the Pool assets', async function () {
    this.weEth = await ethers.getContractAt('ERC20Mock', Addresses.WEETH_ADDRESS);
    this.pool = await ethers.getContractAt('Pool', addresses.Pool);

    const transactions = [
      {
        target: this.pool,
        value: 0n,
        data: this.pool.interface.encodeFunctionData('addAsset', [
          Addresses.WEETH_ADDRESS,
          false, // isCoverAsset
          Addresses.CHAINLINK_WEETH_ETH,
          AggregatorType.ETH,
        ]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions, 'Add weETH to the Pool');

    const weEthAssetId = await this.pool.getAssetId(Addresses.WEETH_ADDRESS);
    const weEthAsset = await this.pool.getAsset(weEthAssetId);
    expect(weEthAsset.assetAddress).to.equal(Addresses.WEETH_ADDRESS);
    expect(weEthAsset.isCoverAsset).to.equal(false);
    expect(weEthAsset.isAbandoned).to.equal(false);
  });

  it('Swap Enzyme vault shares for weETH using swapEnzymeVaultShareForAsset', async function () {
    const swapController = await getFundedSigner(await this.swapOperator.swapController());

    const fromAmount = parseEther('10');
    const sharesValueInEth = await this.pool.getEthForAsset(Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS, fromAmount);
    const ethPerWeEth = await this.pool.getEthForAsset(Addresses.WEETH_ADDRESS, parseEther('1'));
    const expectedWeEth = (sharesValueInEth * parseEther('1')) / ethPerWeEth;
    const toAmountMin = (expectedWeEth * 99n) / 100n; // 1% slippage

    // the request must still be valid after the governor voting and timelock periods
    const governorDelay = (await this.governor.VOTING_PERIOD()) + (await this.governor.TIMELOCK_PERIOD());
    const deadline = (await time.latest()) + Number(governorDelay) + 24 * 3600;

    const swapRequest = {
      fromAsset: Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS,
      toAsset: Addresses.WEETH_ADDRESS,
      fromAmount,
      toAmount: toAmountMin,
      swapKind: SwapKind.ExactInput,
      deadline,
    };

    const transactions = [
      {
        target: this.swapOperator,
        value: 0n,
        data: this.swapOperator.interface.encodeFunctionData('requestAssetSwap', [swapRequest]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions, 'Request Enzyme to weETH swap');

    const storedSwapRequest = await this.swapOperator.swapRequest();
    expect(storedSwapRequest.fromAsset).to.equal(Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);
    expect(storedSwapRequest.toAsset).to.equal(Addresses.WEETH_ADDRESS);

    // enzyme prices weETH through redstone which reverts on stale data after the governor time travel
    await refreshRedstoneFeed(Addresses.REDSTONE_MULTI_FEED_ADAPTER, 'weETH/ETH');

    const poolSharesBefore = await this.enzymeShares.balanceOf(this.pool);
    const poolWeEthBefore = await this.weEth.balanceOf(this.pool);
    const poolValueBefore = await this.pool.getPoolValueInEth();

    const tx = await this.swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin);
    const receipt = await tx.wait();

    const swappedEvent = receipt.logs
      .filter(log => log.address === this.swapOperator.target)
      .map(log => this.swapOperator.interface.parseLog(log))
      .find(log => log?.name === 'Swapped');

    expect(swappedEvent.args.fromAsset).to.equal(Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);
    expect(swappedEvent.args.toAsset).to.equal(Addresses.WEETH_ADDRESS);
    expect(swappedEvent.args.fromAmount).to.equal(fromAmount);

    const weEthReceived = swappedEvent.args.toAmount;
    expect(weEthReceived).to.be.gte(toAmountMin);

    const poolSharesAfter = await this.enzymeShares.balanceOf(this.pool);
    const poolWeEthAfter = await this.weEth.balanceOf(this.pool);
    const poolValueAfter = await this.pool.getPoolValueInEth();

    expect(poolSharesAfter).to.equal(poolSharesBefore - fromAmount);
    expect(poolWeEthAfter).to.equal(poolWeEthBefore + weEthReceived);

    // nothing left behind in the SwapOperator
    expect(await this.enzymeShares.balanceOf(this.swapOperator)).to.equal(0n);
    expect(await this.weEth.balanceOf(this.swapOperator)).to.equal(0n);

    // swap request consumed and pool swap state cleared
    expect((await this.swapOperator.swapRequest()).fromAsset).to.equal(ethers.ZeroAddress);
    expect((await this.pool.assetInSwapOperator()).amount).to.equal(0n);

    // pool value should stay within 1% of the swapped value
    const poolValueDiff =
      poolValueBefore > poolValueAfter ? poolValueBefore - poolValueAfter : poolValueAfter - poolValueBefore;
    expect(poolValueDiff).to.be.lte(sharesValueInEth / 100n);
  });

  it('Swap Enzyme vault shares for ETH using swapEnzymeVaultShareForAsset', async function () {
    const swapController = await getFundedSigner(await this.swapOperator.swapController());

    const fromAmount = parseEther('10');
    const sharesValueInEth = await this.pool.getEthForAsset(Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS, fromAmount);
    const toAmountMin = (sharesValueInEth * 99n) / 100n; // 1% slippage

    // the request must still be valid after the governor voting and timelock periods
    const governorDelay = (await this.governor.VOTING_PERIOD()) + (await this.governor.TIMELOCK_PERIOD());
    const deadline = (await time.latest()) + Number(governorDelay) + 24 * 3600;

    const swapRequest = {
      fromAsset: Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS,
      toAsset: Addresses.ETH,
      fromAmount,
      toAmount: toAmountMin,
      swapKind: SwapKind.ExactInput,
      deadline,
    };

    const transactions = [
      {
        target: this.swapOperator,
        value: 0n,
        data: this.swapOperator.interface.encodeFunctionData('requestAssetSwap', [swapRequest]),
      },
    ];

    await executeGovernorProposal(this.governor, this.abMembers, transactions, 'Request Enzyme to ETH swap');

    // ETH requests are stored as WETH, which is the asset Enzyme pays out
    const storedSwapRequest = await this.swapOperator.swapRequest();
    expect(storedSwapRequest.fromAsset).to.equal(Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);
    expect(storedSwapRequest.toAsset).to.equal(Addresses.WETH_ADDRESS);

    // enzyme prices weETH through redstone which reverts on stale data after the governor time travel
    await refreshRedstoneFeed(Addresses.REDSTONE_MULTI_FEED_ADAPTER, 'weETH/ETH');

    const poolSharesBefore = await this.enzymeShares.balanceOf(this.pool);
    const poolEthBefore = await ethers.provider.getBalance(this.pool);
    const poolWethBefore = await this.weth.balanceOf(this.pool);
    const poolValueBefore = await this.pool.getPoolValueInEth();

    const tx = await this.swapOperator.connect(swapController).swapEnzymeVaultShareForAsset(fromAmount, toAmountMin);
    const receipt = await tx.wait();

    const swappedEvent = receipt.logs
      .filter(log => log.address === this.swapOperator.target)
      .map(log => this.swapOperator.interface.parseLog(log))
      .find(log => log?.name === 'Swapped');

    expect(swappedEvent.args.fromAsset).to.equal(Addresses.ENZYMEV4_VAULT_PROXY_ADDRESS);
    expect(swappedEvent.args.toAsset).to.equal(Addresses.ETH);
    expect(swappedEvent.args.fromAmount).to.equal(fromAmount);

    const ethReceived = swappedEvent.args.toAmount;
    expect(ethReceived).to.be.gte(toAmountMin);

    const poolSharesAfter = await this.enzymeShares.balanceOf(this.pool);
    const poolEthAfter = await ethers.provider.getBalance(this.pool);
    const poolValueAfter = await this.pool.getPoolValueInEth();

    // weth is unwrapped and the pool receives plain ETH
    expect(poolSharesAfter).to.equal(poolSharesBefore - fromAmount);
    expect(poolEthAfter).to.equal(poolEthBefore + ethReceived);
    expect(await this.weth.balanceOf(this.pool)).to.equal(poolWethBefore);

    // nothing left behind in the SwapOperator
    expect(await this.enzymeShares.balanceOf(this.swapOperator)).to.equal(0n);
    expect(await this.weth.balanceOf(this.swapOperator)).to.equal(0n);
    expect(await ethers.provider.getBalance(this.swapOperator)).to.equal(0n);

    // swap request consumed and pool swap state cleared
    expect((await this.swapOperator.swapRequest()).fromAsset).to.equal(ethers.ZeroAddress);
    expect((await this.pool.assetInSwapOperator()).amount).to.equal(0n);

    // pool value should stay within 1% of the swapped value
    const poolValueDiff =
      poolValueBefore > poolValueAfter ? poolValueBefore - poolValueAfter : poolValueAfter - poolValueBefore;
    expect(poolValueDiff).to.be.lte(sharesValueInEth / 100n);
  });

  it('Safe adds reUSDe to SafeTracker and reduces the offchain investment by 9M USDC', async function () {
    const reUsde = await ethers.getContractAt('ERC20Mock', Addresses.REUSDE_ADDRESS);
    const reUsdeNavOracle = await ethers.getContractAt('IReUSDeNavOracle', Addresses.REUSDE_NAV_ORACLE);
    const ethUsdAggregator = await ethers.getContractAt('IEthUsdAggregator', Addresses.CHAINLINK_ETH_USD);
    const safe = await this.safeTracker.safe();

    const reUsdeAggregator = await deployContract('AggregatorReUSDe', [reUsdeNavOracle, ethUsdAggregator]);

    const [, nav] = await reUsdeNavOracle.latestRoundData();
    const ethUsd = await ethUsdAggregator.latestAnswer();
    expect(await reUsdeAggregator.decimals()).to.equal(18n);
    expect(await reUsdeAggregator.latestAnswer()).to.equal((nav * parseUnits('1', 8)) / ethUsd);

    // simulate the safe moving 9M USD of the offchain investment into reUSDe
    const movedUsdc = parseUnits('9000000', 6);
    const reUsdeAmount = (parseEther('9000000') * parseEther('1')) / nav;
    await setNamespacedERC20Balance(reUsde.target, safe, reUsdeAmount);
    expect(await reUsde.balanceOf(safe)).to.equal(reUsdeAmount);

    // funding the signer changes the safe eth balance, so it has to happen before the balance snapshot
    const safeSigner = await getFundedSigner(safe);

    const safeEthBalanceBefore = await ethers.provider.getBalance(safe);
    const offchainInvestmentBefore = await this.safeTracker.offchainInvestmentUSDC();
    const totalSupplyBefore = await this.safeTracker.totalSupply();
    const poolValueBefore = await this.pool.getPoolValueInEth();
    const newOffchainInvestment = offchainInvestmentBefore - movedUsdc;

    await expect(this.safeTracker.connect(safeSigner).addAsset(reUsde, reUsdeAggregator))
      .to.emit(this.safeTracker, 'AssetAdded')
      .withArgs(reUsde.target, reUsdeAggregator.target);

    await expect(this.safeTracker.connect(safeSigner).updateOffchainInvestmentUSDC(newOffchainInvestment))
      .to.emit(this.safeTracker, 'OffchainInvestmentUSDCUpdated')
      .withArgs(newOffchainInvestment);

    // asset registration
    const assets = await this.safeTracker.getAssets();
    expect(assets.length).to.equal(3);
    expect(assets[2].assetAddress).to.equal(reUsde.target);
    expect(assets[2].isAbandoned).to.equal(false);
    expect(await this.safeTracker.getAssetId(reUsde.target)).to.equal(2n);

    const reUsdeOracle = await this.safeTracker.oracles(reUsde.target);
    expect(reUsdeOracle.aggregator).to.equal(reUsdeAggregator.target);
    expect(reUsdeOracle.assetDecimals).to.equal(18n);

    expect(await this.safeTracker.offchainInvestmentUSDC()).to.equal(newOffchainInvestment);

    // balance: the moved usdc value is replaced by the reUSDe value
    const reUsdeValueInEth = await this.safeTracker.getEthForAsset(reUsde.target, reUsdeAmount);
    const offchainValueBefore = await this.pool.getEthForAsset(Addresses.USDC_ADDRESS, offchainInvestmentBefore);
    const offchainValueAfter = await this.pool.getEthForAsset(Addresses.USDC_ADDRESS, newOffchainInvestment);
    // the impersonated safe pays gas in eth which is part of the safe balance
    const safeGasSpent = safeEthBalanceBefore - (await ethers.provider.getBalance(safe));
    const expectedTotalSupply =
      totalSupplyBefore - offchainValueBefore + offchainValueAfter + reUsdeValueInEth - safeGasSpent;

    const totalSupplyAfter = await this.safeTracker.totalSupply();
    expect(totalSupplyAfter).to.equal(expectedTotalSupply);
    expect(await this.safeTracker.balanceOf(this.pool)).to.equal(totalSupplyAfter);

    // pool value moves by exactly the safe tracker balance change
    const poolValueAfter = await this.pool.getPoolValueInEth();
    expect(poolValueAfter - poolValueBefore).to.equal(totalSupplyAfter - totalSupplyBefore);

    // 9M USD in reUSDe should be worth roughly the same as 9M USDC (within 1%)
    const movedUsdcValueInEth = offchainValueBefore - offchainValueAfter;
    const valueDiff =
      reUsdeValueInEth > movedUsdcValueInEth
        ? reUsdeValueInEth - movedUsdcValueInEth
        : movedUsdcValueInEth - reUsdeValueInEth;
    expect(valueDiff).to.be.lte(movedUsdcValueInEth / 100n);
  });

  require('./basic-functionality-tests');
});
