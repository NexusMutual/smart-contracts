const Governance = artifacts.require('Governance');
const MemberRoles = artifacts.require('MemberRoles');
const ProposalCategory = artifacts.require('ProposalCategory');
const TokenController = artifacts.require('TokenController');
const NXMaster = artifacts.require('NXMasterMock');
const ClaimsReward = artifacts.require('ClaimsReward');
const NXMToken = artifacts.require('NXMToken');
const TokenData = artifacts.require('TokenDataMock');
const PoolData = artifacts.require('PoolDataMock');

const assertRevert = require('./utils/assertRevert.js').assertRevert;
const increaseTime = require('./utils/increaseTime.js').increaseTime;
const {encode, encode1} = require('./utils/encoder.js');
const {toHex, toWei} = require('./utils/ethTools.js');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const { takeSnapshot, revertSnapshot } = require('./utils/snapshot');

const {
  gvProposalWithIncentive,
  gvProposalWithoutTrigger,
  setTriggerActionTime
} = require('./utils/gvProposal.js');

let maxAllowance = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

let gv;
let cr;
let pc;
let nxms;
let proposalId;
let pId;
let mr;
let nxmToken;
let tc;
let td;
let pd;
let accounts = [];
let snapshotId;

contract(
  'Governance',
  ([
    ab1,
    ab2,
    ab3,
    ab4,
    mem1,
    mem2,
    mem3,
    mem4,
    mem5,
    mem6,
    mem7,
    notMember
  ]) => {
    before(async function() {

      snapshotId = await takeSnapshot();

      accounts = [
        ab1,
        ab2,
        ab3,
        ab4,
        mem1,
        mem2,
        mem3,
        mem4,
        mem5,
        mem6,
        mem7,
        notMember
      ];
      cr = await ClaimsReward.deployed();
      nxms = await NXMaster.at(await cr.ms());
      nxmToken = await NXMToken.deployed();
      let address = await nxms.getLatestAddress(toHex('GV'));
      gv = await Governance.at(address);
      address = await nxms.getLatestAddress(toHex('PC'));
      pc = await ProposalCategory.at(address);
      address = await nxms.getLatestAddress(toHex('MR'));
      mr = await MemberRoles.at(address);
      tc = await TokenController.deployed();
      td = await TokenData.deployed();
      pd = await PoolData.deployed();
      await nxmToken.approve(tc.address, maxAllowance);

      //To cover functions in govblocks interface, which are not implemented by NexusMutual
      await gv.addSolution(0, '', '0x');
      await gv.openProposalForVoting(0);
      await gv.pauseProposal(0);
      await gv.resumeProposal(0);

      actionHash = encode1(['bytes8', 'uint256'], [toHex('ACWT'), 0]);
      pId = (await gv.getProposalLength()).toNumber();
      await gvProp(22, actionHash, mr, gv, 2);
      await increaseTime(86500);
      await assertRevert(gv.rejectAction(pId));
      await gv.setInitialActionParameters();
      await assertRevert(gv.setInitialActionParameters());
      await setTriggerActionTime(mr, gv);
    });

    it('Should be able to change tokenHoldingTime manually', async function() {
      await assertRevert(gv.updateUintParameters(toHex('GOVHOLD'), 3000));
    });

    it('Only Advisory Board members are authorized to categorize proposal', async function() {
      let allowedToCategorize = await gv.allowedToCatgorize();
      assert.equal(allowedToCategorize.toNumber(), 1);
    });

    it('Should not allow unauthorized to change master address', async function() {
      await assertRevert(
        gv.changeMasterAddress(nxms.address, {from: notMember})
      );
      await gv.changeDependentContractAddress();
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
          {from: notMember}
        )
      );
    });

    it('Should not allow to create proposal with solution with category id zero', async function() {
      await assertRevert(
        gv.createProposalwithSolution(
          'Add new member',
          'Add new member',
          'hash',
          0,
          '',
          '0x'
        )
      );
    });

    it('Should not allow to add in AB if not member', async function() {
      await assertRevert(mr.addInitialABMembers([ab2, ab3, ab4]));
    });

    it('Should create a proposal', async function() {
      let propLength = await gv.getProposalLength();
      proposalId = propLength.toNumber();
      await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0); //Pid 1
      let propLength2 = await gv.getProposalLength();
      assert.isAbove(
        propLength2.toNumber(),
        propLength.toNumber(),
        'Proposal not created'
      );
    });

    it('Should not allow unauthorized person to categorize proposal', async function() {
      await assertRevert(
        gv.categorizeProposal(proposalId, 1, 0, {from: notMember})
      );
    });

    it('Should not categorize under invalid category', async function() {
      await assertRevert(gv.categorizeProposal(proposalId, 0, 0));
      await assertRevert(gv.categorizeProposal(proposalId, 35, 0));
    });

    it('Should categorize proposal', async function() {
      await gv.categorizeProposal(proposalId, 1, 0);
      let proposalData = await gv.proposal(proposalId);
      assert.equal(proposalData[1].toNumber(), 1, 'Proposal not categorized');
    });

    it('Should update proposal details', async function() {
      let {logs} = await gv.updateProposal(
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
      await gv.categorizeProposal(proposalId, 9, toWei(1));
      await gv.proposal(proposalId);
      await pc.category(9);
      await assertRevert(gv.submitVote(proposalId, 1));
      await assertRevert(
        gv.submitProposalWithSolution(
          proposalId,
          'Addnewmember',
          '0xffa3992900000000000000000000000000000000000000000000000000000000000000004344000000000000000000000000000000000000000000000000000000000000',
          {from: notMember}
        )
      );
      await gv.submitProposalWithSolution(
        proposalId,
        'Addnewmember',
        '0xffa3992900000000000000000000000000000000000000000000000000000000000000004344000000000000000000000000000000000000000000000000000000000000'
      );
      assert.equal((await gv.canCloseProposal(proposalId)).toNumber(), 0);
    });

    it('Should allow open proposal for voting only once', async () => {
      await assertRevert(
        gv.submitProposalWithSolution(
          proposalId,
          'Addnewmember',
          '0xffa3992900000000000000000000000000000000000000000000000000000000000000004344000000000000000000000000000000000000000000000000000000000000'
        )
      );
    });

    it('Should not update proposal if solution exists', async function() {
      await assertRevert(gv.categorizeProposal(proposalId, 2, toWei(1)));
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
      await assertRevert(gv.submitVote(proposalId, 1, {from: notMember}));
    });

    it('Should submit vote to valid solution', async function() {
      await gv.submitVote(proposalId, 1);
      await gv.proposalDetails(proposalId);
      await assertRevert(gv.submitVote(proposalId, 1));
    });

    // it('Should not claim reward for an open proposal', async function() {
    //   await assertRevert(cr.claimAllPendingReward(20));
    // });

    it('Should not trigger action before closing proposal', async function() {
      await assertRevert(gv.triggerAction(proposalId));
    });

    it('Should close proposal', async function() {
      let canClose = await gv.canCloseProposal(proposalId);
      assert.equal(canClose.toNumber(), 1);
      await gv.closeProposal(proposalId);
    });

    it('Should execute action for AB proposals', async function() {
      assert.equal(await gv.proposalActionStatus(proposalId), 3);
    });

    it('Should not reject action after trigger action', async function() {
      await assertRevert(gv.rejectAction(proposalId));
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
      await assertRevert(gv.claimReward(ab1, 20));
    });

    it('Should claim rewards', async function() {
      await nxms.isMember(ab1);
      await nxmToken.balanceOf(cr.address);
      await cr.claimAllPendingReward(20);
      let pendingRewards = await gv.getPendingReward(ab1);
      assert.equal(pendingRewards.toNumber(), 0, 'Rewards not claimed');
      pId = await gv.getProposalLength();
      lastClaimed = await gv.lastRewardClaimed(ab1);
    });

    // it('Should not claim reward twice for same proposal', async function() {
    //   await assertRevert(cr.claimAllPendingReward(20));
    // });

    it('Should claim rewards for multiple number of proposals', async function() {
      let action = 'updateUintParameters(bytes8,uint)';
      let code = toHex('MAXFOL');
      let proposedValue = 50;
      let lastClaimed = await gv.lastRewardClaimed(ab1);
      let actionHash = encode1(['bytes8', 'uint256'], [code, proposedValue]);
      pId = await gv.getProposalLength();
      lastClaimed = await gv.lastRewardClaimed(ab1);
      for (let i = 0; i < 3; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 2, 10);
      }
      let members = await mr.members(2);
      let iteration = 0;
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await cr.claimAllPendingReward(20);
      }
      pId = await gv.getProposalLength();
      lastClaimed = await gv.lastRewardClaimed(ab1);
    });

    it('Claim rewards for proposals which are not in sequence', async function() {
      pId = await gv.getProposalLength();
      let action = 'updateUintParameters(bytes8,uint)';
      let code = toHex('MAXFOL');
      let proposedValue = 50;
      let actionHash = encode1(['bytes8', 'uint256'], [code, proposedValue]);
      for (let i = 0; i < 3; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 2, 10);
      }
      let p = await gv.getProposalLength();
      await gv.createProposal('proposal', 'proposal', 'proposal', 0);
      await gv.categorizeProposal(p, 22, 10);
      await gv.submitProposalWithSolution(p, 'proposal', actionHash);
      let members = await mr.members(2);
      let iteration = 0;
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await gv.submitVote(p, 1, {
          from: members[1][iteration]
        });
      }
      for (let i = 0; i < 3; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 2, 10);
      }
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await cr.claimAllPendingReward(20);
      }
      let p1 = await gv.getProposalLength();
      let lastClaimed = await gv.lastRewardClaimed(ab1);
      assert.equal(lastClaimed.toNumber(), p.toNumber() - 1);
      await gv.closeProposal(p);
      await gv.triggerAction(p);
      await gv.getPendingReward(ab1);
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await cr.claimAllPendingReward(20);
      }

      lastClaimed = await gv.lastRewardClaimed(ab1);
      assert.equal(lastClaimed.toNumber(), p1.toNumber() - 1);
    });

    it('Claim rewards for proposals which are not in sequence - 2', async function() {
      pId = await gv.getProposalLength();
      let action = 'updateUintParameters(bytes8,uint)';
      let code = toHex('MAXFOL');
      let proposedValue = 50;
      let actionHash = encode1(['bytes8', 'uint256'], [code, proposedValue]);
      for (let i = 0; i < 3; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 2, 10);
      }
      let p = await gv.getProposalLength();
      await gv.createProposal('proposal', 'proposal', 'proposal', 0);
      await gv.categorizeProposal(p, 22, 10);
      await gv.submitProposalWithSolution(p, 'proposal', actionHash);
      let members = await mr.members(2);
      let iteration = 0;
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await gv.submitVote(p, 1, {
          from: members[1][iteration]
        });
      }
      for (let i = 0; i < 3; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 2, 10);
      }
      let p2 = await gv.getProposalLength();
      await gv.createProposal('proposal', 'proposal', 'proposal', 0);
      await gv.categorizeProposal(p2, 22, 10);
      await gv.submitProposalWithSolution(p2, 'proposal', actionHash);
      members = await mr.members(2);
      iteration = 0;
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await gv.submitVote(p2, 1, {
          from: members[1][iteration]
        });
      }
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await cr.claimAllPendingReward(20);
      }
      await gv.closeProposal(p);
      await gv.closeProposal(p2);
      await gv.triggerAction(p);
      await gv.triggerAction(p2);
      await gv.getPendingReward(ab1);
      for (iteration = 0; iteration < members[1].length; iteration++) {
        await cr.claimAllPendingReward(20);
      }

      lastClaimed = await gv.lastRewardClaimed(ab1);
    });

    it('Claim Rewards for maximum of 20 proposals', async function() {
      await gv.setDelegationStatus(true, {from: ab1});
      let actionHash = encode1(['bytes8', 'uint'], [toHex('MAXFOL'), 50]);
      let p1 = await gv.getProposalLength();
      let lastClaimed = await gv.lastRewardClaimed(ab1);
      for (let i = 0; i < 7; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 2, 10);
      }
      await cr.claimAllPendingReward(5);
      p1 = await gv.getProposalLength();
      let lastProposal = p1.toNumber() - 1;
      lastClaimed = await gv.lastRewardClaimed(ab1);
      //Two proposal are still pending to be claimed since 5 had been passed as max records to claim
      assert.equal(lastClaimed.toNumber(), lastProposal - 2);
    });

    it('Claim Reward for followers', async function() {
      let actionHash = encode1(['bytes8', 'uint'], [toHex('MAXFOL'), 50]);
      await mr.payJoiningFee(mem1, {
        value: '2000000000000000',
        from: mem1
      });
      await mr.kycVerdict(mem1, true, {
        from: ab1
      });
      await gv.delegateVote(ab1, {from: mem1});
      await increaseTime(604805);
      let lastClaimedAb1 = await gv.lastRewardClaimed(ab1);
      let lastClaimedMem1 = await gv.lastRewardClaimed(mem1);
      //ab1 has 2 reward pending to be claimed in previous case
      //last claimed of member will be total number of votes of ab1 untill his delegation
      assert.equal(lastClaimedMem1.toNumber(), lastClaimedAb1.toNumber() + 2);
      for (let i = 0; i < 7; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 1, 10);
      }
      await cr.claimAllPendingReward(5, {from: mem1});
      let lastClaimedMem2 = await gv.lastRewardClaimed(mem1);
      assert.equal(lastClaimedMem1.toNumber() + 5, lastClaimedMem2);
    });

    it('Last reward claimed should be updated when follower undelegates', async function() {
      await cr.claimAllPendingReward(20, {from: ab1});
      await cr.claimAllPendingReward(20, {from: mem1});
      // await gv.setDelegationStatus(false, { from: ab1 });
      await gv.unDelegate({from: mem1});
      await increaseTime(604900);
      let lastRewardClaimed = await gv.lastRewardClaimed(mem1);
      //Till now Member 1 hasn't voted on his own, so his vote count will be 0
      assert.equal(lastRewardClaimed.toNumber(), 0);
    });

    it('Should not get reward if delegated with in tokenHoldingTime', async function() {
      let mem1Balance = await nxmToken.balanceOf(mem1);
      let actionHash = encode(
        'updateUintParameters(bytes8,uint)',
        'MAXFOL',
        50
      );
      for (let i = 0; i < 6; i++) {
        let propId = (await gv.getProposalLength()).toNumber();
        await gvProposalWithIncentive(22, actionHash, mr, gv, 1, 10);
      }
      await cr.claimAllPendingReward(4, {from: ab1});
      let lastProposal = (await gv.getProposalLength()).toNumber() - 1;
      let lastVoteId = await gv.memberProposalVote(ab1, lastProposal);
      let lastClaimedAb1 = await gv.lastRewardClaimed(ab1);
      //Two proposals are pending to claim reward
      assert.equal(lastClaimedAb1.toNumber(), lastVoteId.toNumber() - 2);
      await gv.delegateVote(ab1, {from: mem1});
      await gvProposalWithIncentive(22, actionHash, mr, gv, 1, 10); //32 Member doesn't get rewards for this proposal
      await increaseTime(604805);
      let p1 = await gv.getProposalLength();
      await gvProposalWithIncentive(22, actionHash, mr, gv, 1, 10); //33
      let p1Rewards = await gv.proposal(p1.toNumber());
      let p = await gv.getProposalLength();
      await gv.createProposal('proposal', 'proposal', 'proposal', 0); //34
      await gv.categorizeProposal(p, 22, 10);
      await gv.submitProposalWithSolution(p, 'proposal', actionHash);
      await gv.submitVote(p, 1, {from: ab1});
      let p2 = await gv.getProposalLength();
      await gvProposalWithIncentive(22, actionHash, mr, gv, 1, 10); //35
      let p2Rewards = await gv.proposal(p2.toNumber());
      await cr.claimAllPendingReward(5, {from: mem1});
      // lastClaimedAb1 = await gv.lastRewardClaimed(ab1);
      let lastClaimedMem1 = await gv.lastRewardClaimed(mem1);
      assert.equal(lastClaimedMem1.toNumber(), p.toNumber() - 1);
      let mem1Balance1 = await nxmToken.balanceOf(mem1);
      let expectedBalance =
        mem1Balance.toNumber() +
        p1Rewards[4].toNumber() / 2 +
        p2Rewards[4].toNumber() / 2;
      assert.equal(mem1Balance1, expectedBalance);
      await gv.closeProposal(p);
      await gv.triggerAction(p);
      await cr.claimAllPendingReward(5, {from: mem1});
      lastClaimedMem1 = await gv.lastRewardClaimed(mem1);
      let pRewards = await gv.proposal(p.toNumber());
      let mem1Balance2 = await nxmToken.balanceOf(mem1);
      expectedBalance = mem1Balance1.toNumber() + pRewards[4].toNumber() / 2;
      assert.equal(mem1Balance2.toNumber(), expectedBalance);
      await cr.claimAllPendingReward(20, {from: ab1});
      await cr.claimAllPendingReward(20, {from: mem1});
      await gv.setDelegationStatus(false, {from: ab1});
      await gv.unDelegate({from: mem1});
    });

    it('Proposal should be closed if not categorized for more than 14 days', async function() {
      pId = await gv.getProposalLength();
      await gv.createProposal('Proposal', 'Proposal', 'Proposal', 0);
      await increaseTime(604810 * 2);
      await gv.closeProposal(pId);
      await assertRevert(gv.triggerAction(pId));
    });

    it('Proposal should be closed if not submitted to vote for more than 14 days', async function() {
      pId = await gv.getProposalLength();
      await gv.createProposal('Proposal', 'Proposal', 'Proposal', 0);
      await gv.categorizeProposal(pId, 22, 10);
      await increaseTime(604810 * 2);
      await gv.closeProposal(pId);
      await assertRevert(gv.triggerAction(pId));
    });

    it('Initialising AB Members', async function() {
      await increaseTime(604900);
      await assertRevert(mr.changeMaxABCount(4, {from: ab2}));
      await mr.payJoiningFee(ab2, {
        value: '2000000000000000',
        from: ab2
      });
      await mr.kycVerdict(ab2, true, {
        from: ab1
      });
      await mr.payJoiningFee(ab3, {
        value: '2000000000000000',
        from: ab3
      });
      await mr.kycVerdict(ab3, true, {
        from: ab1
      });
      await mr.payJoiningFee(ab4, {
        value: '2000000000000000',
        from: ab4
      });
      await mr.kycVerdict(ab4, true, {
        from: ab1
      });
      await mr.addInitialABMembers([ab2, ab3, ab4]);
      for (let i = 1; i < 11; i++) {
        if (i >= 5) {
          await mr.payJoiningFee(accounts[i], {
            value: '2000000000000000',
            from: accounts[i]
          });
          await mr.kycVerdict(accounts[i], true, {
            from: accounts[0]
          });
        }
        await nxmToken.transfer(accounts[i], toWei(60000));
      }
      await increaseTime(604800);
    });

    it('Create a proposal, pass, then check no action executed. Try to execute action after x timeperiod and it should work', async function() {
      await increaseTime(604800);
      balance = await web3.eth.getBalance(notMember);
      pId = (await gv.getProposalLength()) / 1;
      let IAStatusETH = await pd.getInvestmentAssetStatus(toHex('ETH'));
      let actionHash = encode1(
        ['bytes4', 'bool'],
        [toHex('ETH'), !IAStatusETH]
      );
      await gvProposalWithoutTrigger(15, actionHash, mr, gv, 2);
      let IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await increaseTime(86500);
      await gv.triggerAction(pId);
      IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.notEqual(IAStatusETH, IAStatusETHNew, 'Action not executed');
    });

    it('Increase proposal action waiting time', async function() {
      let actionHash = encode1(['bytes8', 'uint256'], [toHex('ACWT'), 24]);
      let p = await gv.getProposalLength();
      await gv.createProposal('proposal', 'proposal', 'proposal', 0);
      await gv.categorizeProposal(p, 22, 0);
      await gv.submitProposalWithSolution(p, 'proposal', actionHash);
      let members = await mr.members(2);
      let iteration = 0;
      for (iteration = 0; iteration < members[1].length; iteration++)
        await gv.submitVote(p, 1, {
          from: members[1][iteration]
        });
      await gv.closeProposal(p);
      let proposal = await gv.proposal(p);
      assert.equal(proposal[2].toNumber(), 3);
      await gv.triggerAction(p);
    });

    it('Create a proposal, pass, then check no action executed. Reject by 1 AB. Try to execute action after x timeperiod and it should work', async function() {
      await increaseTime(604800);
      let IAStatusETH = await pd.getInvestmentAssetStatus(toHex('ETH'));
      pId = (await gv.getProposalLength()) / 1;
      let actionHash = encode1(
        ['bytes4', 'bool'],
        [toHex('ETH'), !IAStatusETH]
      );
      await gvProposalWithoutTrigger(15, actionHash, mr, gv, 2);
      let IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await gv.rejectAction(pId);
      await increaseTime(86500);
      await gv.triggerAction(pId);
      IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.notEqual(IAStatusETH, IAStatusETHNew, 'Action not executed');
    });

    it('Create a proposal, pass, then check no action executed. Reject by 3 AB. Try to execute action after x timeperiod and it should not work', async function() {
      await increaseTime(604800);
      let IAStatusETH = await pd.getInvestmentAssetStatus(toHex('ETH'));
      pId = (await gv.getProposalLength()) / 1;
      let actionHash = encode1(
        ['bytes4', 'bool'],
        [toHex('ETH'), !IAStatusETH]
      );
      await gvProposalWithoutTrigger(15, actionHash, mr, gv, 2);
      let IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await gv.rejectAction(pId);
      await gv.rejectAction(pId, {from: ab3});
      await gv.rejectAction(pId, {from: ab2});
      await increaseTime(86500);
      await assertRevert(gv.triggerAction(pId));
      IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
    });

    it('Create a proposal, pass, then check no action executed. Reject by same AB member twice. Should revert', async function() {
      await increaseTime(604800);
      let IAStatusETH = await pd.getInvestmentAssetStatus(toHex('ETH'));
      pId = (await gv.getProposalLength()) / 1;
      let actionHash = encode1(
        ['bytes4', 'bool'],
        [toHex('ETH'), !IAStatusETH]
      );
      await gvProposalWithoutTrigger(15, actionHash, mr, gv, 2);
      let IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await gv.rejectAction(pId);
      await assertRevert(gv.rejectAction(pId));
      await gv.rejectAction(pId, {from: ab3});
      await gv.rejectAction(pId, {from: ab4});
      await increaseTime(86500);
      await assertRevert(gv.rejectAction(pId));
      await assertRevert(gv.triggerAction(pId));
      IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
    });

    it('Create a proposal, pass, then check no action executed. Reject by 1/3 AB after time elapsed it s should revert. Try to execute action after x timeperiod and it should work', async function() {
      await increaseTime(604800);
      let IAStatusETH = await pd.getInvestmentAssetStatus(toHex('ETH'));
      pId = (await gv.getProposalLength()) / 1;
      let actionHash = encode1(
        ['bytes4', 'bool'],
        [toHex('ETH'), !IAStatusETH]
      );
      await gvProposalWithoutTrigger(15, actionHash, mr, gv, 2);
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      let IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
      await gv.rejectAction(pId);
      await increaseTime(86500);
      await assertRevert(gv.rejectAction(pId, {from: ab3}));
      await gv.triggerAction(pId);
      IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.notEqual(IAStatusETH, IAStatusETHNew, 'Action not executed');
    });

    it('Create a proposal to swap AB, pass, then check no action executed. Reject by AB to fail. Try to execute action after x timeperiod and it should work', async function() {
      await increaseTime(604800);
      pId = (await gv.getProposalLength()).toNumber();
      let actionHash = encode1(['address', 'address'], [mem1, ab2]);

      await gv.createProposalwithSolution(
        'Proposal9',
        'Proposal9',
        'Proposal9',
        16,
        'Swap AB Member',
        actionHash,
        {from: mem1}
      );

      await gv.submitVote(pId, 1, {from: ab1});
      await gv.submitVote(pId, 1, {from: ab2});
      await gv.submitVote(pId, 1, {from: ab3});
      await gv.submitVote(pId, 1, {from: ab4});
      await gv.submitVote(pId, 1, {from: mem1});
      await gv.submitVote(pId, 1, {from: mem2});
      await gv.submitVote(pId, 1, {from: mem3});
      await gv.submitVote(pId, 1, {from: mem4});
      await gv.submitVote(pId, 1, {from: mem6});
      await gv.submitVote(pId, 1, {from: mem7});

      await increaseTime(604800);
      await gv.closeProposal(pId);
      await assertRevert(gv.rejectAction(pId));
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await increaseTime(86500);
      await gv.triggerAction(pId);
      let roleCheck = await mr.checkRole(ab2, 1);
      assert.equal(roleCheck, false);
      let roleCheck1 = await mr.checkRole(mem1, 1);
      assert.equal(roleCheck1, true);

      // Revert swap
      await increaseTime(604800);
      pId = (await gv.getProposalLength()).toNumber();
      actionHash = encode1(['address', 'address'], [ab2, mem1]);

      await gv.createProposalwithSolution(
        'Proposal9',
        'Proposal9',
        'Proposal9',
        16,
        'Swap AB Member',
        actionHash,
        {from: ab2}
      );

      await gv.submitVote(pId, 1, {from: ab1});
      // await gv.submitVote(pId, 1, {from: ab2});
      await gv.submitVote(pId, 1, {from: ab3});
      await gv.submitVote(pId, 1, {from: ab4});
      await gv.submitVote(pId, 1, {from: mem1});
      await gv.submitVote(pId, 1, {from: mem2});
      await gv.submitVote(pId, 1, {from: mem3});
      await gv.submitVote(pId, 1, {from: mem4});
      await gv.submitVote(pId, 1, {from: mem6});
      await gv.submitVote(pId, 1, {from: mem7});

      await increaseTime(604800);
      await gv.closeProposal(pId);
      await assertRevert(gv.rejectAction(pId));
      proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await increaseTime(86500);
      await gv.triggerAction(pId);
      roleCheck = await mr.checkRole(mem1, 1);
      assert.equal(roleCheck, false);
      roleCheck1 = await mr.checkRole(ab2, 1);
      assert.equal(roleCheck1, true);
    });

    it('Create a proposal, pass, then check no action executed. Reject by non-AB, It should revert. Try to execute action after x timeperiod and it should work', async function() {
      await increaseTime(604800);
      let IAStatusETH = await pd.getInvestmentAssetStatus(toHex('ETH'));
      pId = (await gv.getProposalLength()) / 1;
      let actionHash = encode1(
        ['bytes4', 'bool'],
        [toHex('ETH'), !IAStatusETH]
      );
      await gvProposalWithoutTrigger(15, actionHash, mr, gv, 2);
      let IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.equal(IAStatusETH, IAStatusETHNew, 'Action executed');
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await assertRevert(gv.rejectAction(pId, {from: mem5}));
      await increaseTime(86500);
      await gv.triggerAction(pId);
      IAStatusETHNew = await pd.getInvestmentAssetStatus(toHex('ETH'));
      assert.notEqual(IAStatusETH, IAStatusETHNew, 'Action not executed');
    });

    it('Create a proposal with AB voting, pass, then action should be executed automatically. Reject should revert', async function() {
      await increaseTime(604800);
      pId = (await gv.getProposalLength()) / 1;
      let actionHash = '0x00';
      await gvProposalWithoutTrigger(6, actionHash, mr, gv, 1);
      let isPause = await nxms.isPause();
      assert.equal(isPause, true, 'Action executed');
      let proposal = await gv.proposal(pId);
      assert.equal(proposal[2].toNumber(), 3);
      await assertRevert(gv.rejectAction(pId, {from: mem5}));

      await increaseTime(86500);
      pId = (await gv.getProposalLength()) / 1;
      actionHash = encode1(['bool', 'bytes4'], [false, toHex('AB')]);
      await gvProposalWithoutTrigger(7, actionHash, mr, gv, 2);
      await increaseTime(86500);
      await gv.triggerAction(pId);
      isPause = await nxms.isPause();
      assert.equal(isPause, false, 'Action not executed');
    });

    describe('Delegation cases', function() {
      it('Fllower cannot delegate vote if Leader is not open for delegation', async function() {
        await increaseTime(604800);
        await assertRevert(gv.delegateVote(ab1, {from: mem1}));
      });
      it('AB member cannot delegate vote to AB', async function() {
        await gv.setDelegationStatus(true, {from: ab1});
        await assertRevert(gv.delegateVote(ab1, {from: ab2}));
      });
      it('Owner cannot delegate vote', async function() {
        await gv.setDelegationStatus(true, {from: ab3});
        await assertRevert(gv.delegateVote(ab3, {from: ab1}));
      });
      it('AB member cannot delegate vote to Member', async function() {
        await gv.setDelegationStatus(true, {from: mem1});
        await assertRevert(gv.delegateVote(mem1, {from: ab4}));
      });
      it('AB member cannot delegate vote to Non-Member', async function() {
        await assertRevert(gv.delegateVote(notMember, {from: ab4}));
      });
      it('Non-Member cannot delegate vote', async function() {
        await assertRevert(gv.delegateVote(ab1, {from: notMember}));
      });
      it('AB member cannot delegate vote to AB who is follower', async function() {
        await gv.setDelegationStatus(true, {from: ab2});
        await assertRevert(gv.delegateVote(ab2, {from: ab4}));
      });
      it('Member can delegate vote to AB who is not a follower', async function() {
        await gv.delegateVote(ab1, {from: mem1});
        let alreadyDelegated = await gv.alreadyDelegated(ab1);
        assert.equal(alreadyDelegated, true);
      });
      it('Member can delegate vote to Member who is not follower', async function() {
        await gv.setDelegationStatus(true, {from: mem3});
        await gv.delegateVote(mem3, {from: mem5});
        let followers = await gv.getFollowers(mem3);
        let delegationData = await gv.allDelegation(followers[0].toNumber());
        assert.equal(delegationData[0], mem5);
      });
      it('Leader cannot delegate vote', async function() {
        await assertRevert(gv.delegateVote(ab3, {from: mem3}));
      });
      it('Member cannot delegate vote to Non-Member', async function() {
        await assertRevert(gv.delegateVote(notMember, {from: mem2}));
      });
      it('Member cannot delegate vote to member who is follower', async function() {
        await assertRevert(gv.delegateVote(mem5, {from: mem2}));
      });
      it('Create a proposal', async function() {
        pId = (await gv.getProposalLength()).toNumber();
        await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0); //Pid 2
        await gv.categorizeProposal(pId, 13, toWei(130));
        await gv.submitProposalWithSolution(
          pId,
          'changes to pricing model',
          '0x'
        );
      });
      it('Ab cannot vote twice on a same proposal and cannot transfer nxm to others', async function() {
        await gv.submitVote(pId, 1, {from: ab3});
        await assertRevert(nxmToken.transferFrom(ab3, ab2, toWei(1)));
        await assertRevert(gv.submitVote(pId, 1, {from: ab3}));
      });
      it('Member cannot vote twice on a same proposal', async function() {
        await gv.submitVote(pId, 1, {from: mem4});
        await assertRevert(gv.submitVote(pId, 1, {from: mem4}));
      });
      it('Member cannot assign proxy if voted within 7 days', async function() {
        await assertRevert(gv.delegateVote(ab1, {from: mem4}));
      });
      it('Follower cannot vote on a proposal', async function() {
        await assertRevert(gv.submitVote(pId, 1, {from: mem5}));
      });
      it('Member can assign proxy if voted more than 7 days earlier', async function() {
        await increaseTime(604850);
        await gv.delegateVote(ab1, {from: mem4});
      });
      it('Follower can undelegate vote if not voted since 7 days', async function() {
        await increaseTime(604800);
        await gv.unDelegate({from: mem5});
        await gv.alreadyDelegated(mem3);
        await increaseTime(259200);
      });
      it('Leader can change delegation status if there are no followers', async function() {
        await gv.setDelegationStatus(false, {from: mem5});
      });
      it('Follower cannot assign new proxy if revoked proxy within 7 days', async function() {
        await assertRevert(gv.delegateVote(ab1, {from: mem5}));
      });
      it('Undelegated Follower cannot vote within 7 days since undelegation', async function() {
        pId = (await gv.getProposalLength()).toNumber();
        await gv.createProposal('Proposal2', 'Proposal2', 'Proposal2', 0); //Pid 3
        await gv.categorizeProposal(pId, 13, toWei(130));
        await gv.submitProposalWithSolution(
          pId,
          'changes to pricing model',
          '0x'
        );
        await assertRevert(gv.submitVote(pId, 1, {from: mem5}));
        await increaseTime(432000); //7 days will be completed since revoking proxy
        await gv.delegateVote(ab1, {from: mem7});
      });
      it('Undelegated Follower can vote after 7 days', async function() {
        let lockedTime = await nxmToken.isLockedForMV(mem2);
        await gv.submitVote(pId, 1, {from: ab1});
        await gv.submitVote(pId, 1, {from: ab3});
        await gv.submitVote(pId, 1, {from: mem2});
        await gv.submitVote(pId, 1, {from: mem3});
        await gv.submitVote(pId, 1, {from: mem5});
      });
      it('Tokens should be locked for 7 days after voting', async function() {
        let lockedTime = await nxmToken.isLockedForMV(mem2);
        assert.isAbove(lockedTime.toNumber(), Date.now() / 1000);
      });
      it('should not withdraw membership if he have pending rewads to claim', async function() {
        await increaseTime(604810);
        await gv.closeProposal(pId);
        await assertRevert(gv.triggerAction(pId));
        await assertRevert(mr.withdrawMembership({from: mem5}));
      });
      it('Follower cannot undelegate if there are rewards pending to be claimed', async function() {
        await assertRevert(gv.unDelegate({from: mem5}));
        await cr.claimAllPendingReward(20, {from: mem5});
      });
      it('Follower should not get reward if delegated within 7days', async function() {
        let pendingReward = await gv.getPendingReward(mem7);
        assert.equal(pendingReward.toNumber(), 0);
      });
      it('Follower can assign new proxy if revoked proxy more than 7 days earlier', async function() {
        await increaseTime(604810);
        await gv.delegateVote(ab1, {from: mem5});
      });
      it('Should not get rewards if not participated in voting', async function() {
        let pendingReward = await gv.getPendingReward(mem6);
        assert.equal(pendingReward.toNumber(), 0);
      });
      it('Should not add followers more than followers limit', async function() {
        await increaseTime(604810);
        pId = (await gv.getProposalLength()).toNumber();
        await gv.createProposal('Proposal2', 'Proposal2', 'Proposal2', 0); //Pid 3
        await gv.categorizeProposal(pId, 22, 0);
        let actionHash = encode1(['bytes8', 'uint'], [toHex('MAXFOL'), 2]);
        await gv.submitProposalWithSolution(
          pId,
          'update max followers limit',
          actionHash
        );
        await gv.submitVote(pId, 1, {from: ab1});
        await gv.submitVote(pId, 1, {from: ab2});
        await gv.submitVote(pId, 1, {from: ab3});
        await gv.submitVote(pId, 1, {from: mem2});
        await gv.submitVote(pId, 1, {from: mem3});
        await gv.submitVote(pId, 1, {from: mem6});
        await increaseTime(604810);
        await gv.closeProposal(pId);
        await increaseTime(86500);
        await gv.triggerAction(pId);
        await assertRevert(gv.delegateVote(ab1, {from: mem6}));
      });
    });

    after(async function () {
      await revertSnapshot(snapshotId);
    });

  }
);
