const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const {
  Address,
  EnzymeAdress,
  V2Addresses,
  calculateProxyAddress,
  enableAsEnzymeReceiver,
  formatInternalContracts,
  getSigner,
  submitGovernanceProposal,
} = require('./utils');
const { ContractTypes, ContractCode, ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const evm = require('./evm')();

const { BigNumber } = ethers;
const { formatEther, parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

/* ========== CONSTRUCTOR PARAMS ========== */

// Ramm
// TODO: SPOT_PRICE_B 20% below open market price at launch
// https://docs.google.com/document/d/1oRaAzPapBpNv0TmxC9XZjc24Qu0deJnzlQGEznBV1X0/edit#heading=h.ejqiszyf49b3
const SPOT_PRICE_B = parseEther('0.0152');
// TODO: SPOT_PRICE_A follow calculation
// https://docs.google.com/document/d/1oRaAzPapBpNv0TmxC9XZjc24Qu0deJnzlQGEznBV1X0/edit#heading=h.o7iygzkj2m9z
const SPOT_PRICE_A = parseEther('0.0347');

async function getCapitalSupplyAndBalances(pool, tokenController, nxm, memberAddress) {
  return {
    ethCapital: await pool.getPoolValueInEth(),
    nxmSupply: await tokenController.totalSupply(),
    ethBalance: await ethers.provider.getBalance(memberAddress),
    nxmBalance: await nxm.balanceOf(memberAddress),
  };
}

const assertionErrorMsg = (name, asset) => `AssertionError: values of ${name} in ${asset} don't match\n`;

describe('tokenomics', function () {
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
    this.master = await ethers.getContractAt('NXMaster', V2Addresses.NXMaster);
    this.mcr = await ethers.getContractAt('MCR', V2Addresses.MCR);
    this.nxm = await ethers.getContractAt('NXMToken', V2Addresses.NXMToken);
    this.coverNFT = await ethers.getContractAt('CoverNFT', V2Addresses.CoverNFT);
    this.poolBefore = await ethers.getContractAt('ILegacyPool', V2Addresses.Pool);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', V2Addresses.StakingNFT);
    this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
    this.stakingPool = await ethers.getContractAt('StakingPool', V2Addresses.StakingPoolImpl);
    this.swapOperator = await ethers.getContractAt('SwapOperator', V2Addresses.SwapOperator);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', V2Addresses.LegacyQuotationData);
    this.tokenController = await ethers.getContractAt('TokenController', V2Addresses.TokenController);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', V2Addresses.PriceFeedOracle);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', V2Addresses.LegacyClaimsReward);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
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

  it('add new RAMM (RA) contract', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // const rammAddress = '<ADDRESS>'; // TODO: grab from brute force address script
    // const ramm = await ethers.getContractAt('Ramm', rammAddress);
    this.ramm = await ethers.deployContract('Ramm', [SPOT_PRICE_A, SPOT_PRICE_B]);
    const rammCreate2Salt = 43535253462345; // TODO: brute force salt to generate nice address
    const rammTypeAndSalt = BigNumber.from(rammCreate2Salt).shl(8).add(ContractTypes.Proxy);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes(ContractCode.Ramm)], [this.ramm.address], [rammTypeAndSalt]],
      ),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('RAMM Contracts before:', formatInternalContracts(contractsBefore));
    console.info('RAMM Contracts after:', formatInternalContracts(contractsAfter));

    // Set this.ramm to the ramm proxy contract
    const rammProxyAddress = calculateProxyAddress(this.master.address, rammCreate2Salt);
    this.ramm = await ethers.getContractAt('Ramm', rammProxyAddress);

    const actualRammProxyAddress = await this.master.getLatestAddress(toUtf8Bytes('RA'));
    expect(actualRammProxyAddress).to.equal(rammProxyAddress);
  });

  it('Collect storage data before upgrade', async function () {
    this.contractData = {
      mcr: { before: {}, after: {} },
      pool: { before: {}, after: {} },
      gateway: { before: {}, after: {} },
      assessment: { before: {}, after: {} },
      stakingPool: { before: {}, after: {} },
      priceFeedOracle: { before: {}, after: {} },
      individualClaims: { before: {}, after: {} },
      yieldTokenIncidents: { before: {}, after: {} },
    };

    // MCR
    this.mcrValueBefore = await this.mcr.getMCR();
    this.contractData.mcr.before.maxMCRIncrement = await this.mcr.maxMCRIncrement();
    this.contractData.mcr.before.gearingFactor = await this.mcr.gearingFactor();
    this.contractData.mcr.before.mcr = await this.mcr.mcr();
    this.contractData.mcr.before.desiredMCR = await this.mcr.desiredMCR();
    this.contractData.mcr.before.lastUpdateTime = await this.mcr.lastUpdateTime();
    this.contractData.mcr.before.previousMCR = await this.mcr.previousMCR();

    // Pool
    this.contractData.pool.before.value = await this.poolBefore.getPoolValueInEth();
    this.contractData.pool.before.ethBalance = await ethers.provider.getBalance(this.poolBefore.address);
    this.contractData.pool.before.daiBalance = await this.dai.balanceOf(this.poolBefore.address);
    this.contractData.pool.before.stEthBalance = await this.stEth.balanceOf(this.poolBefore.address);
    this.contractData.pool.before.rEthBalance = await this.rEth.balanceOf(this.poolBefore.address);
    this.contractData.pool.before.enzymeSharesBalance = await this.enzymeShares.balanceOf(this.poolBefore.address);

    const assets = (await this.poolBefore.getAssets()).map(([address]) => address);
    const assetSwapDetails = await Promise.all(assets.map(address => this.poolBefore.getAssetSwapDetails(address)));
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
  });

  it('Upgrade existing contracts', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // LegacyGateway.sol
    this.gateway = await ethers.deployContract('LegacyGateway', [this.quotationData.address, this.nxm.address]);
    // this.gateway = await ethers.getContractAt('LegacyGateway', '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5');

    // MCR.sol
    this.mcr = await ethers.deployContract('MCR', [this.master.address]);
    // this.mcr = await getContractByContractCode('MCR', ContractCode.MCR);

    // Pool.sol
    this.pool = await ethers.deployContract('Pool', [
      this.master.address,
      this.priceFeedOracle.address,
      this.swapOperator.address,
      this.nxm.address,
      this.poolBefore.address,
    ]);
    // this.pool = await getContractByContractCode('Pool', ContractCode.Pool);
    await enableAsEnzymeReceiver(this.pool.address);

    // Cover.sol
    this.cover = await ethers.deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);
    // this.cover = await getContractByContractCode('Cover', ContractCode.Cover);

    // Assessment.sol
    this.assessment = await ethers.deployContract('Assessment', [this.nxm.address]);
    // this.assessment = await getContractByContractCode('Assessment', ContractCode.Assessment);

    // LegacyPooledStaking.sol
    this.pooledStaking = await ethers.deployContract('LegacyPooledStaking', [
      this.cover.address,
      this.productsV1.address,
      this.stakingNFT.address,
      this.nxm.address,
    ]);
    // this.pooledStaking = await getContractByContractCode('LegacyPooledStaking', ContractCode.PooledStaking);

    // TokenController.sol
    this.tokenController = await ethers.deployContract('TokenController', [
      this.quotationData.address,
      this.newClaimsReward.address,
      this.stakingPoolFactory.address,
      this.nxm.address,
    ]);
    // this.tokenController = await getContractByContractCode('TokenController', ContractCode.TokenController);

    // IndividualClaims.sol
    this.individualClaims = await ethers.deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);
    // this.individualClaims = await getContractByContractCode('IndividualClaims', ContractCode.IndividualClaims);

    // YieldTokenIncidents.sol
    this.yieldTokenIncidents = await ethers.deployContract('YieldTokenIncidents', [
      this.nxm.address,
      this.coverNFT.address,
    ]);
    // this.yieldTokenIncidents = await getContractByContractCode('YieldTokenIncidents', ContractCode.YieldTokenIncidents);

    const contractCodeAddressMapping = {
      [ContractCode.MCR]: this.mcr.address,
      [ContractCode.Pool]: this.pool.address,
      [ContractCode.Cover]: this.cover.address,
      [ContractCode.Gateway]: this.gateway.address,
      [ContractCode.Assessment]: this.assessment.address,
      [ContractCode.PooledStaking]: this.pooledStaking.address,
      [ContractCode.TokenController]: this.tokenController.address,
      [ContractCode.IndividualClaims]: this.individualClaims.address,
      [ContractCode.YieldTokenIncidents]: this.yieldTokenIncidents.address,
    };
    // NOTE: Do not manipulate the map between Object.keys and Object.values otherwise the ordering could go wrong
    const codes = Object.keys(contractCodeAddressMapping).map(code => toUtf8Bytes(code));
    const addresses = Object.values(contractCodeAddressMapping);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();

    console.info('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.info('Upgrade Contracts after:', formatInternalContracts(contractsAfter));

    // Set references to proxy contracts
    this.gateway = await ethers.getContractAt('LegacyGateway', V2Addresses.LegacyGateway);
    this.mcr = await ethers.getContractAt('MCR', V2Addresses.MCR);
    this.pool = await ethers.getContractAt('Pool', V2Addresses.Pool);
    this.cover = await ethers.getContractAt('Cover', V2Addresses.Cover);
    this.assessment = await ethers.getContractAt('Assessment', V2Addresses.Assessment);
    this.pooledStaking = await ethers.getContractAt('StakingPool', V2Addresses.StakingPoolImpl);
    this.tokenController = await ethers.getContractAt('TokenController', V2Addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', V2Addresses.IndividualClaims);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', V2Addresses.YieldTokenIncidents);
  });

  it('Set RAMM master and dependent contract addresses after contracts upgrade', async function () {
    await this.ramm.changeMasterAddress(this.master.address);
    await this.ramm.changeDependentContractAddress();
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

    // ~1 wei discrepancy is acceptable
    expect(poolValueDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(ethBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(daiBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(stEthBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(rEthBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));
    expect(enzymeSharesBalanceDiff.abs()).to.be.lessThanOrEqual(parseEther('1'));

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
      oldPoolValueAfter: await this.poolBefore.getPoolValueInEth(),
      oldPoolEthBalanceAfter: await ethers.provider.getBalance(this.poolBefore.address),
      oldPoolDaiBalanceAfter: await this.dai.balanceOf(this.poolBefore.address),
      oldPoolStEthBalanceAfter: await this.stEth.balanceOf(this.poolBefore.address),
      oldPoolREthBalanceAfter: await this.rEth.balanceOf(this.poolBefore.address),
      oldPoolEnzymeSharesBalanceAfter: await this.enzymeShares.balanceOf(this.poolBefore.address),
    });
  });

  it('MCR value check', async function () {
    const mcrValueAfter = await this.mcr.getMCR();
    expect(mcrValueAfter).to.be.equal(this.mcrValueBefore);
  });

  it('Compares storage of upgraded MCR contract', async function () {
    this.contractData.mcr.after.maxMCRIncrement = await this.mcr.maxMCRIncrement();
    this.contractData.mcr.after.gearingFactor = await this.mcr.gearingFactor();
    this.contractData.mcr.after.minUpdateTime = await this.mcr.minUpdateTime();
    this.contractData.mcr.after.mcr = await this.mcr.mcr();
    this.contractData.mcr.after.desiredMCR = await this.mcr.desiredMCR();
    this.contractData.mcr.after.lastUpdateTime = await this.mcr.lastUpdateTime();
    this.contractData.mcr.after.previousMCR = await this.mcr.previousMCR();

    Object.entries(this.contractData.mcr.before).forEach(([key, value]) => {
      expect(this.contractData.mcr.after[key], `AssertionError: values of ${key} don't match\n`).to.be.equal(value);
    });
  });

  it('Compares storage of upgraded Pool contract', async function () {
    const { assets: beforeAssets, minPoolEth: beforeMinPoolEth } = this.contractData.pool.before;
    const afterAssetsDataArray = await Promise.all(beforeAssets.map(address => this.pool.swapDetails(address)));
    const afterAssetsData = beforeAssets.reduce((acc, asset, i) => ({ ...acc, [asset]: afterAssetsDataArray[i] }), {});
    const afterMinPoolEth = await this.swapOperator.minPoolEth();

    expect(afterMinPoolEth, "AssertionError: values of minPoolEth don't match\n").to.be.equal(beforeMinPoolEth);

    Object.entries(this.contractData.pool.before.assetSwapDetails).forEach(([asset, before]) => {
      const { minAmount, maxAmount, lastSwapTime, maxSlippageRatio } = afterAssetsData[asset];
      expect(lastSwapTime, assertionErrorMsg('lastSwapTime', asset)).to.be.oneOf([before.lastSwapTime, 0]);
      expect(minAmount, assertionErrorMsg('minAmount', asset)).to.be.equal(before.minAmount);
      expect(maxAmount, assertionErrorMsg('maxAmount', asset)).to.be.equal(before.maxAmount);
      expect(maxSlippageRatio, assertionErrorMsg('maxSlippageRatio', asset)).to.be.equal(before.maxSlippageRatio);
    });
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

  it('Compares storage of upgrade Assessment contract', async function () {
    // TODO:
    // stakeOf (address => Stake)
    // votesOf (address => Vote[])
    // hasAlreadyVotedOn (address => mapping(uint => bool))
    // assessments (Assessment[])
  });

  // IndividualClaims.sol
  it('Compares storage of upgrade IndividualClaims contract', async function () {
    // TODO:
    // lastClaimSubmissionOnCover (uint => ClaimSubmission)
    // claims (Claim[])
  });

  it('Compares storage of upgrade YieldTokenIncidents contract', async function () {
    // TODO:
    // incidents (Incident[])
  });

  // TokenController.sol
  it.skip('Compares storage of upgrade TokenController contract', async function () {
    // TODO:
    // coverInfo (coverId => CoverInfo)
    // stakingPoolNXMBalances (pool id => { rewards, deposits })
  });

  // Cover.sol
  it.skip('Compares storage of upgrade Cover contract', async function () {
    // TODO:
    // coverSegmentAllocations (cover id => segment id => pool allocations[])
    // allowedPools (product id => allowed pool ids)
    // activeCover (assetId => { lastBucketUpdateId, totalActiveCoverInAsset })
    // productNames (productId => product name)
    // productTypeNames (productTypeId => productType name)
  });

  it('Compares storage of upgrade LegacyGateway contract', async function () {
    this.contractData.gateway.after._unused_nxmToken = await this.gateway._unused_nxmToken();
    this.contractData.gateway.after._unused_tokenController = await this.gateway._unused_tokenController();
    this.contractData.gateway.after._unused_quotationData = await this.gateway._unused_quotationData();
    this.contractData.gateway.after._unused_claimsData = await this.gateway._unused_claimsData();
    this.contractData.gateway.after._unused_claims = await this.gateway._unused_claims();
    this.contractData.gateway.after._unused_pool = await this.gateway._unused_pool();
    this.contractData.gateway.after._unused_memberRoles = await this.gateway._unused_memberRoles();
    this.contractData.gateway.after.DAI = await this.gateway.DAI();
    this.contractData.gateway.after._unused_incidents = await this.gateway._unused_incidents();
    this.contractData.gateway.after._unused_coverMigrator = await this.gateway._unused_coverMigrator();

    Object.entries(this.contractData.gateway.before).forEach(([key, value]) => {
      expect(this.contractData.gateway.after[key], `AssertionError: values of ${key} don't match\n`).to.be.equal(value);
    });
  });

  it.skip('Swap NXM for ETH', async function () {
    const [member] = this.abMembers;
    const nxmIn = parseEther('1');
    const minEthOut = parseEther('0.0152');

    const before = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);
    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await evm.setNextBlockBaseFee(0);
    await this.ramm.connect(member).swap(nxmIn, minEthOut, deadline, { maxPriorityFeePerGas: 0 });

    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);
    const ethReceived = after.ethBalance.sub(before.ethBalance);
    const nxmSwappedForEthFilter = this.ramm.filters.NxmSwappedForEth(member.address);
    const nxmSwappedForEthEvents = await this.ramm.queryFilter(nxmSwappedForEthFilter, -1);
    const ethOut = nxmSwappedForEthEvents[0]?.args?.ethOut;

    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn)); // member sends NXM
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn)); // nxmIn is burned
    expect(after.ethCapital).to.be.equal(before.ethCapital.sub(ethReceived)); // ETH goes out of capital pool
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethOut)); // member receives ETH
  });

  it('Swap ETH for NXM', async function () {
    const [member] = this.abMembers;
    const ethIn = parseEther('1');
    const minNxmOut = parseEther('28.8');

    const before = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);
    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    await evm.setNextBlockBaseFee(0);
    await this.ramm.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });

    const after = await getCapitalSupplyAndBalances(this.pool, this.tokenController, this.nxm, member._address);
    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const nxmTransferFilter = this.nxm.filters.Transfer(ethers.constants.AddressZero, member._address);
    const nxmTransferEvents = await this.nxm.queryFilter(nxmTransferFilter, -1);
    const nxmOut = nxmTransferEvents[0]?.args?.value;

    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn)); // member sends ETH
    expect(after.ethCapital).to.be.equal(before.ethCapital.add(ethIn)); // ethIn goes into capital pool
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived)); // nxmOut is minted
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmOut)); // member receives NXM
  });
});
