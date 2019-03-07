const Governance = artifacts.require('Governance');
const MemberRoles = artifacts.require('MemberRoles');
const ProposalCategory = artifacts.require('ProposalCategory');
const TokenController = artifacts.require('TokenController');
const NXMaster = artifacts.require('NXMaster');
const EventCaller = artifacts.require('EventCaller');
const ClaimsReward = artifacts.require('ClaimsReward');
const NXMToken = artifacts.require('NXMToken');
const expectEvent = require('./utils/expectEvent');
const assertRevert = require('./utils/assertRevert.js').assertRevert;
const increaseTime = require('./utils/increaseTime.js').increaseTime;
const encode = require('./utils/encoder.js').encode;
const AdvisoryBoard = '0x41420000';
let maxAllowance =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

let gv;
let cr;
let pc;
let nxms;
let proposalId;
let pId;
let mr;
let nxmToken;
let tc;

contract(
  'Governance',
  ([ab1, ab2, ab3, ab4, mem1, mem2, mem3, mem4, mem5, notMember]) => {
    before(async function() {
      nxms = await NXMaster.deployed();
      cr = await ClaimsReward.deployed();
      nxmToken = await NXMToken.deployed();
      let address = await nxms.getLatestAddress('GV');
      gv = await Governance.at(address);
      address = await nxms.getLatestAddress('PC');
      pc = await ProposalCategory.at(address);
      address = await nxms.getLatestAddress('MR');
      mr = await MemberRoles.at(address);
      tc = await TokenController.deployed();
      await gv.addSolution(0, '', '0x');
      await gv.openProposalForVoting(0);
      await mr.payJoiningFee(ab1, { value: 2000000000000000 });
      await mr.kycVerdict(ab1, true);
    });

    it('Only Owner should be able to change tokenHoldingTime', async function() {
      await gv.changeTokenHoldingTime(3000);
      let tokenHoldingTime = await gv.tokenHoldingTime();
      assert.equal(
        tokenHoldingTime.toNumber(),
        3000,
        'Token holding time not updated'
      );
      await assertRevert(gv.changeTokenHoldingTime(4000, { from: mem1 }));
      await gv.changeTokenHoldingTime(604800);
    });

    it('Only Advisory Board members are authorized to categorize proposal', async function() {
      let allowedToCategorize = await gv.allowedToCatgorize();
      assert.equal(allowedToCategorize.toNumber(), 1);
    });

    it('Should not allow unauthorized to change master address', async function() {
      await assertRevert(
        gv.changeMasterAddress(nxms.address, { from: notMember })
      );
      await gv.changeDependentContractAddress();
      await gv.changeMasterAddress(nxms.address);
    });

    it('Should not allow unauthorized to create proposal', async function() {
      await assertRevert(
        gv.createProposal('Proposal', 'Description', 'Hash', 0, {
          from: notMember
        })
      );
      await assertRevert(
        gv.createProposalwithSolution(
          'Add new member',
          'Add new member',
          'hash',
          9,
          '',
          '0x',
          { from: notMember }
        )
      );
    });

    it('Should create a proposal', async function() {
      let propLength = await gv.getProposalLength();
      proposalId = propLength.toNumber();
      await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
      let propLength2 = await gv.getProposalLength();
      assert.isAbove(
        propLength2.toNumber(),
        propLength.toNumber(),
        'Proposal not created'
      );
    });

    it('Should not allow unauthorized person to categorize proposal', async function() {
      await assertRevert(
        gv.categorizeProposal(proposalId, 1, 0, { from: notMember })
      );
    });

    it('Should not categorize under invalid category', async function() {
      await assertRevert(gv.categorizeProposal(proposalId, 0, 0));
      await assertRevert(gv.categorizeProposal(proposalId, 25, 0));
    });

    it('Should categorize proposal', async function() {
      await gv.categorizeProposal(proposalId, 1, 0);
      let proposalData = await gv.proposal(proposalId);
      assert.equal(proposalData[1].toNumber(), 1, 'Proposal not categorized');
    });

    it('Should update proposal details', async function() {
      let { logs } = await gv.updateProposal(
        proposalId,
        'Addnewmember',
        'AddnewmemberSD',
        'AddnewmemberDescription'
      );
    });

    it('Should reset proposal category', async function() {
      var proposalDataUpdated = await gv.proposal(proposalId);
      assert.equal(proposalDataUpdated[1].toNumber(), 0, 'Category not reset');
    });

    it('Should not open proposal for voting before categorizing', async () => {
      await assertRevert(
        gv.submitProposalWithSolution(proposalId, 'Addnewmember', '0x4d52')
      );
    });

    it('Should allow only owner to open proposal for voting', async () => {
      await gv.categorizeProposal(proposalId, 9, 1e18);
      await gv.proposal(proposalId);
      await pc.category(9);
      await assertRevert(gv.submitVote(proposalId, 1));
      await assertRevert(
        gv.submitProposalWithSolution(
          proposalId,
          'Addnewmember',
          '0xffa3992900000000000000000000000000000000000000000000000000000000000000004344000000000000000000000000000000000000000000000000000000000000',
          { from: notMember }
        )
      );
      await gv.submitProposalWithSolution(
        proposalId,
        'Addnewmember',
        '0xffa3992900000000000000000000000000000000000000000000000000000000000000004344000000000000000000000000000000000000000000000000000000000000'
      );
      assert.equal((await gv.canCloseProposal(proposalId)).toNumber(), 0);
    });

    it('Should not update proposal if solution exists', async function() {
      await assertRevert(gv.categorizeProposal(proposalId, 2, 1e18));
      await assertRevert(
        gv.updateProposal(
          proposalId,
          'Addnewrole',
          'AddnewRoleSD',
          'AddnewRoleDescription'
        )
      );
    });

    it('Should not allow voting for non existent solution', async () => {
      await assertRevert(gv.submitVote(proposalId, 5));
    });

    it('Should not allow unauthorized people to vote', async () => {
      await assertRevert(gv.submitVote(proposalId, 1, { from: notMember }));
    });

    it('Should submit vote to valid solution', async function() {
      await gv.submitVote(proposalId, 1);
      await gv.proposalDetails(proposalId);
      await assertRevert(gv.submitVote(proposalId, 1));
    });

    it('Should not claim reward for an open proposal', async function() {
      await assertRevert(cr.claimAllPendingReward([proposalId]));
    });

    it('Should close proposal', async function() {
      let canClose = await gv.canCloseProposal(proposalId);
      assert.equal(canClose.toNumber(), 1);
      await gv.closeProposal(proposalId);
    });

    it('Should not close already closed proposal', async function() {
      let canClose = await gv.canCloseProposal(proposalId);
      assert.equal(canClose.toNumber(), 2);
      await assertRevert(gv.closeProposal(proposalId));
    });

    it('Should get rewards', async function() {
      let pendingRewards = await gv.getPendingReward(ab1);
    });

    it('Should claim reward only through claimRewards contract', async function() {
      await assertRevert(gv.claimReward(ab1, [1, 2, 3]));
    });

    it('Should claim rewards', async function() {
      await nxms.isMember(ab1);
      await nxmToken.balanceOf(cr.address);
      await cr.claimAllPendingReward([1, 2, 3]);
      let pendingRewards = await gv.getPendingReward(ab1);
      assert.equal(pendingRewards.toNumber(), 0, 'Rewards not claimed');
    });

    it('Should not claim reward twice for same proposal', async function() {
      await assertRevert(cr.claimAllPendingReward([1, 2, 3]));
    });

    describe('Delegation cases', function() {
      it('Initialising Members', async function() {
        await assertRevert(mr.changeMaxABCount(4, { from: ab2 }));
        await mr.changeMaxABCount(4);
        await mr.addInitialABMembers([ab2, ab3, ab4]);
        for (let i = 1; i < 9; i++) {
          await mr.payJoiningFee(web3.eth.accounts[i], {
            value: 2000000000000000,
            from: web3.eth.accounts[i]
          });
          await mr.kycVerdict(web3.eth.accounts[i], true, {
            from: web3.eth.accounts[i]
          });
        }
      });
      it('AB member can delegate vote to AB who is non follower', async function() {
        await gv.delegateVote(ab1, { from: ab2 });
      });
      it('Leader cannot delegate vote', async function() {
        await assertRevert(gv.delegateVote(ab3, { from: ab1 }));
      });
      it('AB member cannot delegate vote to Member', async function() {
        await assertRevert(gv.delegateVote(mem1, { from: ab4 }));
      });
      it('AB member cannot delegate vote to Non-Member', async function() {
        await assertRevert(gv.delegateVote(notMember, { from: ab4 }));
      });
      it('Non-Member cannot delegate vote', async function() {
        await assertRevert(gv.delegateVote(ab1, { from: notMember }));
      });
      it('AB member cannot delegate vote to AB who is follower', async function() {
        await assertRevert(gv.delegateVote(ab2, { from: ab4 }));
      });
      it('Member can delegate vote to AB who is not a follower', async function() {
        await gv.delegateVote(ab1, { from: mem1 });
        let alreadyDelegated = await gv.alreadyDelegated(ab1);
        assert.equal(alreadyDelegated, true);
      });
      it('Member cannot delegate vote to AB who is a follower', async function() {
        await assertRevert(gv.delegateVote(ab2, { from: mem2 }));
      });
      it('Member can delegate vote to Member who is not follower', async function() {
        await gv.delegateVote(mem3, { from: mem5 });
        let followers = await gv.getFollowers(mem3);
        let delegationData = await gv.allDelegation(followers[0].toNumber());
        assert.equal(delegationData[0], mem5);
      });
      it('Member cannot delegate vote to Non-Member', async function() {
        await assertRevert(gv.delegateVote(notMember, { from: mem2 }));
      });
      it('Member cannot delegate vote to member who is follower', async function() {
        await assertRevert(gv.delegateVote(mem5, { from: mem2 }));
      });
      it('Create a proposal', async function() {
        pId = (await gv.getProposalLength()).toNumber();
        await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
        await gv.categorizeProposal(pId, 12, 130 * 1e18);
        await gv.submitProposalWithSolution(
          pId,
          'changes to pricing model',
          '0x'
        );
      });
      it('Ab cannot vote twice on a same proposal', async function() {
        await gv.submitVote(pId, 1, { from: ab3 });
        await assertRevert(gv.submitVote(pId, 1, { from: ab3 }));
      });
      it('Member cannot vote twice on a same proposal', async function() {
        await gv.submitVote(pId, 1, { from: mem4 });
        await assertRevert(gv.submitVote(pId, 1, { from: mem4 }));
      });
      it('Member cannot assign proxy if voted within 7 days', async function() {
        await assertRevert(gv.delegateVote(ab1, { from: mem4 }));
      });
      it('Follower cannot vote on a proposal', async function() {
        await assertRevert(gv.submitVote(pId, 1, { from: ab2 }));
      });
      it('Member can assign proxy if voted more than 7 days earlier', async function() {
        await increaseTime(604805);
        await gv.delegateVote(ab1, { from: mem4 });
      });
      it('Follower can undelegate vote if not voted since 7 days', async function() {
        await increaseTime(604800);
        await gv.unDelegate({ from: mem5 });
        await gv.alreadyDelegated(mem3);
        await increaseTime(259200);
      });
      it('Follower cannot assign new proxy if revoked proxy within 7 days', async function() {
        await assertRevert(gv.delegateVote(ab1, { from: mem5 }));
      });
      it('Undelegated Follower cannot vote within 7 days since undelegation', async function() {
        pId = (await gv.getProposalLength()).toNumber();
        await gv.createProposal('Proposal2', 'Proposal2', 'Proposal2', 0);
        await gv.categorizeProposal(pId, 12, 130 * 1e18);
        await gv.submitProposalWithSolution(
          pId,
          'changes to pricing model',
          '0x'
        );
        await assertRevert(gv.submitVote(pId, 1, { from: mem5 }));
        await increaseTime(432000); //7 days will be completed since revoking proxy
        await gv.delegateVote(ab1, { from: ab4 });
      });
      it('Undelegated Follower can vote after 7 days', async function() {
        await gv.submitVote(pId, 1, { from: ab1 });
        await gv.submitVote(pId, 1, { from: ab3 });
        await gv.submitVote(pId, 1, { from: mem2 });
        await gv.submitVote(pId, 1, { from: mem3 });
        await gv.submitVote(pId, 1, { from: mem5 });
      });
      it('Follower cannot undelegate if there are rewards pending to be claimed', async function() {
        await increaseTime(604810);
        await gv.closeProposal(pId);
        await assertRevert(gv.unDelegate({ from: mem5 }));
        await cr.claimAllPendingReward([pId], { from: mem5 });
      });
      it('Follower should not get reward if delegated within 7days', async function() {
        let pendingReward = await gv.getPendingReward(ab4);
        assert.equal(pendingReward.toNumber(), 0);
      });
      it('Follower can assign new proxy if revoked proxy more than 7 days earlier', async function() {
        await increaseTime(604810);
        await gv.delegateVote(ab1, { from: mem5 });
      });
    });
  }
);
