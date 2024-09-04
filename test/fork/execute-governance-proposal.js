const assert = require('assert');
const { abis, addresses } = require('@nexusmutual/deployments');
const { ethers, network } = require('hardhat');

const { getSigner } = require('./utils');
const { ContractCode } = require('../../lib/constants');
const evm = require('./evm')();

const { parseEther, toUtf8Bytes } = ethers.utils;
const PROPOSAL_ID = null;

if (!PROPOSAL_ID) {
  throw new Error(`Please set PROPOSAL_ID to a valid proposal id. Current value: ${PROPOSAL_ID}`);
}

describe('Execute governance proposal', function () {
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

  it('Impersonate AB members', async function () {
    this.memberRoles = await getContractByContractCode(abis.MemberRoles, ContractCode.MemberRoles);

    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it(`execute proposal ${PROPOSAL_ID}`, async function () {
    this.governance = await getContractByContractCode(abis.Governance, ContractCode.Governance);

    for (let i = 0; i < this.abMembers.length; i++) {
      await this.governance.connect(this.abMembers[i]).submitVote(PROPOSAL_ID, 1);
    }

    const tx = await this.governance.closeProposal(PROPOSAL_ID, { gasLimit: 21e6 });
    const receipt = await tx.wait();

    assert.equal(
      receipt.events.some(x => x.event === 'ActionSuccess' && x.address === this.governance.address),
      true,
      'ActionSuccess was expected',
    );

    const proposal = await this.governance.proposal(PROPOSAL_ID);
    assert.equal(proposal[2].toNumber(), 3, 'Proposal Status != ACCEPTED');
  });
});
