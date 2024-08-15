const { Sema } = require('async-sema');
const { ethers } = require('hardhat');
const { abis, addresses } = require('@nexusmutual/deployments');
const { Storage } = require('./storage');

const storageFileName = 'token-controller.json';

const initStorage = {
  lockReason: {}, // address => bytes32 reason []
  locked: {}, // address => bytes32 reason => uint lockedAmount
  coverInfo: {}, // coverId => CoverInfo
  stakingPoolNXMBalances: {}, // pool id => { rewards, deposits }
  stakingPoolManagers: {}, // pool id => manager
  stakingPoolOwnershipOffers: {}, // // pool id => offer
  managerStakingPools: {}, // manager => pool ids
  poolIds: [],
  // IMMUTABLES
  TOKEN: '',
  QUOTATION_DATA: '',
  CLAIMS_REWARD: '',
  STAKING_POOL_FACTORY: '',
  // uncommented once v2.8.1 is released
  // STAKING_NFT: '',
};

const storage = new Storage('token-controller.json', initStorage);

// TODO: update
const getStorage = async (tokenController, cover, stakingPoolFactory) => {
  console.info('Getting TokenController storage...');
  tokenController = tokenController || (await ethers.getContractAt(abis.TokenController, addresses.TokenController));
  cover = cover || (await ethers.getContractAt(abis.Cover, addresses.Cover));
  stakingPoolFactory =
    stakingPoolFactory || (await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory));

  initStorage.poolIds = await getStakingPoolIds(stakingPoolFactory);

  await Promise.all([
    getImmutablesStorage(tokenController),
    getStakingPoolsStorage(tokenController),
    // getCoverInfo(cover),
  ]);

  await storage.save();

  console.info('TokenController storage done');
};

// TODO: use storage
const getCoverInfo = async (cover, tokenController) => {
  const coverCount = await cover.coverDataCount();
  const semaphore = new Sema(50, { capacity: coverCount });

  const getCoverInfoFor = async (tokenController, semaphore, coverId) => {
    await semaphore.acquire();

    process.stdout.write(`\rcover ${coverId}`);
    const coverInfo = await tokenController.coverInfo(coverId);

    semaphore.release();

    return coverInfo;
  };

  const coverInfoPromises = Array.from({ length: coverCount }).map((_, i) =>
    getCoverInfoFor(tokenController, semaphore, i),
  );
  return Promise.all(coverInfoPromises);
};

// TODO: use storage
const getStakingPoolIds = async stakingPoolFactory => {
  const stakingPoolCount = await stakingPoolFactory.stakingPoolCount();
  return Array.from({ length: stakingPoolCount }).map((_, i) => i + 1);
};

// TODO: use storage
const getStakingPoolsStorage = async tokenController => {
  const getStakingPoolStorageForPool = async poolId => {
    const [stakingPoolNXMBalances, manager, ownershipOffer] = await Promise.all([
      tokenController.stakingPoolNXMBalances(poolId),
      tokenController.getStakingPoolManager(poolId),
      tokenController.getStakingPoolOwnershipOffer(poolId),
    ]);
    initStorage.stakingPoolNXMBalances[poolId] = stakingPoolNXMBalances;
    initStorage.stakingPoolManagers[poolId] = manager;
    initStorage.stakingPoolOwnershipOffers[poolId] = ownershipOffer;
    initStorage.managerStakingPools[manager] = await tokenController.getManagerStakingPools(manager);
  };
  return Promise.all(initStorage.poolIds.map(getStakingPoolStorageForPool));
};

// TODO: use storage
const getImmutablesStorage = async tokenController => {
  const [token, quotationData, claimsReward, stakingPoolFactory] = await Promise.all([
    tokenController.token(),
    tokenController.quotationData(),
    tokenController.claimsReward(),
    tokenController.stakingPoolFactory(),
    // uncomment once v2.8.1 is released
    // tokenController.stakingNFT(),
  ]);
  initStorage.TOKEN = token;
  initStorage.QUOTATION_DATA = quotationData;
  initStorage.CLAIMS_REWARD = claimsReward;
  initStorage.STAKING_POOL_FACTORY = stakingPoolFactory;
  // uncomment once v2.8.1 is released
  // storage.stakingNFT = stakingNFT;
};

// TODO:
// make idempotent
class TokenControllerMembers {
  constructor(tokenController, storage) {
    this.tokenController = tokenController;
    this.storage = storage;
  }

  /**
   * NOTE: Must be idempotent
   */
  async processMember(member) {
    await this.storage._init();

    const lockReasons = await this.tokenController.getLockReasons(member);
    this.storage.data.lockReason[member] = lockReasons;

    const getTokensLockedForReason = async lockReason => {
      const tokensLocked = await this.tokenController.tokensLocked(member, lockReason);
      this.storage.data.locked[member] = this.storage.data.locked[member] || {};
      this.storage.data.locked[member][lockReason] = tokensLocked;
    };

    await Promise.all([...lockReasons.map(getTokensLockedForReason)]);
  }

  async save() {
    await this.storage.save();
  }
}

const tokenControllerMembers = async () => {
  const tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController);
  return new TokenControllerMembers(tokenController, storage);
};

module.exports = { getStorage, tokenControllerMembers };

// TODO: member storage iteration - getTokenControllerMemberStorage
