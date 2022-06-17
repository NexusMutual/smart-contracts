require('dotenv').config();

const fetch = require('node-fetch');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setNextBlockTime } = require('../utils/evm');
const getLegacyAssessmentRewards = require('../../scripts/get-legacy-assessment-rewards');
const getProductsV1 = require('../../scripts/get-products-v1');
const getLockedInV1ClaimAssessment = require('../../scripts/get-locked-in-v1-claim-assessment');
const populateV2Products = require('../../scripts/populate-v2-products');
const proposalCategories = require('../../lib/proposal-categories');

// source: https://docs.chain.link/docs/price-feeds-migration-august-2020
const CHAINLINK_DAI_ETH_AGGREGATORS = {
  hardhat: '0x0000000000000000000000000000000000000000',
  mainnet: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  rinkeby: '0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF',
  kovan: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
  tenderly: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
  // used when running hh node to fork a network, change me if needed
  localhost: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
};

const WETH_ADDRESS = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const SWAP_CONTROLLER = '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f';
const PRICE_FEED_ORACLE_ADDRESS = '0xcafea55b2d62399DcFe3DfA3CFc71E4076B14b71';
const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const { defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const getContractFactory = async providerOrSigner => {
  const data = await fetch(VERSION_DATA_URL).then(r => r.json());
  const abis = data.mainnet.abis
    .map(item => ({ ...item, abi: JSON.parse(item.contractAbi) }))
    .reduce((data, item) => ({ ...data, [item.code]: item }), {});

  return async code => {
    const { abi, address } = abis[code];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

const submitGovernanceProposal = async (categoryId, actionData, signers, gv) => {
  const id = await gv.getProposalLength();
  console.log(`Creating proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (let i = 0; i < signers.length; i++) {
    await gv.connect(signers[i]).submitVote(id, 1);
  }

  const { timestamp } = await ethers.provider.getBlock('latest');
  await setNextBlockTime(timestamp + 7 * 24 * 3600); // +7 days

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();
  assert.equal(
    receipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3);
};

describe('v2 migration', function () {
  this.timeout(0);

  it('initialize old contracts', async function () {
    const [deployer] = await ethers.getSigners();
    this.deployer = deployer;

    const factory = await getContractFactory(deployer);

    this.master = await factory('NXMASTER');
    this.nxm = await factory('NXMTOKEN');
    this.memberRoles = await factory('MR');
    this.governance = await factory('GV');
    this.pool = await factory('P1');
    this.mcr = await factory('MC');
    this.incidents = await factory('IC');
    this.quotation = await factory('QT');
    this.quotationData = await factory('QD');
    this.proposalCategory = await factory('PC');
    this.tokenController = await factory('TC');
    this.claims = await factory('CL');
    this.claimsReward = await factory('CR');
    this.claimsData = await factory('CD');
  });

  // generates the LegacyClaimsReward contract with the transfer calls
  it.skip('run get-legacy-assessment-rewards script', async function () {
    await getLegacyAssessmentRewards(ethers.provider);
  });

  // generates the ProductsV1 contract
  it.skip('run get-products-v1 script', async function () {
    await getProductsV1();
  });

  // generates the eligibleForCLAUnlock.json file
  it.skip('run get-products-v1 script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getLockedInV1ClaimAssessment(directProvider);
  });

  it('deploy ProductsV1', async function () {
    const ProductsV1 = await ethers.getContractFactory('ProductsV1');
    const productsV1 = await ProductsV1.deploy();
    await productsV1.deployed();
    this.productsV1 = productsV1;
  });

  it('impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await ethers.provider.send('hardhat_impersonateAccount', [address]);
      const signer = await ethers.getSigner(address);
      this.abMembers.push(signer);
    }
  });

  it('deploy and upgrade Governance contract', async function () {
    const Governance = await ethers.getContractFactory('Governance');
    const newGovernance = await Governance.deploy();
    await newGovernance.deployed();

    await submitGovernanceProposal(
      29, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );
  });

  it('edit proposal category 41 (Set Asset Swap Details)', async function () {
    await submitGovernanceProposal(
      4, // editCategory(uint256,string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
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
        [41, ...proposalCategories[41]],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('add proposal category 42 (Add new contracts)', async function () {
    await submitGovernanceProposal(
      3, // newCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
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
        proposalCategories[42],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('add proposal category 43 (Remove contracts)', async function () {
    await submitGovernanceProposal(
      3, // newCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
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
        proposalCategories[43],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('add empty internal contract for Cover', async function () {
    const CoverInitializer = await ethers.getContractFactory('CoverInitializer');
    const coverInitializer = await CoverInitializer.deploy();
    await coverInitializer.deployed();

    await submitGovernanceProposal(
      42, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes('CO')], [coverInitializer.address], [2]],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('deploy master contract', async function () {
    const NXMaster = await ethers.getContractFactory('NXMaster');
    const master = await NXMaster.deploy();
    await master.deployed();

    await submitGovernanceProposal(
      37, // upgradeTo(address)
      defaultAbiCoder.encode(['address'], [master.address]),
      this.abMembers,
      this.governance,
    );
  });

  it('deploy CoverNFT contract', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const CoverNFT = await ethers.getContractFactory('CoverNFT');
    const coverNFT = await CoverNFT.deploy('Nexus Mutual Cover', 'NXC', coverProxyAddress);
    await coverNFT.deployed();
    this.coverNFT = coverNFT;
  });

  it('deploy SwapOperator', async function () {
    const SwapOperator = await ethers.getContractFactory('CowSwapOperator');
    const swapOperator = await SwapOperator.deploy(
      COWSWAP_SETTLEMENT, // _cowSettlement
      SWAP_CONTROLLER, // _swapController
      this.master.address, // _master
      WETH_ADDRESS, // _weth
    );
    await swapOperator.deployed();
    this.swapOperator = swapOperator;
  });

  it('deploy & upgrade contracts: CR, TC, MCR, MR, CO, PS, P1, GW, CoverMigrator', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const ClaimsReward = await ethers.getContractFactory('LegacyClaimsReward');
    const newClaimsReward = await ClaimsReward.deploy(this.master.address, DAI_ADDRESS);
    await newClaimsReward.deployed();

    const TokenController = await ethers.getContractFactory('TokenController');
    const tokenController = await TokenController.deploy(this.quotationData.address, newClaimsReward.address);
    await tokenController.deployed();

    const MCR = await ethers.getContractFactory('MCR');
    const mcr = await MCR.deploy(this.master.address);
    await mcr.deployed();

    const MemberRoles = await ethers.getContractFactory('MemberRoles');
    const memberRoles = await MemberRoles.deploy();
    await memberRoles.deployed();

    const CoverUtils = await ethers.getContractFactory('CoverUtilsLib');
    const coverUtils = await CoverUtils.deploy();
    await coverUtils.deployed();

    const libraries = { CoverUtilsLib: coverUtils.address };

    const Cover = await ethers.getContractFactory('Cover', { libraries });
    const cover = await Cover.deploy(
      this.quotationData.address,
      this.productsV1.address,
      this.coverNFT.address,
      ethers.constants.AddressZero, // staking pool implementation address
    );
    await cover.deployed();

    const PooledStaking = await ethers.getContractFactory('LegacyPooledStaking');
    const pooledStaking = await PooledStaking.deploy(coverProxyAddress, this.productsV1.address);
    await pooledStaking.deployed();

    const Pool = await ethers.getContractFactory('Pool');
    const pool = await Pool.deploy(
      this.master.address,
      PRICE_FEED_ORACLE_ADDRESS,
      this.swapOperator.address,
      DAI_ADDRESS,
      STETH_ADDRESS,
    );
    await pool.deployed();

    const CoverMigrator = await ethers.getContractFactory('CoverMigrator');
    const coverMigrator = await CoverMigrator.deploy();
    await coverMigrator.deployed();

    const Gateway = await ethers.getContractFactory('LegacyGateway');
    const gateway = await Gateway.deploy();
    await gateway.deployed();

    await submitGovernanceProposal(
      29, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          [
            toUtf8Bytes('MR'),
            toUtf8Bytes('MC'),
            toUtf8Bytes('CO'),
            toUtf8Bytes('TC'),
            toUtf8Bytes('CR'),
            toUtf8Bytes('PS'),
            toUtf8Bytes('P1'),
            toUtf8Bytes('CL'),
            toUtf8Bytes('GW'),
          ],
          [
            memberRoles.address,
            mcr.address,
            cover.address,
            tokenController.address,
            newClaimsReward.address,
            pooledStaking.address,
            pool.address,
            coverMigrator.address,
            gateway.address,
          ],
        ],
      ),
      this.abMembers,
      this.governance,
    );

    this.claimsReward = newClaimsReward;
    this.pool = pool;

    this.mcr = await ethers.getContractAt('MCR', mcr.address);
    this.cover = await ethers.getContractAt('Cover', coverProxyAddress);
    this.coverMigrator = await ethers.getContractAt('CoverMigrator', coverMigrator.address);
    this.memberRoles = await ethers.getContractAt('MemberRoles', this.memberRoles.address);

    const tokenControllerAddress = await this.master.contractAddresses(toUtf8Bytes('TC'));
    this.tokenController = await ethers.getContractAt('TokenController', tokenControllerAddress);

    const pooledStakingAddress = await this.master.contractAddresses(toUtf8Bytes('PS'));
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', pooledStakingAddress);

    const gatewayAddress = await this.master.contractAddresses(toUtf8Bytes('GW'));
    this.gateway = await ethers.getContractAt('LegacyGateway', gatewayAddress);
  });

  it('deploy staking pool', async function () {
    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(
      'Nexus Mutual Staking Pool', // name
      'NMSP', // symbol
      this.nxm.address,
      this.cover.address,
      this.tokenController.address,
    );
    await stakingPool.deployed();
    this.stakingPool = stakingPool;
  });

  it('block V1 staking', async function () {
    const tx = await this.pooledStaking.blockV1();
    await tx.wait();
  });

  it('process all PooledStaking pending actions', async function () {
    let hasPendingActions = await this.pooledStaking.hasPendingActions();
    while (hasPendingActions) {
      const tx = await this.pooledStaking.processPendingActions(100);
      await tx.wait();
      hasPendingActions = await this.pooledStaking.hasPendingActions();
    }
  });

  it('initialize TokenController', async function () {
    const tx = await this.tokenController.initialize();
    await tx.wait();
  });

  it('unlock claim assessment stakes', async function () {
    const stakesPath = `${__dirname}/../../scripts/v2-migration/output/eligibleForCLAUnlock.json`;
    const claimAssessors = require(stakesPath).map(x => x.member);
    const tx = await this.tokenController.withdrawClaimAssessmentTokens(claimAssessors);
    await tx.wait();
  });

  it('transfer v1 assessment rewrds to assessors', async function () {
    await this.claimsReward.transferRewards();
  });

  it.skip('check if TokenController balance checks out with Governance rewards', async function () {
    // [todo]
  });

  it('remove CR, CD, IC, QD, QT, TF, TD, P2', async function () {
    await submitGovernanceProposal(
      43, // removeContracts(bytes2[])
      defaultAbiCoder.encode(['bytes2[]'], [['CR', 'CD', 'IC', 'QD', 'QT', 'TF', 'TD', 'P2'].map(x => toUtf8Bytes(x))]),
      this.abMembers,
      this.governance,
    );
  });

  it('run populate-v2-products script', async function () {
    await populateV2Products(this.cover.address, this.abMembers[0]);
  });

  it.skip('migrate top stakers to new v2 staking pools', async function () {
    const topStakers = [
      '0x1337DEF1FC06783D4b03CB8C1Bf3EBf7D0593FC4',
      '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
      '0x4a9fA34da6d2378c8f3B9F6b83532B169beaEDFc',
      '0x46de0C6F149BE3885f28e54bb4d302Cb2C505bC2',
      '0xE1Ad30971b83c17E2A24c0334CB45f808AbEBc87',
      '0x5FAdEA9d64FFbe0b8A6799B8f0c72250F92E2B1d',
      '0x9c657DB2B697846BE13Ca0B2bB5a6D17f860a395',
      '0xF99b3a13d46A04735BF3828eB3030cfED5Ea0087',
      '0x8C878B8f805472C0b70eD66a71c0B33da3d233c8',
      '0x4544e2Fae244eA4Ca20d075bb760561Ce5990DC3',
    ];
    const txs = await Promise.all(topStakers.map(x => this.pooledStaking.migrateToNewV2Pool(x, 0)));
    await Promise.all(txs.map(x => x.wait()));
  });

  it('deploy & add contracts: Assessment, IndividualClaims, YieldTokenIncidents', async function () {
    const IndividualClaims = await ethers.getContractFactory('IndividualClaims');
    const individualClaims = await IndividualClaims.deploy(this.nxm.address, this.coverNFT.address);
    await individualClaims.deployed();

    const YieldTokenIncidents = await ethers.getContractFactory('YieldTokenIncidents');
    const yieldTokenIncidents = await YieldTokenIncidents.deploy(this.nxm.address, this.coverNFT.address);
    await yieldTokenIncidents.deployed();

    const Assessment = await ethers.getContractFactory('Assessment');
    const assessment = await Assessment.deploy(this.nxm.address);
    await assessment.deployed();

    await submitGovernanceProposal(
      42, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [
          [toUtf8Bytes('IC'), toUtf8Bytes('YT'), toUtf8Bytes('AS')],
          [individualClaims.address, yieldTokenIncidents.address, assessment.address],
          [2, 2, 2],
        ],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('deploy CoverViewer', async function () {
    const CoverViewer = await ethers.getContractFactory('CoverViewer');
    const coverViewer = await CoverViewer.deploy(this.master.address);
    await coverViewer.deployed();
  });

  // [todo] remove me, used just for console logs
  // it('deploy Quotation', async function () {
  // const Quotation = await ethers.getContractFactory('Quotation');
  // const quotation = await Quotation.deploy();
  // await quotation.deployed();

  // await submitGovernanceProposal(
  // 29, // upgradeMultipleContracts(bytes2[],address[])
  // defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('QT')], [quotation.address]]),
  // this.abMembers,
  // this.governance,
  // );

  // this.quotation = await ethers.getContractAt('Quotation', quotation.address);
  // });

  it('MemberRoles is initialized with kycAuthAddress from QuotationData', async function () {
    const kycAuthAddressQD = await this.quotationData.kycAuthAddress();
    const kycAuthAddressMR = await this.memberRoles.kycAuthAddress();
    console.log({ kycAuthAddressMR, kycAuthAddressQD });
    expect(kycAuthAddressMR).to.be.equal(kycAuthAddressQD);
  });

  it('withdrawCoverNote withdraws notes only once and removes the lock reasons', async function () {
    // Using AB members to test for cover notes but other addresses could be added as well
    for (const member of this.abMembers) {
      const {
        coverIds: unsortedCoverIds,
        lockReasons: coverNoteLockReasons,
        withdrawableAmount,
      } = await this.tokenController.getWithdrawableCoverNotes(member.address);
      const lockReasonsBefore = await this.tokenController.getLockReasons(member.address);
      const nxmBalanceBefore = await this.nxm.balanceOf(member.address);
      const reasons = await this.tokenController.getLockReasons(member.address);
      if (!reasons.length) {
        continue;
      }
      const unsortedCoverReasons = coverNoteLockReasons
        .map((x, i) => ({
          coverId: unsortedCoverIds[i],
          index: reasons.indexOf(x),
        }))
        .filter(x => x.index > -1);
      const sortedCoverReasons = unsortedCoverReasons.sort((a, b) => a.index - b.index);
      const indexes = sortedCoverReasons.map(x => x.index);
      const coverIds = sortedCoverReasons.map(x => x.coverId);
      if (!coverIds.length) {
        continue;
      }
      {
        const tx = await this.tokenController.withdrawCoverNote(member.address, coverIds, indexes);
        await tx.wait();
        const nxmBalanceAfter = await this.nxm.balanceOf(member.address);
        expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(withdrawableAmount));
      }
      await expect(this.tokenController.withdrawCoverNote(member.address, coverIds, indexes)).to.be.revertedWith(
        'VM Exception while processing transaction: reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)',
      );
      const lockReasonsAfter = await this.tokenController.getLockReasons(member.address);
      const expectedLockReasonsAfter = lockReasonsBefore.filter(x => !coverNoteLockReasons.includes(x));
      expect(lockReasonsAfter).to.deep.equal(expectedLockReasonsAfter);
    }
  });

  it.skip('withdrawCoverNote reverts after two rejected claims', async function () {
    // [todo]
  });

  it.skip('withdrawCoverNote reverts after an accepted claim', async function () {
    // [todo]
  });

  it.skip('withdrawCoverNote reverts after one rejected and one an accepted claim', async function () {
    // [todo]
  });
});
