const { ethers, config } = require('hardhat');
const { join } = require('node:path');

const evm = require('./evm')();
const { getSigner, submitGovernanceProposal } = require('./utils');
const { ContractCode, ProposalCategory } = require('../../lib/constants');

const addresses = require(join(config.paths.root, 'deployments/src/addresses.json'));

const { parseEther, toUtf8Bytes } = ethers.utils;

describe('StakingPool rewards update', function () {
  it('Initialize contract instances', async function () {
    this.memberRoles = await ethers.getContractAt('MemberRoles', addresses.MemberRoles);
    this.governance = await ethers.getContractAt('Governance', addresses.Governance);
    this.master = await ethers.getContractAt('NXMaster', addresses.NXMaster);
  });

  it('Impersonate AB members', async function () {
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
    const extras = await ethers.deployContract('StakingExtrasLib');
    await extras.deployed();

    const newStakingPool = await ethers.deployContract(
      'StakingPool',
      [
        addresses.StakingNFT,
        addresses.NXMToken,
        addresses.Cover,
        addresses.TokenController,
        addresses.NXMaster,
        addresses.StakingProducts,
      ],
      { libraries: { StakingExtrasLib: extras.address } },
    );
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

  require('./basic-functionality-tests');
});
