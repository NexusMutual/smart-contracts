const { ethers, config, network } = require('hardhat');
const { expect } = require('chai');
const { join } = require('node:path');

const evm = require('./evm')();
const { Address, EnzymeAdress, getSigner, submitGovernanceProposal } = require('./utils');
const { ContractCode, ProposalCategory } = require('../../lib/constants');

const addresses = require(join(config.paths.root, 'deployments/src/addresses.json'));

const TRANCHE_DURATION = 91 * 24 * 3600; // 91 days
const sum = arr => arr.reduce((a, b) => a.add(b), ethers.constants.Zero);

const { formatEther, formatUnits, parseEther, toUtf8Bytes } = ethers.utils;

describe('StakingPool rewards update', function () {
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

  it('initializes contract instances', async function () {
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.coverProducts = await ethers.getContractAt('CoverProducts', addresses.CoverProducts);
    this.pool = await ethers.getContractAt('Pool', addresses.Pool);
    this.safeTracker = await ethers.getContractAt('SafeTracker', addresses.SafeTracker);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.stakingProducts = await ethers.getContractAt('StakingProducts', addresses.StakingProducts);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', addresses.LegacyPooledStaking);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', addresses.YieldTokenIncidents);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.governance = await ethers.getContractAt('Governance', addresses.Governance);
    this.memberRoles = await ethers.getContractAt('MemberRoles', addresses.MemberRoles);

    // Token Mocks
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
    this.enzymeShares = await ethers.getContractAt('ERC20Mock', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
  });

  it('impersonates AB members', async function () {
    // set provider
    await evm.connect(ethers.provider);

    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];

    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('should upgrade staking pool contract', async function () {
    const newStakingPool = await ethers.deployContract('StakingPool', [
      addresses.StakingNFT,
      addresses.NXMToken,
      addresses.Cover,
      addresses.TokenController,
      addresses.NXMaster,
      addresses.StakingProducts,
    ]);
    await newStakingPool.deployed();

    const newCover = await ethers.deployContract('Cover', [
      addresses.CoverNFT,
      addresses.StakingNFT,
      addresses.StakingPoolFactory,
      newStakingPool.address,
    ]);
    await newCover.deployed();

    const codes = [toUtf8Bytes(ContractCode.Cover)];
    const contractAddresses = [newCover.address];

    await submitGovernanceProposal(
      ProposalCategory.upgradeMultipleContracts,
      ethers.utils.defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, contractAddresses]),
      this.abMembers,
      this.governance,
    );
  });

  it('should update rewards shares', async function () {
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const currentTrancheId = Math.floor(now / TRANCHE_DURATION);

    const tokenCount = (await this.stakingNFT.totalSupply()).toNumber();
    const tokenIds = new Array(tokenCount).fill('').map((_, i) => i + 1);

    const stakingPoolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    const stakingPoolIds = new Array(stakingPoolCount).fill('').map((_, i) => i + 1);

    console.log('Fetching tokens and deposits');
    const viewer = await ethers.getContractAt('StakingViewer', addresses.StakingViewer);
    const [, encodedTokensWithDeposits] = await viewer.callStatic.multicall([
      viewer.interface.encodeFunctionData('processExpirations', [stakingPoolIds]),
      viewer.interface.encodeFunctionData('getTokens', [tokenIds]),
    ]);

    const [tokensWithDeposits] = viewer.interface.decodeFunctionResult('getTokens', encodedTokensWithDeposits);

    // data[ pool_id ][ tranche_idx ] => [token ids]
    const data = stakingPoolIds.map(() => new Array(8).fill('').map(() => []));

    for (const tokenWithDeposits of tokensWithDeposits) {
      const tokenId = tokenWithDeposits.tokenId.toNumber();
      const poolId = tokenWithDeposits.poolId.toNumber();
      const poolIdx = poolId - 1;

      for (const deposit of tokenWithDeposits.deposits) {
        const trancheIdx = deposit.trancheId.toNumber() - currentTrancheId;

        if (trancheIdx < 0) {
          // skip expired tranches
          continue;
        }

        data[poolIdx][trancheIdx].push(tokenId);
      }
    }

    // const txData = this.cover.interface.encodeFunctionData('updateStakingPoolsRewardShares', [data]);
    // console.log('to:', addresses.Cover);
    // console.log('data: ', txData);

    await evm.impersonate(Address.SWAP_CONTROLLER);
    const swapController = await getSigner(Address.SWAP_CONTROLLER);

    const tx = await this.cover.connect(swapController).updateStakingPoolsRewardShares(data);
    const receipt = await tx.wait();

    console.log('Tx gas:', receipt.gasUsed.toString());
  });

  it('should check staking pool rewards shares', async function () {
    const now = (await ethers.provider.getBlock('latest')).timestamp;
    const currentTrancheId = Math.floor(now / TRANCHE_DURATION);

    const poolCount = (await this.stakingPoolFactory.stakingPoolCount()).toNumber();
    const poolIds = new Array(poolCount).fill('').map((_, i) => i + 1);

    for (const poolId of poolIds) {
      const poolAddress = await this.cover.stakingPool(poolId);
      const stakingPool = await ethers.getContractAt('StakingPool', poolAddress);
      const fee = await stakingPool.getPoolFee();
      const rewardShareSupply = await stakingPool.getRewardsSharesSupply();

      const managerRewardShares = [];
      const trancheRewardShares = [];

      const activeTrancheIds = new Array(8).fill('').map((_, i) => currentTrancheId + i);

      for (const activeTrancheId of activeTrancheIds) {
        const feeDeposit = await stakingPool.getDeposit(0, activeTrancheId);
        managerRewardShares.push(feeDeposit.rewardsShares);

        const { rewardsShares } = await stakingPool.getTranche(activeTrancheId);
        trancheRewardShares.push(rewardsShares);
      }

      const poolManagerRewardShares = sum(managerRewardShares);
      const poolTrancheRewardShares = sum(trancheRewardShares);

      console.log(`\nPool: ${poolId}`);
      console.log(`Manager Reward Shares: ${formatEther(poolManagerRewardShares)}`);
      console.log(`Tranche Reward Shares: ${formatEther(poolTrancheRewardShares)}`);
      console.log(`Reward Share Supply  : ${formatEther(rewardShareSupply)}`);
      expect(poolTrancheRewardShares).to.be.eq(rewardShareSupply);

      console.log(`Manager Reward Shares in tranches: ${managerRewardShares.map(formatEther).join(', ')}`);
      console.log(`Tranche Reward Shares in tranches: ${trancheRewardShares.map(formatEther).join(', ')}`);

      const actualFee = poolTrancheRewardShares.isZero()
        ? ethers.constants.Zero
        : poolManagerRewardShares.mul(10000).div(poolTrancheRewardShares);

      console.log(`Expected Fee: ${formatUnits(fee.mul(100), 2)}%`);
      console.log(`Actual Fee  : ${formatUnits(actualFee, 2)}%`);

      if (!poolTrancheRewardShares.isZero()) {
        expect(actualFee).to.be.within(fee.mul(100).sub(1), fee.mul(100));
      }
    }
  });

  require('./basic-functionality-tests');
});
