const { ethers, network } = require('hardhat');
const { expect } = require('chai');

const { Address, EnzymeAdress, V2Addresses, submitGovernanceProposal, getSigner } = require('./utils');
const { ProposalCategory: PROPOSAL_CATEGORIES, ContractTypes, ContractCode } = require('../../lib/constants');
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

// TODO: grab from utils
const formatInternalContracts = ({ _contractAddresses, _contractCodes }) => {
  return _contractCodes.map((code, i) => {
    const index = `${i}`.padStart(2, '0');
    return `[${index}] ${Buffer.from(code.slice(2), 'hex')} -> ${_contractAddresses[i]}`;
  });
};

describe('tokenomics', function () {
  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master || (await ethers.getContractAt('NXMaster', V2Addresses.NXMaster));
    const contractAddress = await this.master.getLatestAddress(toUtf8Bytes(contractCode));
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
        console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.log('Snapshot ID: ', await evm.snapshot());
      }
    }
  });

  it('load contracts', async function () {
    // TODO: move to utils
    // Current version - should be updated whenever a proxy is upgraded to a new address
    this.master = await ethers.getContractAt('NXMaster', V2Addresses.NXMaster);
    this.poolBefore = await ethers.getContractAt('Pool', V2Addresses.Pool);
    this.coverNFT = await ethers.getContractAt('CoverNFT', V2Addresses.CoverNFT);
    this.nxm = await ethers.getContractAt('NXMToken', V2Addresses.NXMToken);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', V2Addresses.StakingNFT);
    this.stakingPool = await ethers.getContractAt('StakingPool', V2Addresses.StakingPool);
    this.swapOperator = await ethers.getContractAt('SwapOperator', V2Addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', V2Addresses.PriceFeedOracle);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', V2Addresses.LegacyQuotationData);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', V2Addresses.LegacyClaimsReward);
    this.mcr = await ethers.getContractAt('MCR', V2Addresses.MCR);

    // TODO: failing master.getLatestAddress
    // console.log('GOV master.getLatestAddress: ', await this.master.getLatestAddress(toUtf8Bytes('GV')));

    this.governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    // this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    console.log('governance done', this.governance.address);
    this.memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    // this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);
    console.log('memberRoles done', this.memberRoles.address);

    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);

    // before values
    // TODO: fix failing getMCR
    // this.mcrValueBefore = await this.mcr.getMCR();
  });

  it('Impersonate AB members', async function () {
    // TODO: fix failing memberRoles.members(1)
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    console.log('abMembers', abMembers);
    this.abMembers = [];
    for (const address of abMembers) {
      console.log('processing ', address);
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  // TODO:
  // new contract - LegacyPool.sol
  it('add new RAMM (RA) contract', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    const ramm = await ethers.deployContract('Ramm', [SPOT_PRICE_A, SPOT_PRICE_B]);

    // const rammAddress = '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D122'; // TODO: fix me
    // const ramm = await ethers.getContractAt('Ramm', rammAddress);
    // const rammCreate2Salt = 43535253462345; // hardcoded random salt

    const rammTypeAndSalt = BigNumber.from(0).shl(8).add(ContractTypes.Proxy);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes(ContractCode.Ramm)], [ramm.address], [rammTypeAndSalt]],
      ),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();
    console.log('RAMM Contracts before:', formatInternalContracts(contractsBefore));
    console.log('RAMM Contracts after:', formatInternalContracts(contractsAfter));
    // expect Ramm to be added to after
  });

  it('Collect storage data before upgrade', async function () {
    // MCR
    this.contractData.mcr.before.maxMCRIncrement = await this.mcr.maxMCRIncrement();
    this.contractData.mcr.before.gearingFactor = await this.mcr.gearingFactor();
    this.contractData.mcr.before.mcr = await this.mcr.mcr();
    this.contractData.mcr.before.desiredMCR = await this.mcr.desiredMCR();
    this.contractData.mcr.before.lastUpdateTime = await this.mcr.lastUpdateTime();
    this.contractData.mcr.before.previousMCR = await this.mcr.previousMCR();

    // POOL
    const assets = await this.pool.getAssets();
    const assetsData = await Promise.all(assets.map(address => this.pool.assetData(address)));
    this.contractData.pool.before.assetsData = assets.reduce((acc, asset, i) => {
      return { ...acc, [asset]: assetsData[i] };
    }, {});
    this.contractData.pool.before.minPoolEth = await this.swapOperator.minPoolEth();
    this.contractData.pool.before.assets = assets;

    // PRICE FEED
    const assetsEthRate = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetToEthRate(address)));
    const getAssetForEth = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetForEth(address, 10)));

    this.contractData.priceFeedOracle.before.assetsEthRate = assets.reduce((acc, asset, i) => {
      acc[asset] = assetsEthRate[i];
      return acc;
    }, {});
    this.contractData.priceFeedOracle.before.assetsForEth = assets.reduce((acc, asset, i) => {
      acc[asset] = getAssetForEth[i];
      return acc;
    }, {});
  });

  it('upgrade existing contracts', async function () {
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
      V2Addresses.PriceFeedOracle, // this.priceFeedOracle.address, // VV2Addresses.PriceFeedOracle
      this.swapOperator.address, // V2Addresses.SwapOperator
      this.nxm.address, // V2Addresses.NXMToken
      this.previousPool.address, // V2Addresses.Pool
    ]);
    // this.pool = await getContractByContractCode('Pool', ContractCode.Pool);

    // Cover.sol
    this.cover = await ethers.deployContract('Cover', [
      this.coverNFT.address, // V2Addresses.CoverNFT
      this.stakingNFT.address, // V2Addresses.StakingNFT
      this.stakingPoolFactory.address, // V2Addresses.StakingPoolFactory
      this.stakingPool.address, // V2Addresses.StakingPool
    ]);
    // this.cover = await getContractByContractCode('Cover', ContractCode.Cover);

    // Assessment.sol
    this.assessment = await ethers.deployContract('Assessment', [this.nxm.address]);
    // this.assessment = await getContractByContractCode('Assessment', ContractCode.Assessment);

    // LegacyPooledStaking.sol
    this.pooledStaking = await ethers.deployContract('LegacyPooledStaking', [
      this.cover.address,
      this.productsV1.address, // V2Addresses.ProductsV1
      this.stakingNFT.address, // V2Addresses.StakingNFT
      this.nxm.address, // V2Addresses.NXMToken
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
    // NOTE: Do not manipulate the map between Object.keys and Object.values otherwise the ordering could be wrong
    const codes = Object.keys(contractCodeAddressMapping).map(code => toUtf8Bytes(code));
    const addresses = Object.values(contractCodeAddressMapping);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();
    console.log('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.log('Upgrade Contracts after:', formatInternalContracts(contractsAfter));
  });

  it('Pool value check', async function () {
    // before pool values
    const poolValueBefore = await this.poolBefore.getPoolValueInEth();
    const ethBalanceBefore = await ethers.provider.getBalance(this.poolBefore.address);
    const daiBalanceBefore = await this.dai.balanceOf(this.poolBefore.address);
    const stEthBalanceBefore = await this.stEth.balanceOf(this.poolBefore.address);
    const enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.poolBefore.address);

    // after pool values
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const daiBalanceAfter = await this.dai.balanceOf(this.pool.address);
    const stEthBalanceAfter = await this.stEth.balanceOf(this.pool.address);
    const enzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.address);

    console.log({
      poolValueBefore: formatEther(poolValueBefore),
      poolValueAfter: formatEther(poolValueAfter),
      poolValueDiff: formatEther(poolValueAfter.sub(poolValueBefore)),
      ethBalanceBefore: formatEther(ethBalanceBefore),
      ethBalanceAfter: formatEther(ethBalanceAfter),
      ethBalanceDiff: formatEther(ethBalanceAfter.sub(ethBalanceBefore)),
      daiBalanceBefore: formatEther(daiBalanceBefore),
      daiBalanceAfter: formatEther(daiBalanceAfter),
      daiBalanceDiff: formatEther(daiBalanceAfter.sub(daiBalanceBefore)),
      stEthBalanceBefore: formatEther(stEthBalanceBefore),
      stEthBalanceAfter: formatEther(stEthBalanceAfter),
      stEthBalanceDiff: formatEther(stEthBalanceAfter.sub(stEthBalanceBefore)),
      enzymeSharesBalanceBefore: formatEther(enzymeSharesBalanceBefore),
      enzymeSharesBalanceAfter: formatEther(enzymeSharesBalanceAfter),
      enzymeSharesBalanceDiff: formatEther(enzymeSharesBalanceAfter.sub(enzymeSharesBalanceBefore)),
    });

    expect(poolValueAfter).to.be.equal(poolValueBefore);
    expect(stEthBalanceAfter).to.be.equal(stEthBalanceBefore);
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore);
    expect(daiBalanceAfter).to.be.equal(daiBalanceBefore);
    expect(enzymeSharesBalanceAfter).to.be.equal(enzymeSharesBalanceBefore);
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
    const { assets: beforeAssets, assetsData: beforeAssetsData } = this.contractData.pool.before;
    const assetsDataArray = await Promise.all(beforeAssets.map(address => this.pool.swapDetails(address)));
    const afterAssetsData = beforeAssets.reduce((acc, asset, i) => ({ ...acc, [asset]: assetsDataArray[i] }), {});
    const afterMinPoolEth = await this.swapOperator.minPoolEth();
    expect(afterMinPoolEth, "AssertionError: values of minPoolEth don't match\n").to.be.equal(
      this.contractData.pool.before.minPoolEth,
    );

    const DENOMINATOR_DIFFERENCE = Math.pow(10, 14);
    Object.entries(beforeAssetsData).forEach(([asset, before]) => {
      const { minAmount, maxAmount, lastSwapTime, maxSlippageRatio } = afterAssetsData[asset];
      expect(minAmount, `AssertionError: values of minAmount in ${asset} don't match\n`).to.be.equal(before.minAmount);
      expect(maxAmount, `AssertionError: values of maxAmount in ${asset} don't match\n`).to.be.equal(before.maxAmount);
      expect(lastSwapTime, `AssertionError: values of lastSwapTime in ${asset} don't match\n`).to.be.oneOf([
        before.lastSwapTime,
        0,
      ]);
      expect(maxSlippageRatio, `AssertionError: values of maxSlippageRatio in ${asset} don't match\n`).to.be.equal(
        before.maxSlippageRatio.div(DENOMINATOR_DIFFERENCE),
      );
    });
  });

  it('Compares storage of upgraded PriceFeedOracle contract', async function () {
    // PRICE FEED
    const assetsEthRate = await Promise.all(
      this.contractData.pool.before.assets.map(address => this.priceFeedOracle.getAssetToEthRate(address)),
    );
    const getAssetForEth = await Promise.all(
      this.contractData.pool.before.assets.map(address => this.priceFeedOracle.getAssetForEth(address, 10)),
    );

    this.contractData.priceFeedOracle.after.assetsEthRate = this.contractData.pool.before.assets.reduce(
      (acc, asset, i) => ({ ...acc, [asset]: assetsEthRate[i] }),
      {},
    );
    this.contractData.priceFeedOracle.after.assetsForEth = this.contractData.pool.before.assets.reduce(
      (acc, asset, i) => ({ ...acc, [asset]: getAssetForEth[i] }),
      {},
    );

    Object.entries(this.contractData.priceFeedOracle.before.assetsEthRate).forEach(([asset, value]) => {
      expect(
        this.contractData.priceFeedOracle.after.assetsEthRate[asset],
        `AssertionError: values of assetsEthRate in ${asset} don't match\n`,
      ).to.be.equal(value);
    });

    Object.entries(this.contractData.priceFeedOracle.before.assetsForEth).forEach(([asset, value]) => {
      expect(
        this.contractData.priceFeedOracle.after.assetsForEth[asset],
        `AssertionError: values of assetsEthRate in ${asset} don't match\n`,
      ).to.be.equal(value);
    });
  });

  it('Compares storage of upgrade Cover contract', async function () {
    // TODO:
  });
});
