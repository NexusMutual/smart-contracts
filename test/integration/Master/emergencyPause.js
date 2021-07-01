const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const [owner] = accounts;

describe('emergency pause', function () {

  it('should revert when not called by goverance', async function () {

    const { master } = this.contracts;

    await expectRevert(master.startEmergencyPause(), 'Not authorized');
    await expectRevert(master.addEmergencyPause(true, '0x'), 'Not authorized');
  });

  it('should be able to start and end emergency pause', async function () {

    const { master, gv, pc, tk } = this.contracts;

    const submitProposal = async (category, actionData, members) => {
      const proposalId = await gv.getProposalLength();
      await gv.createProposal('', '', '', category);
      await gv.categorizeProposal(proposalId, category, 0);
      await gv.submitProposalWithSolution(proposalId, '', actionData);

      for (const member of members) {
        await gv.submitVote(proposalId, 1, { from: member });
      }

      const closeTx = await gv.closeProposal(proposalId);
      // expectEvent(closeTx, 'ActionSuccess', { proposalId });

      const proposal = await gv.proposal(proposalId);
      // assert.equal(proposal[2].toNumber(), 3, 'proposal status != accepted');
      return proposalId;
    };

    async function submitMemberVoteProposal (categoryId, actionData, members) {

      const proposalId = await gv.getProposalLength();
      console.log(`Creating proposal ${proposalId}`);

      const from = members[0];
      await gv.createProposal('', '', '', 0, { from });
      await gv.categorizeProposal(proposalId, categoryId, 0, { from });
      await gv.submitProposalWithSolution(proposalId, '', actionData, { from });

      for (const member of members) {
        await gv.submitVote(proposalId, 1, { from: member });
      }

      const { 5: closingTime } = await pc.category(categoryId);
      await time.increase(closingTime.addn(1).toString());
      await gv.closeProposal(proposalId, { from: members[0] });

      const { val: speedBumpHours } = await gv.getUintParameters(hex('ACWT'));
      await time.increase(speedBumpHours.muln(3600).addn(1).toString());
      const triggerTx = await gv.triggerAction(proposalId);

      expectEvent(triggerTx, 'ActionSuccess', { proposalId });

      const proposal = await gv.proposal(proposalId);
      assert.equal(proposal[2].toNumber(), 3, 'proposal status != accepted');
    }

    // start emergency pause
    await submitProposal(ProposalCategory.startEmergencyPause, hex(''), [owner]);
    assert(await master.isPause(), 'expected emergency pause to be started');

    console.log('unpause...');

    // stop emergency pause
    const actionData = web3.eth.abi.encodeParameters(['bool', 'bytes4'], [false, hex('AB')]);
    await submitMemberVoteProposal(ProposalCategory.addEmergencyPause, actionData, [owner]);
    assert.isFalse(await master.isPause(), 'expected emergency pause to be off');
  });
});
