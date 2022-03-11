require('dotenv').config();
const fetch = require('node-fetch');
const { artifacts, ethers, config, network, run } = require('hardhat');
const { expect } = require('chai');
const { setNextBlockTime, mineNextBlock } = require('../utils/evm');
const { main: getLegacyAssessmentRewards } = require('../../scripts/get-legacy-assessment-rewards');
const { main: getProductsV1 } = require('../../scripts/get-products-v1');
const hre = require('hardhat');

const proposalCategories = require('../../lib/proposal-categories');
const { parseEther } = require('ethers/lib/utils');

const { PROVIDER_URL } = process.env;
const UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const WETH_ADDRESS = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';

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

const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const { defaultAbiCoder, hexlify, toUtf8Bytes } = ethers.utils;

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

const daysToSeconds = numberOfDays => numberOfDays * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
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

  {
    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + daysToSeconds(7));
  }
  const tx = await gv.closeProposal(id, { gasLimit: 15e6 });
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

  it('impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await ethers.provider.send('hardhat_impersonateAccount', [address]);
      const signer = await ethers.getSigner(address);
      this.abMembers.push(signer);
    }
  });

  it('update Governance contract', async function () {
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

  it('run get-legacy-assessment-rewards script', async function () {
    await getLegacyAssessmentRewards();
  });

  it('update ClaimsReward contract', async function () {
    const ClaimsReward = await ethers.getContractFactory('LegacyClaimsReward');
    const newClaimsReward = await ClaimsReward.deploy(this.master.address, DAI_ADDRESS, this.claimsData.address);
    await newClaimsReward.deployed();

    await submitGovernanceProposal(
      29, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('CR')], [newClaimsReward.address]]),
      this.abMembers,
      this.governance,
    );

    this.claimsReward = newClaimsReward;
  });

  it('update TokenController contract', async function () {
    const TokenController = await ethers.getContractFactory('TokenController');
    const tokenController = await TokenController.deploy(this.quotationData.address);
    await tokenController.deployed();

    await submitGovernanceProposal(
      29, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('TC')], [tokenController.address]]),
      this.abMembers,
      this.governance,
    );

    console.log('Proxy address of TokenController: ' + this.tokenController.address);
    console.log('New implementation address of TokenController: ' + tokenController.address);
    const tx = await tokenController.initialize();
    await tx.wait();
    this.tokenController = tokenController;
  });

  it('transfer v1 assessment rewrds to assessors', async function () {
    await this.claimsReward.transferRewards();
  });

  it.skip('check if TokenController balance checks out with Governance rewards', async function () {
    console.log('[todo]');
  });

  it.skip('edit proposal category 41 (Set Asset Swap Details)', async function () {
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

  it.skip('add proposal category 42 (Add new contracts)', async function () {
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

  it.skip('add proposal category 43 (Remove contracts)', async function () {
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

  it.skip('run get-legacy-assessment-rewards script', async function () {
    await getProductsV1();
  });

  it.skip('deploy ProductsV1', async function () {
    const ProductsV1 = await ethers.getContractFactory('ProductsV1');
    const productsV1 = await ProductsV1.deploy();
    await productsV1.deployed();
    this.productsV1 = productsV1;
  });

  it.skip('add empty internal contract for Cover', async function () {
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

  it.skip('deploy StakingPool', async function () {
    const coverAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(
      0, // [todo]
      this.nxm.address,
      coverAddress,
      this.memberRoles.address,
    );
    await stakingPool.deployed();
    this.stakingPoolImplementation = stakingPool;
  });

  // [todo] Remove, just deploying to have those console logs
  it.skip('deploy master contract', async function () {
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

  it.skip('deploy cover contracts', async function () {
    const coverAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const CoverNFT = await ethers.getContractFactory('CoverNFT');
    const coverNFT = await CoverNFT.deploy('Nexus Mutual Cover', 'NXC', coverAddress);
    await coverNFT.deployed();
    this.coverNFT = coverNFT;

    const Cover = await ethers.getContractFactory('Cover');
    const cover = await Cover.deploy(
      this.quotationData.address,
      this.productsV1.address,
      this.stakingPoolImplementation.address,
      this.coverNFT.address,
      coverAddress,
    );
    await cover.deployed();

    await submitGovernanceProposal(
      29, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[hexlify(toUtf8Bytes('CO'))], [cover.address]]),
      this.abMembers,
      this.governance,
    );
  });

  it.skip('remove CR, CD, IC, CL, QD, QT, TF', async function () {
    await submitGovernanceProposal(
      43, // removeContracts(bytes2[])
      defaultAbiCoder.encode(['bytes2[]'], [['CR', 'CD', 'IC', 'CL', 'QD', 'QT', 'TF'].map(x => toUtf8Bytes(x))]),
      this.abMembers,
      this.governance,
    );
  });

  it.skip('run populate-v2-products script', async function () {});
});
