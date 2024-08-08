const { Sema } = require('async-sema');
const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { addresses } = require('@nexusmutual/deployments');

const { Address, EnzymeAdress, formatInternalContracts, getSigner, submitGovernanceProposal } = require('./utils');
const { ContractCode, ProposalCategory: PROPOSAL_CATEGORIES, Role } = require('../../lib/constants');
const evm = require('./evm')();

const { defaultAbiCoder, parseEther, toUtf8Bytes } = ethers.utils;

describe('withdrawNXM', function () {
  async function getContractByContractCode(contractName, contractCode) {
    this.master = this.master ?? (await ethers.getContractAt('NXMaster', addresses.NXMaster));
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
    // TODO: remove unused ones
    this.stakingProducts = await ethers.getContractAt('StakingProducts', addresses.StakingProducts);
    this.cover = await ethers.getContractAt('Cover', addresses.Cover);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', addresses.StakingPoolFactory);
    this.stakingViewer = await ethers.getContractAt('StakingViewer', addresses.StakingViewer);
    this.mcr = await ethers.getContractAt('MCR', addresses.MCR);
    this.nxm = await ethers.getContractAt('NXMToken', addresses.NXMToken);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
    this.coverNFT = await ethers.getContractAt('CoverNFT', addresses.CoverNFT);
    this.pool = await ethers.getContractAt('ILegacyPool', addresses.Pool);
    this.ramm = await ethers.getContractAt('Ramm', addresses.Ramm);
    this.assessment = await ethers.getContractAt('Assessment', addresses.Assessment);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', addresses.StakingNFT);
    this.swapOperator = await ethers.getContractAt('SwapOperator', addresses.SwapOperator);
    this.priceFeedOracle = await ethers.getContractAt('PriceFeedOracle', addresses.PriceFeedOracle);
    this.tokenController = await ethers.getContractAt('TokenController', addresses.TokenController);
    this.individualClaims = await ethers.getContractAt('IndividualClaims', addresses.IndividualClaims);
    this.quotationData = await ethers.getContractAt('LegacyQuotationData', addresses.LegacyQuotationData);
    this.newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', addresses.LegacyClaimsReward);
    this.proposalCategory = await ethers.getContractAt('ProposalCategory', addresses.ProposalCategory);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', addresses.YieldTokenIncidents);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', addresses.LegacyPooledStaking);
    this.nexusViewer = await ethers.getContractAt('NexusViewer', addresses.NexusViewer);
    this.coverProducts = await ethers.getContractAt('CoverProducts', addresses.CoverProducts);

    this.governance = await getContractByContractCode('Governance', ContractCode.Governance);
    this.memberRoles = await getContractByContractCode('MemberRoles', ContractCode.MemberRoles);

    // Token Mocks
    this.dai = await ethers.getContractAt('ERC20Mock', Address.DAI_ADDRESS);
    this.rEth = await ethers.getContractAt('ERC20Mock', Address.RETH_ADDRESS);
    this.stEth = await ethers.getContractAt('ERC20Mock', Address.STETH_ADDRESS);
    this.usdc = await ethers.getContractAt('ERC20Mock', Address.USDC_ADDRESS);
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

  it.skip('Collect storage data before upgrade', async function () {
    this.contractData = {
      assessment: { before: {}, after: {} },
      tokenController: { before: {}, after: {} },
      memberRoles: {}, // cache member addresses
    };

    const [
      assessmentCount,
      membersCount,
      coverCount,
      stakingPoolCount,
      assessmentNxm,
      assessmentConfig,
      tokenControllerToken,
      tokenControllerQuotationData,
      tokenControllerClaimsReward,
      tokenControllerStakingPoolFactory,
    ] = await Promise.all([
      this.assessment.getAssessmentsCount(),
      this.memberRoles.membersLength(Role.Member),
      // Promise.resolve(20), // members
      this.cover.coverDataCount(),
      // Promise.resolve(100), // covers
      this.stakingPoolFactory.stakingPoolCount(),
      this.assessment.nxm(),
      this.assessment.config(),
      this.tokenController.token(),
      this.tokenController.quotationData(),
      this.tokenController.claimsReward(),
      this.tokenController.stakingPoolFactory(),
    ]);

    // Assessment
    this.contractData.assessment.before.nxm = assessmentNxm;
    this.contractData.assessment.before.config = assessmentConfig;
    this.contractData.assessment.before.member = {};
    this.contractData.memberRoles.members = [];
    this.contractData.assessment.before.assessmentCount = assessmentCount;

    const assessmentPromises = Array.from({ length: assessmentCount }, (_, id) => this.assessment.assessments(id));

    // TokenController
    this.contractData.tokenController.before.token = tokenControllerToken;
    this.contractData.tokenController.before.quotationData = tokenControllerQuotationData;
    this.contractData.tokenController.before.claimsReward = tokenControllerClaimsReward;
    this.contractData.tokenController.before.stakingPoolFactory = tokenControllerStakingPoolFactory;

    this.contractData.tokenController.before.covers = [];
    this.contractData.tokenController.before.managers = [];
    this.contractData.tokenController.before.stakingPool = {};
    this.contractData.tokenController.before.managerStakingPools = {};
    this.contractData.tokenController.before.member = {};

    const coverSemaphore = new Sema(35, { capacity: coverCount });
    const coverPromises = Array.from({ length: coverCount }, (_, i) => {
      return coverSemaphore
        .acquire()
        .then(() => this.tokenController.coverInfo(i))
        .then(coverInfo => {
          process.stdout.write(`\r[BEFORE] cover ${i} of ${coverCount}`);
          coverSemaphore.release();
          return coverInfo;
        });
    });

    const stakingPoolPromises = Array.from({ length: stakingPoolCount }, async (_, i) => {
      const poolId = i + 1;
      return Promise.all([
        this.tokenController.stakingPoolNXMBalances(poolId),
        this.tokenController.getStakingPoolManager(poolId),
        this.tokenController.getStakingPoolOwnershipOffer(poolId),
      ]).then(([stakingPoolNXMBalances, manager, ownershipOffer]) => {
        this.contractData.tokenController.before.stakingPool[poolId] = {
          stakingPoolNXMBalances,
          manager,
          ownershipOffer,
        };
      });
    });

    const managerPromises = this.contractData.tokenController.before.managers.map(async manager => {
      const stakingPools = await this.tokenController.getManagerStakingPools(manager);
      this.contractData.tokenController.before.managerStakingPools[manager] = stakingPools;
    });

    const [covers, assessments] = await Promise.all([
      Promise.all(coverPromises),
      Promise.all(assessmentPromises),
      Promise.all(managerPromises),
      Promise.all(stakingPoolPromises),
    ]);

    this.contractData.tokenController.before.covers = covers;
    this.contractData.assessment.before.assessments = assessments;

    // Process max 6 members at a time due to tenderly rate limits (could be possibly higher in main-net)
    const membersSemaphore = new Sema(6, { capacity: membersCount });

    const processMember = async i => {
      process.stdout.write(`\r[BEFORE] member ${i} of ${membersCount}`);
      const [member] = await this.memberRoles.memberAtIndex(Role.Member, i);

      this.contractData.assessment.before.member[member] = { hasAlreadyVotedOn: {}, votes: [] };
      this.contractData.tokenController.before.member[member] = { tokensLocked: {} };

      const [
        stake,
        rewards,
        voteCount,
        lockReasons,
        totalBalanceOf,
        getPendingRewards,
        isStakingPoolManager,
        totalBalanceOfWithoutDelegations,
      ] = await Promise.all([
        this.assessment.stakeOf(member),
        this.assessment.getRewards(member),
        this.assessment.getVoteCountOfAssessor(member),
        this.tokenController.getLockReasons(member),
        this.tokenController.totalBalanceOf(member),
        this.tokenController.getPendingRewards(member),
        this.tokenController.isStakingPoolManager(member),
        this.tokenController.totalBalanceOfWithoutDelegations(member),
      ]);

      const votesPromises = Array.from({ length: voteCount }, (_, i) => this.assessment.votesOf(member, i));
      const hasAlreadyVotedPromises = Array.from({ length: assessmentCount }, (_, id) => {
        return this.assessment.hasAlreadyVotedOn(member, id).then(hasAlreadyVotedResult => {
          this.contractData.assessment.before.member[member].hasAlreadyVotedOn[id] = hasAlreadyVotedResult;
        });
      });
      const lockReasonsPromises = lockReasons.map(lockReason => {
        return this.tokenController.tokensLocked(member, lockReason).then(amountLocked => {
          this.contractData.tokenController.before.member[member].tokensLocked[lockReason] = amountLocked;
        });
      });

      const [votes] = await Promise.all([
        Promise.all(votesPromises),
        Promise.all(hasAlreadyVotedPromises),
        Promise.all(lockReasonsPromises),
      ]);

      // Set assessment data
      this.contractData.assessment.before.member[member].stake = stake;
      this.contractData.assessment.before.member[member].rewards = rewards;
      this.contractData.assessment.before.member[member].votes = votes;

      // Set token controller data
      this.contractData.tokenController.before.member[member].lockReasons = lockReasons;
      this.contractData.tokenController.before.member[member].totalBalanceOf = totalBalanceOf;
      this.contractData.tokenController.before.member[member].getPendingRewards = getPendingRewards;
      this.contractData.tokenController.before.member[member].isStakingPoolManager = isStakingPoolManager;
      this.contractData.tokenController.before.member[member].totalBalanceOfWithoutDelegations =
        totalBalanceOfWithoutDelegations;

      membersSemaphore.release();

      return member;
    };

    const memberPromises = Array.from({ length: membersCount }, (_, i) =>
      membersSemaphore.acquire().then(() => processMember(i)),
    );

    this.contractData.memberRoles.members = await Promise.all(memberPromises);
  });

  it('Upgrade contracts', async function () {
    const contractsBeforePromise = this.master.getInternalContracts();

    const assessmentPromise = ethers.deployContract('Assessment', [this.nxm.address]);

    const tokenControllerPromise = ethers.deployContract('TokenController', [
      this.quotationData.address,
      this.newClaimsReward.address,
      this.stakingPoolFactory.address,
      this.nxm.address,
      this.stakingNFT.address,
    ]);

    const [contractsBefore, assessment, tokenController] = await Promise.all([
      contractsBeforePromise,
      assessmentPromise,
      tokenControllerPromise,
    ]);

    const contractCodeAddressMapping = {
      [ContractCode.Assessment]: assessment.address,
      [ContractCode.TokenController]: tokenController.address,
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

    this.assessment = await getContractByContractCode('Assessment', ContractCode.Assessment);
    this.tokenController = await getContractByContractCode('TokenController', ContractCode.TokenController);

    console.info('Upgrade Contracts before:', formatInternalContracts(contractsBefore));
    console.info('Upgrade Contracts after:', formatInternalContracts(contractsAfter));
  });

  it.skip('Compares storage of upgraded Assessment contracts', async function () {
    const [assessmentCount, nxm, config] = await Promise.all([
      this.assessment.getAssessmentsCount(),
      this.assessment.nxm(),
      this.assessment.config(),
    ]);

    const assessmentBefore = this.contractData.assessment.before;
    expect(assessmentCount).to.equal(assessmentBefore.assessmentCount);
    expect(nxm).to.equal(assessmentBefore.nxm);
    expect(config).to.deep.equal(assessmentBefore.config);

    this.contractData.assessment.after.member = {};

    const assessmentPromises = Array.from({ length: assessmentCount }, (_, id) => this.assessment.assessments(id));
    const assessments = await Promise.all(assessmentPromises);
    expect(assessments).to.deep.equal(this.contractData.assessment.before.assessments);
  });

  it.skip('Compares storage of upgraded TokenController contract', async function () {
    const [coverCount, stakingPoolCount, token, quotationData, claimsReward, stakingPoolFactory, stakingNFT] =
      await Promise.all([
        this.cover.coverDataCount(),
        // Promise.resolve(100), // covers
        this.stakingPoolFactory.stakingPoolCount(),
        this.tokenController.token(),
        this.tokenController.quotationData(),
        this.tokenController.claimsReward(),
        this.tokenController.stakingPoolFactory(),
        this.tokenController.stakingNFT(),
      ]);

    // TokenController
    const tokenControllerBefore = this.contractData.tokenController.before;
    expect(token).to.equal(tokenControllerBefore.token);
    expect(quotationData).to.equal(tokenControllerBefore.quotationData);
    expect(claimsReward).to.equal(tokenControllerBefore.claimsReward);
    expect(stakingPoolFactory).to.equal(tokenControllerBefore.stakingPoolFactory);
    expect(stakingNFT).to.equal(this.stakingNFT.address);

    this.contractData.tokenController.after.covers = [];
    this.contractData.tokenController.after.managers = [];
    this.contractData.tokenController.after.stakingPool = {};
    this.contractData.tokenController.after.managerStakingPools = {};

    const coverSemaphore = new Sema(35, { capacity: coverCount });
    const coverPromises = Array.from({ length: coverCount }, (_, i) => {
      return coverSemaphore
        .acquire()
        .then(() => this.tokenController.coverInfo(i))
        .then(coverInfo => {
          process.stdout.write(`\r[AFTER] cover ${i} of ${coverCount}`);
          coverSemaphore.release();
          return coverInfo;
        });
    });

    const stakingPoolPromises = Array.from({ length: stakingPoolCount }, async (_, i) => {
      const poolId = i + 1;
      return Promise.all([
        this.tokenController.stakingPoolNXMBalances(poolId),
        this.tokenController.getStakingPoolManager(poolId),
        this.tokenController.getStakingPoolOwnershipOffer(poolId),
      ]).then(([stakingPoolNXMBalances, manager, ownershipOffer]) => {
        expect(stakingPoolNXMBalances).to.deep.equal(tokenControllerBefore.stakingPool[poolId].stakingPoolNXMBalances);
        expect(manager).to.deep.equal(tokenControllerBefore.stakingPool[poolId].manager);
        expect(ownershipOffer).to.deep.equal(tokenControllerBefore.stakingPool[poolId].ownershipOffer);
      });
    });

    const managerPromises = this.contractData.tokenController.after.managers.map(async manager => {
      const stakingPools = await this.tokenController.getManagerStakingPools(manager);
      expect(stakingPools).to.deep.equal(this.contractData.tokenController.before.managerStakingPools[manager]);
    });

    const [covers] = await Promise.all([
      Promise.all(coverPromises),
      Promise.all(managerPromises),
      Promise.all(stakingPoolPromises),
    ]);
    expect(covers).to.deep.equal(tokenControllerBefore.covers);
  });

  it.skip('Compares member storage of upgraded Assessment / TokenController contracts', async function () {
    const membersCount = this.contractData.memberRoles.members.length;
    const assessmentCount = this.contractData.assessment.before.assessmentCount;

    // Process max 6 members at a time due to tenderly rate limits (could be possibly higher in main-net)
    const membersSemaphore = new Sema(6, { capacity: membersCount });

    const processMember = async i => {
      process.stdout.write(`\r[AFTER] member ${i} of ${membersCount}`);
      const [member] = await this.memberRoles.memberAtIndex(Role.Member, i);

      const assessmentMemberBefore = this.contractData.assessment.before.member[member];
      const tokenControllerMemberBefore = this.contractData.tokenController.before.member[member];

      const [
        stake,
        rewards,
        voteCount,
        lockReasons,
        totalBalanceOf,
        getPendingRewards,
        isStakingPoolManager,
        totalBalanceOfWithoutDelegations,
      ] = await Promise.all([
        this.assessment.stakeOf(member),
        this.assessment.getRewards(member),
        this.assessment.getVoteCountOfAssessor(member),
        this.tokenController.getLockReasons(member),
        this.tokenController.totalBalanceOf(member),
        this.tokenController.getPendingRewards(member),
        this.tokenController.isStakingPoolManager(member),
        this.tokenController.totalBalanceOfWithoutDelegations(member),
      ]);

      const votesPromises = Array.from({ length: voteCount }, (_, i) => this.assessment.votesOf(member, i));
      const hasAlreadyVotedPromises = Array.from({ length: assessmentCount }, (_, id) => {
        return this.assessment.hasAlreadyVotedOn(member, id).then(hasAlreadyVotedResult => {
          expect(hasAlreadyVotedResult).to.equal(assessmentMemberBefore.hasAlreadyVotedOn[id]);
        });
      });
      const lockReasonsPromises = lockReasons.map(lockReason => {
        return this.tokenController.tokensLocked(member, lockReason).then(amountLocked => {
          expect(amountLocked).to.equal(tokenControllerMemberBefore.tokensLocked[lockReason]);
        });
      });

      const [votes] = await Promise.all([
        Promise.all(votesPromises),
        Promise.all(hasAlreadyVotedPromises),
        Promise.all(lockReasonsPromises),
      ]);

      // Assessment Member data
      expect(stake).to.deep.equal(assessmentMemberBefore.stake);
      expect(rewards).to.deep.equal(assessmentMemberBefore.rewards);
      expect(votes).to.deep.equal(assessmentMemberBefore.votes);

      // TokenController Member data
      expect(lockReasons).to.deep.equal(tokenControllerMemberBefore.lockReasons);
      expect(totalBalanceOf).to.deep.equal(tokenControllerMemberBefore.totalBalanceOf);
      expect(getPendingRewards).to.deep.equal(tokenControllerMemberBefore.getPendingRewards);
      expect(isStakingPoolManager).to.deep.equal(tokenControllerMemberBefore.isStakingPoolManager);
      expect(totalBalanceOfWithoutDelegations).to.deep.equal(
        tokenControllerMemberBefore.totalBalanceOfWithoutDelegations,
      );

      membersSemaphore.release();
    };

    const memberPromises = Array.from({ length: membersCount }, (_, i) =>
      membersSemaphore.acquire().then(() => processMember(i)),
    );

    await Promise.all(memberPromises);
  });

  it('should withdraw nxm', async function () {
    // TODO:
  });

  require('./basic-functionality-tests');
});
