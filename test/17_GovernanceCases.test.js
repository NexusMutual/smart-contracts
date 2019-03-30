const Governance = artifacts.require('GovernanceMock');
const ProposalCategory = artifacts.require('ProposalCategory');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const PoolData = artifacts.require('PoolData');
const EventCaller = artifacts.require('EventCaller');
const ClaimsReward = artifacts.require('ClaimsReward');
const TokenController = artifacts.require('TokenController');
const NXMToken = artifacts.require('NXMToken');
const expectEvent = require('./utils/expectEvent');
const gvProposal = require('./utils/gvProposal.js').gvProposal;
const assertRevert = require('./utils/assertRevert.js').assertRevert;
const increaseTime = require('./utils/increaseTime.js').increaseTime;
const encode = require('./utils/encoder.js').encode;
const AdvisoryBoard = '0x41420000';
const TokenFunctions = artifacts.require('TokenFunctionMock');

let tf;
let gv;
let cr;
let pc;
let mr;
let tc;
let pd;
let nxms;
let proposalId;
let pId;
let nxmToken;
let balance;
let status;
let voters;
let maxAllowance =
  '115792089237316195423570985008687907853269984665640564039457584007913129639935';

const CLA = '0x434c41';
const validity = 2592000;

contract(
  'Governance',
  ([
    ab1,
    ab2,
    ab3,
    ab4,
    ab5,
    mem1,
    mem2,
    mem3,
    mem4,
    mem5,
    mem6,
    mem7,
    mem8,
    mem9,
    mem10,
    mem11,
    mem12,
    notMember
  ]) => {
    before(async function() {
      nxms = await NXMaster.deployed();
      tf = await TokenFunctions.deployed();
      cr = await ClaimsReward.deployed();
      nxmToken = await NXMToken.deployed();
      let address = await nxms.getLatestAddress('GV');
      gv = await Governance.at(address);
      address = await nxms.getLatestAddress('PC');
      pc = await ProposalCategory.at(address);
      address = await nxms.getLatestAddress('MR');
      mr = await MemberRoles.at(address);
      tc = await TokenController.at(await nxms.getLatestAddress('TC'));
      // tc = await TokenController.deployed();
      pd = await PoolData.deployed();
      await mr.addInitialABMembers([ab2, ab3, ab4, ab5]);
      await nxmToken.approve(tc.address, maxAllowance);
      let bal = await nxmToken.balanceOf(ab1);
      // await tc.burnFrom(ab1, 1100000 * 1e18);
      // await nxmToken.transfer(notMember, 267600*1e18);
      let balances = [
        90000,
        60000,
        30000,
        30000,
        30000,
        1500,
        4500,
        7500,
        90000,
        75000,
        3000,
        0,
        0,
        75000,
        150000,
        240000,
        375000,
        238500
      ];
      await nxmToken.approve(cr.address, maxAllowance, {
        from: web3.eth.accounts[0]
      });
      // await mr.payJoiningFee(web3.eth.accounts[0], {
      //   value: 2000000000000000,
      //   from: web3.eth.accounts[0]
      // });
      // await mr.kycVerdict(web3.eth.accounts[0], true, {
      //   from: web3.eth.accounts[0]
      // });
      for (let i = 1; i < 18; i++) {
        await nxmToken.approve(cr.address, maxAllowance, {
          from: web3.eth.accounts[i]
        });
        if (i > 4) {
          await mr.payJoiningFee(web3.eth.accounts[i], {
            value: 2000000000000000,
            from: web3.eth.accounts[i]
          });
          await mr.kycVerdict(web3.eth.accounts[i], true, {
            from: web3.eth.accounts[0]
          });
        }
        await nxmToken.transfer(web3.eth.accounts[i], balances[i] * 1e18);
      }
      // await gv.delegateVote(ab1, { from: ab2 });
      await gv.delegateVote(ab1, { from: mem1 });
      await gv.delegateVote(ab1, { from: mem2 });
      await gv.delegateVote(ab3, { from: mem3 });
      await gv.delegateVote(mem4, { from: mem8 });
      await gv.delegateVote(mem5, { from: mem6 });
      await increaseTime(604800);
    });

    describe('Proposals which required white listing', function() {
      describe('And open for member vote.', function() {
        describe('When threshold is reached', function() {
          describe('Accepted by majority vote,', function() {
            describe('with no Automatic action', function() {
              it('17.1 Should create proposal', async function() {
                await increaseTime(604800);
                pId = (await gv.getProposalLength()).toNumber();
                await assertRevert(
                  gv.createProposalwithSolution(
                    'Proposal',
                    'Proposal',
                    'Proposal',
                    11,
                    'Changes to pricing model',
                    '0x'
                  )
                );
                await gv.createProposal(
                  'Proposal1',
                  'Proposal1',
                  'Proposal1',
                  0,
                  { from: mem1 }
                );
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[1].toNumber(), 2);
              });
              it('17.2 Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 11, 130 * 1e18);
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[2].toNumber(), 1);
              });
              it('17.3 Should open for voting', async function() {
                await gv.submitProposalWithSolution(
                  pId,
                  'changes to pricing model',
                  '0x',
                  { from: mem1 }
                );
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[3].toNumber(), 1);
                let action = await gv.getSolutionAction(pId, 1);
                assert.equal(action[1], '0x');
              });
              it('17.4 should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                let voteWeight = await gv.voteTallyData(pId, 1);
                assert.equal(voteWeight[1].toNumber(), 1);
                await gv.submitVote(pId, 1, { from: ab2 });
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: ab4 });
                await gv.submitVote(pId, 1, { from: ab5 });
                await gv.submitVote(pId, 0, { from: mem4 });
                await gv.submitVote(pId, 0, { from: mem5 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('17.5 Should not vote if cloing time of proposal is completed', async function() {
                await increaseTime(604810);
                await assertRevert(gv.submitVote(pId, 1, { from: mem9 }));
              });
              it('17.6 Should close vote', async function() {
                await increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('17.7 Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[4].toNumber(), 1);
              });
              it('17.8 Should get rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  assert.equal(
                    (await gv.getPendingReward(
                      web3.eth.accounts[i]
                    )).toNumber(),
                    10 * 1e18,
                    web3.eth.accounts[i] + "didn't get reward"
                  );
                }
              });
              it('17.9 Should claim rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  await cr.claimAllPendingReward([pId], {
                    from: web3.eth.accounts[i]
                  });
                }
              });
            });
            describe('with Valid Automatic action', function() {
              it('17.10 Should create proposal', async function() {
                await increaseTime(604800);
                balance = await web3.eth.getBalance(notMember);
                pId = (await gv.getProposalLength()).toNumber();
                await gv.createProposal(
                  'Proposal2',
                  'Proposal2',
                  'Proposal2',
                  0
                );
              });
              it('17.11 Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 12, 130 * 1e18);
              });
              it('17.12 Should open for voting', async function() {
                let actionHash = encode(
                  'transferEther(uint,address)',
                  '10000000000000000',
                  notMember
                );
                await gv.submitProposalWithSolution(
                  pId,
                  'Withdraw funds to Pay for Support Services',
                  actionHash
                );
              });
              it('17.13 should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                await gv.submitVote(pId, 1, { from: ab2 });
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: ab4 });
                await gv.submitVote(pId, 1, { from: ab5 });
                await gv.submitVote(pId, 0, { from: mem4 });
                await gv.submitVote(pId, 0, { from: mem5 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('17.14 Should close vote', async function() {
                await increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('17.15 Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
              });
              it('17.16 Should execute defined automatic action', async function() {
                let bal = await web3.eth.getBalance(notMember);
                assert.isAbove(
                  bal.toNumber(),
                  balance.toNumber(),
                  'Action not executed'
                );
              });
              it('17.17 Should get rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  assert.equal(
                    (await gv.getPendingReward(
                      web3.eth.accounts[i]
                    )).toNumber(),
                    10 * 1e18,
                    web3.eth.accounts[i] + "didn't get reward"
                  );
                }
              });
              it('17.18 Should claim rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  await cr.claimAllPendingReward([pId], {
                    from: web3.eth.accounts[i]
                  });
                }
              });
            });
            describe('with in valid Automatic action', function() {
              it('17.19 Should create proposal', async function() {
                await increaseTime(604800);
                balance = await web3.eth.getBalance(notMember);
                pId = (await gv.getProposalLength()).toNumber();
                await gv.createProposal(
                  'Proposal2',
                  'Proposal2',
                  'Proposal2',
                  0
                );
              });
              it('17.20 Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 12, 130 * 1e18);
              });
              it('17.21 Should open for voting', async function() {
                let actionHash = encode(
                  'transferEth(uint,address)',
                  '10000000000000000',
                  notMember
                );
                await gv.submitProposalWithSolution(
                  pId,
                  'Withdraw funds to Pay for Support Services',
                  actionHash
                );
              });
              it('17.22 should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                await gv.submitVote(pId, 1, { from: ab2 });
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: ab4 });
                await gv.submitVote(pId, 1, { from: ab5 });
                await gv.submitVote(pId, 0, { from: mem4 });
                await gv.submitVote(pId, 0, { from: mem5 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('17.23 Should close vote', async function() {
                await increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('17.24 Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
              });
              it('17.25 Should not execute defined automatic action', async function() {
                let bal = await web3.eth.getBalance(notMember);
                assert.equal(
                  bal.toNumber(),
                  balance.toNumber(),
                  'Action executed'
                );
              });
              it('17.26 Should get rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  assert.equal(
                    (await gv.getPendingReward(
                      web3.eth.accounts[i]
                    )).toNumber(),
                    10 * 1e18,
                    web3.eth.accounts[i] + "didn't get reward"
                  );
                }
              });
              it('17.27 Should claim rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  await cr.claimAllPendingReward([pId], {
                    from: web3.eth.accounts[i]
                  });
                }
              });
            });
          });
          describe('If Rejected', function() {
            it('17.28 Should create proposal', async function() {
              await increaseTime(604800);
              balance = await web3.eth.getBalance(notMember);
              pId = (await gv.getProposalLength()).toNumber();
              await gv.createProposal('Proposal3', 'Proposal3', 'Proposal3', 0);
            });
            it('17.29 Should whitelist proposal and set Incentives', async function() {
              await gv.categorizeProposal(pId, 12, 130 * 1e18);
            });
            it('17.30 Should open for voting', async function() {
              let actionHash = encode(
                'transferEther(uint,address)',
                '10000000000000000',
                notMember
              );
              await gv.submitProposalWithSolution(
                pId,
                'Withdraw funds to Pay for Support Services',
                actionHash
              );
            });
            it('17.31 should follow voting process', async function() {
              await gv.submitVote(pId, 0, { from: ab1 });
              await gv.submitVote(pId, 0, { from: ab2 });
              await gv.submitVote(pId, 1, { from: ab3 });
              await gv.submitVote(pId, 1, { from: ab4 });
              await gv.submitVote(pId, 0, { from: ab5 });
              await gv.submitVote(pId, 0, { from: mem4 });
              await gv.submitVote(pId, 0, { from: mem5 });
              await gv.submitVote(pId, 1, { from: mem7 });
            });
            it('17.32 Should close vote', async function() {
              await increaseTime(604800);
              await gv.closeProposal(pId);
            });
            it('17.33 Proposal should be rejected', async function() {
              let proposal = await gv.proposal(pId);
              assert.equal(proposal[2].toNumber(), 4, 'Incorrect result');
              let proposalsStatus = await gv.getStatusOfProposals();
              assert.equal(proposalsStatus[5].toNumber(), 1);
            });
            it('17.34 Should get rewards', async function() {
              for (let i = 0; i < 13; i++) {
                assert.equal(
                  (await gv.getPendingReward(web3.eth.accounts[i])).toNumber(),
                  10 * 1e18,
                  web3.eth.accounts[i] + " didn't get reward"
                );
              }
            });
            it('17.35 Should claim rewards', async function() {
              for (let i = 0; i < 13; i++) {
                await cr.claimAllPendingReward([pId], {
                  from: web3.eth.accounts[i]
                });
              }
            });
          });
        });
        describe('When threshold is not reached', function() {
          describe('Should consider AB voting', function() {
            describe('If AB majority reached', function() {
              describe('with no Automatic action', function() {
                it('Should create proposal', async function() {
                  pId = (await gv.getProposalLength()).toNumber();
                  await gv.createProposal(
                    'Proposal4',
                    'Proposal4',
                    'Proposal4',
                    0
                  );
                });
                it('17.37 Should whitelist proposal and set Incentives', async function() {
                  await gv.categorizeProposal(pId, 10, 140 * 1e18);
                });
                it('17.38 Should open for voting', async function() {
                  await gv.submitProposalWithSolution(
                    pId,
                    'Changes to capital model',
                    '0x'
                  );
                });
                it('17.39 Should follow voting process', async function() {
                  await gv.submitVote(pId, 1, { from: ab1 });
                  await gv.submitVote(pId, 1, { from: ab2 });
                  await gv.submitVote(pId, 1, { from: ab3 });
                  await gv.submitVote(pId, 1, { from: mem7 });
                });
                it('17.40 Should close vote', async function() {
                  await increaseTime(604800);
                  await gv.closeProposal(pId);
                });
                it('17.41 Proposal should be accepted', async function() {
                  let proposal = await gv.proposal(pId);
                  assert.equal(proposal[2].toNumber(), 3);
                });
                it('17.42 Should get rewards', async function() {
                  voters = [ab1, ab2, ab3, mem1, mem2, mem3, mem7];
                  for (let i = 0; i < voters.length; i++) {
                    assert.equal(
                      (await gv.getPendingReward(voters[i])).toNumber(),
                      20 * 1e18,
                      voters[i] + "didn't get reward"
                    );
                  }
                });
                it('17.43 Should claim rewards', async function() {
                  for (let i = 0; i < voters.length; i++) {
                    await cr.claimAllPendingReward([pId], { from: voters[i] });
                  }
                });
              });
              describe('with Automatic action', function() {
                it('17.44 Should create proposal', async function() {
                  await increaseTime(604800);
                  status = await pd.getInvestmentAssetDetails(
                    web3.toHex('DAI')
                  );
                  pId = (await gv.getProposalLength()).toNumber();
                  await gv.createProposal(
                    'Proposal5',
                    'Proposal5',
                    'Proposal5',
                    0
                  );
                });
                it('17.45 Should whitelist proposal and set Incentives', async function() {
                  await gv.categorizeProposal(pId, 15, 140 * 1e18);
                });
                it('17.46 Should open for voting', async function() {
                  let actionHash = encode(
                    'changeInvestmentAssetStatus(bytes4,bool)',
                    web3.toHex('DAI'),
                    false
                  );
                  await gv.submitProposalWithSolution(
                    pId,
                    'Investment Module – alter Investing Asset settings',
                    actionHash
                  );
                });
                it('17.47 should follow voting process', async function() {
                  await gv.submitVote(pId, 1, { from: ab3 });
                  await gv.submitVote(pId, 1, { from: ab4 });
                  await gv.submitVote(pId, 1, { from: ab5 });
                  await gv.submitVote(pId, 0, { from: mem5 });
                  await gv.submitVote(pId, 0, { from: mem7 });
                });
                it('17.48 Should close vote', async function() {
                  await increaseTime(604800);
                  await gv.closeProposal(pId);
                });
                it('17.49 Proposal should be accepted', async function() {
                  let proposal = await gv.proposal(pId);
                  assert.equal(proposal[2].toNumber(), 3);
                });
                it('17.50 Should execute defined automatic action', async function() {
                  let status1 = await pd.getInvestmentAssetDetails(
                    web3.toHex('DAI')
                  );
                  assert.notEqual(status[2], status1[2], 'Action not executed');
                });
                it('17.51 Should get rewards', async function() {
                  voters = [ab3, ab4, ab5, mem3, mem5, mem6, mem7];
                  for (let i = 0; i < voters.length; i++) {
                    assert.equal(
                      (await gv.getPendingReward(voters[i])).toNumber(),
                      20 * 1e18,
                      voters[i] + "didn't get reward"
                    );
                  }
                });
                it('17.52 Should claim rewards', async function() {
                  for (let i = 0; i < voters.length; i++) {
                    await cr.claimAllPendingReward([pId], { from: voters[i] });
                  }
                });
              });
            });
            describe('If AB majority not reached', function() {
              it('17.53 Should create proposal', async function() {
                pId = (await gv.getProposalLength()).toNumber();
                await gv.createProposal(
                  'Proposal6',
                  'Proposal6',
                  'Proposal6',
                  0
                );
              });
              it('17.54 Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 10, 140 * 1e18);
              });
              it('17.55 Should open for voting', async function() {
                await gv.submitProposalWithSolution(
                  pId,
                  'changes to capital model',
                  '0x'
                );
              });
              it('17.56 should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                await gv.submitVote(pId, 1, { from: ab2 });
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('17.57 Should close vote', async function() {
                await increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('17.58 Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
              });
              it('17.59 Should get rewards', async function() {
                voters = [ab1, ab2, ab3, mem1, mem2, mem3, mem7];
                for (let i = 0; i < voters.length; i++) {
                  assert.equal(
                    (await gv.getPendingReward(voters[i])).toNumber(),
                    20 * 1e18,
                    voters[i] + "didn't get reward"
                  );
                }
              });
              it('17.60 Should claim rewards', async function() {
                for (let i = 0; i < voters.length; i++) {
                  await cr.claimAllPendingReward([pId], { from: voters[i] });
                }
              });
            });
          });
        });
        describe('If none of the members voted', function() {
          it('17.61 Should create proposal', async function() {
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal(
              'Proposal12',
              'Proposal12',
              'Proposal12',
              0
            );
          });
          it('17.62 Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 10, 0);
          });
          it('17.63 Should not close proposal before opening for vote', async function() {
            let canClose = await gv.canCloseProposal(pId);
            assert.equal(canClose.toNumber(), 0);
            await assertRevert(gv.closeProposal(pId));
          });
          it('17.64 Should open for voting', async function() {
            await gv.submitProposalWithSolution(
              pId,
              'changes to capital model',
              '0x'
            );
          });
          it('17.65 Should not close proposal before time is completed', async function() {
            let canClose = await gv.canCloseProposal(pId);
            assert.equal(canClose.toNumber(), 0);
            await assertRevert(gv.closeProposal(pId));
          });
          it('17.65.2 Should close vote', async function() {
            await increaseTime(604805);
            let canClose = await gv.canCloseProposal(pId);
            assert.equal(canClose.toNumber(), 1);
            await gv.closeProposal(pId);
          });
          it('17.66 Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
        });
      });
      describe('And open for only AB vote.', function() {
        describe('If majority is reached', function() {
          it('17.67 Should create proposal', async function() {
            await nxmToken.approve(tc.address, maxAllowance, { from: mem9 });
            await tc.lock(CLA, 500 * 1e18, validity, { from: mem9 });
            console.log(
              'Tokens locked for claims assessment - ' +
                (await tc.tokensLocked(mem9, CLA))
            );
            await increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal('Proposal7', 'Proposal7', 'Proposal7', 0);
          });
          it('17.68 Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 8, 140 * 1e18);
          });
          it('17.69 Should open for voting', async function() {
            let actionHash = encode(
              'burnCAToken(uint,uint,address)',
              0,
              (500 * 1e18).toString(),
              mem9
            );
            await gv.submitProposalWithSolution(
              pId,
              'Burn claim assessor tokens',
              actionHash
            );
          });
          it('17.70 should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab1 });
            await gv.submitVote(pId, 1, { from: ab2 });
            assert.equal(await gv.canCloseProposal(pId), 0);
            await gv.submitVote(pId, 0, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
          });
          it('17.71 Should close vote', async function() {
            await increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('17.72 Proposal should be accepted', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 3);
          });
          it('17.73 Should execute defined automatic action', async function() {
            console.log(
              'Locked token balance after burning the tokens-' +
                (await tc.tokensLocked(mem9, CLA))
            );
            assert.equal((await tc.tokensLocked(mem9, CLA)).toNumber(), 0);
          });
          it('17.74 No reward should be distributed if voting is open only for Advisory Board', async function() {
            voters = [ab1, ab2, ab3, ab4, ab5];
            for (let i = 0; i < voters.length; i++) {
              assert.equal(
                (await gv.getPendingReward(voters[i])).toNumber(),
                0,
                'Incorrect reward distributed'
              );
            }
          });
        });
        describe('If majority is not reached', function() {
          it('17.75 Should create proposal', async function() {
            await nxmToken.approve(tc.address, maxAllowance, { from: mem9 });
            await tc.lock(CLA, 500 * 1e18, validity, { from: mem9 });
            console.log(
              'Tokens locked for claims assessment - ' +
                (await tc.tokensLocked(mem9, CLA))
            );
            await increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal('Proposal8', 'Proposal8', 'Proposal8', 0);
          });
          it('17.76 Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 8, 140 * 1e18);
          });
          it('17.77 Should open for voting', async function() {
            let actionHash = encode(
              'burnCAToken(uint,uint,address)',
              0,
              (500 * 1e18).toString(),
              mem9
            );
            await gv.submitProposalWithSolution(
              pId,
              'Burn claim assessor tokens',
              actionHash
            );
          });
          it('17.78 Should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab1 });
            await gv.submitVote(pId, 1, { from: ab2 });
            await gv.submitVote(pId, 0, { from: ab3 });
          });
          it('17.79 Should close vote', async function() {
            await increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('17.80 Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('17.81 Should not execute defined automatic action', async function() {
            console.log(
              'Locked token balance after burning the tokens-' +
                (await tc.tokensLocked(mem9, CLA))
            );
            assert.equal(
              (await tc.tokensLocked(mem9, CLA)).toNumber(),
              500 * 1e18
            );
          });
          it('17.82 No reward should be distributed if voting is open only for Advisory Board', async function() {
            voters = [ab1, ab2, ab3, ab4, ab5];
            for (let i = 0; i < voters.length; i++) {
              assert.equal(
                (await gv.getPendingReward(voters[i])).toNumber(),
                0,
                'Incorrect reward distributed'
              );
            }
          });
        });
      });
    });

    describe("Proposals which doesn't require white listing", function() {
      describe('Open for member vote', function() {
        describe('If threshold is reached', function() {
          it('17.83 Should create proposal with solution', async function() {
            await increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            let actionHash = encode('swapABMember(address,address)', mem9, ab5);
            let isAllowed = await gv.allowedToCreateProposal(17, {
              from: mem1
            });
            assert.equal(isAllowed, true);
            await gv.createProposalwithSolution(
              'Proposal9',
              'Proposal9',
              'Proposal9',
              16,
              'Swap AB Member',
              actionHash,
              { from: mem1 }
            );
          });
          it('17.84 should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
            await gv.submitVote(pId, 1, { from: mem4 });
            await gv.submitVote(pId, 0, { from: mem5 });
          });
          it('17.85 Should close vote', async function() {
            await increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('17.86 Proposal should be accepted', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 3);
          });
          it('17.87 Should execute defined automatic action', async function() {
            let roleCheck = await mr.checkRole(ab5, 1);
            assert.equal(roleCheck, false);
            let roleCheck1 = await mr.checkRole(mem9, 1);
            assert.equal(roleCheck1, true);
          });
          it('17.88 Should not get rewards if incentive is zero', async function() {
            voters = [ab3, ab4, ab5, mem3, mem4, mem5, mem6, mem7, mem8];
            for (let i = 0; i < voters.length; i++) {
              assert.equal(
                (await gv.getPendingReward(voters[i])).toNumber(),
                0,
                voters[i] + "didn't get reward"
              );
            }
            let temp = ab5;
            ab5 = mem9;
            mem9 = temp;
          });
        });
        describe('If threshold is not reached', function() {
          it('17.89 Should create proposal with solution', async function() {
            await increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            let actionHash = encode('swapABMember(address,address)', mem9, ab5);
            let isAllowed = await gv.allowedToCreateProposal(17, {
              from: mem1
            });
            assert.equal(isAllowed, true);
            await gv.createProposalwithSolution(
              'Proposal9',
              'Proposal9',
              'Proposal9',
              16,
              'Swap AB Member',
              actionHash,
              { from: mem1 }
            );
          });
          it('17.90 should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
          });
          it('17.91 Should close vote', async function() {
            await increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('17.92 Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('17.93 Should not execute defined automatic action', async function() {
            let roleCheck = await mr.checkRole(ab5, 1);
            assert.equal(roleCheck, true);
            let roleCheck1 = await mr.checkRole(mem9, 1);
            assert.equal(roleCheck1, false);
          });
          it('17.94 Should not get rewards if incentive is zero', async function() {
            voters = [ab3, ab4, ab5, mem3];
            for (let i = 0; i < voters.length; i++) {
              assert.equal(
                (await gv.getPendingReward(voters[i])).toNumber(),
                0,
                voters[i] + "didn't get reward"
              );
            }
          });
        });
        describe('If none of members have voted', function() {
          it('17.95 Should create proposal with solution', async function() {
            await increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            let actionHash = encode('swapABMember(address,address)', mem9, ab5);
            await gv.createProposalwithSolution(
              'Proposal11',
              'Proposal11',
              'Proposal11',
              16,
              'Swap AB Member',
              actionHash,
              { from: mem1 }
            );
          });
          it('17.96 Should close vote', async function() {
            await increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('17.97 Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('17.98 Should not execute defined automatic action', async function() {
            let roleCheck = await mr.checkRole(ab5, 1);
            assert.equal(roleCheck, true);
            let roleCheck1 = await mr.checkRole(mem9, 1);
            assert.equal(roleCheck1, false);
          });
        });
      });
    });

    describe('Special resolutions', function() {
      describe('Open for member vote', function() {
        describe('Accepted', function() {
          describe('with no Automatic action', function() {
            it('17.99 Should create proposal', async function() {
              await increaseTime(604800);
              pId = (await gv.getProposalLength()).toNumber();
              await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
            });
            it('17.100 Should whitelist proposal and set Incentives', async function() {
              await gv.categorizeProposal(pId, 19, 160 * 1e18);
            });
            it('17.101 Should open for voting', async function() {
              await gv.submitProposalWithSolution(
                pId,
                'changes to pricing model -Special',
                '0x'
              );
            });
            it('17.102 should follow voting process', async function() {
              await gv.submitVote(pId, 1, { from: ab1 });
              await gv.submitVote(pId, 1, { from: ab2 });
              await gv.submitVote(pId, 1, { from: ab3 });
              await gv.submitVote(pId, 1, { from: ab4 });
              await gv.submitVote(pId, 1, { from: ab5 });
              await gv.submitVote(pId, 1, { from: mem4 });
              await gv.submitVote(pId, 1, { from: mem5 });
              await gv.submitVote(pId, 1, { from: mem7 });
              await gv.submitVote(pId, 1, { from: mem10 });
              await gv.submitVote(pId, 1, { from: mem11 });
              await gv.submitVote(pId, 1, { from: mem12 });
            });
            it('17.103 Should close vote', async function() {
              await increaseTime(604800);
              await gv.closeProposal(pId);
            });
            it('17.104 Proposal should be accepted', async function() {
              let proposal = await gv.proposal(pId);
              assert.equal(proposal[2].toNumber(), 3);
            });
            it('17.105 Should claim rewards', async function() {
              for (let i = 0; i < 13; i++) {
                await cr.claimAllPendingReward([pId], {
                  from: web3.eth.accounts[i]
                });
              }
            });
          });
          describe('with Automatic action', function() {
            it('17.106 Add new category for special resolution', async function() {
              let pool1Address = await nxms.getLatestAddress('P1');
              let actionHash = encode(
                'addCategory(string,uint,uint,uint,uint[],uint,string,address,bytes2,uint[])',
                'Special Withdraw funds',
                2,
                75,
                75,
                [2],
                604800,
                'QmZQhJunZesYuCJkdGwejSATTR8eynUgV8372cHvnAPMaM',
                pool1Address,
                'P1',
                [0, 0, 0, 1]
              );
              pId = (await gv.getProposalLength()).toNumber();
              await gv.createProposalwithSolution(
                'New category',
                'proposal',
                'proposal',
                3,
                'For testing Special Resolution cases',
                actionHash
              );
              await gv.submitVote(pId, 1, { from: ab1 });
              await gv.submitVote(pId, 1, { from: ab2 });
              await gv.submitVote(pId, 1, { from: ab3 });
              await gv.submitVote(pId, 1, { from: ab4 });
              await gv.submitVote(pId, 1, { from: ab5 });
              await gv.closeProposal(pId);
              assert.equal((await pc.totalCategories()).toNumber(), 34);
            });
            it('17.107 Should create proposal', async function() {
              await increaseTime(604800);
              balance = await web3.eth.getBalance(notMember);
              pId = (await gv.getProposalLength()).toNumber();
              await gv.createProposal(
                'Proposal13',
                'Proposal13',
                'Proposal13',
                0
              );
            });
            it('17.108 Should whitelist proposal and set Incentives', async function() {
              await gv.categorizeProposal(pId, 33, 160 * 1e18);
            });
            it('17.109 Should open for voting', async function() {
              let actionHash = encode(
                'transferEther(uint,address)',
                '10000000000000000',
                notMember
              );
              await gv.submitProposalWithSolution(
                pId,
                'Withdraw funds to Pay for Support Services',
                actionHash
              );
            });
            it('17.110 should follow voting process', async function() {
              await gv.submitVote(pId, 1, { from: ab1 });
              await gv.submitVote(pId, 1, { from: ab2 });
              await gv.submitVote(pId, 1, { from: ab3 });
              await gv.submitVote(pId, 1, { from: ab4 });
              await gv.submitVote(pId, 1, { from: ab5 });
              await gv.submitVote(pId, 1, { from: mem4 });
              await gv.submitVote(pId, 1, { from: mem5 });
              await gv.submitVote(pId, 1, { from: mem7 });
              await gv.submitVote(pId, 1, { from: mem10 });
              await gv.submitVote(pId, 1, { from: mem11 });
              await gv.submitVote(pId, 1, { from: mem12 });
            });
            it('17.111 Should close vote', async function() {
              await increaseTime(604800);
              await gv.closeProposal(pId);
            });
            it('17.112 Should execute defined automatic action', async function() {
              let bal = await web3.eth.getBalance(notMember);
              assert.isAbove(
                bal.toNumber(),
                balance.toNumber(),
                'Action not executed'
              );
            });
          });
        });
        describe('Majority not reached', function() {
          it('17.113 Should create proposal', async function() {
            await increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
          });
          it('17.114 Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 19, 150 * 1e18);
          });
          it('17.115 Should open for voting', async function() {
            await gv.submitProposalWithSolution(
              pId,
              'changes to pricing model',
              '0x'
            );
          });
          it('17.116 should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab1 });
            await gv.submitVote(pId, 1, { from: ab2 });
            await gv.submitVote(pId, 1, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
            await gv.submitVote(pId, 1, { from: mem4 });
            await gv.submitVote(pId, 0, { from: mem5 });
            await gv.submitVote(pId, 1, { from: mem7 });
            await gv.submitVote(pId, 1, { from: mem10 });
            await gv.submitVote(pId, 1, { from: mem11 });
          });
          it('17.117 Should close vote', async function() {
            await increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('17.118 Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('17.119 Should not get rewards', async function() {
            for (let i = 0; i < 14; i++) {
              if (web3.eth.accounts[i] != mem9) {
                assert.isAbove(
                  (await gv.getPendingReward(web3.eth.accounts[i])).toNumber(),
                  0,
                  'Incorrect reward'
                );
              }
            }
          });
        });
      });
    });

    describe('Proposals which requires Owner voting', function() {
      describe('If Rejected', function() {
        it('17.120 Should create proposal', async function() {
          await increaseTime(604800);
          balance = await web3.eth.getBalance(notMember);
          pId = (await gv.getProposalLength()).toNumber();
          let actionHash = encode(
            'updateOwnerParameters(bytes8,address)',
            'OWNER',
            web3.eth.accounts[1]
          );
          await gv.createProposalwithSolution(
            'Proposal14',
            'Proposal14',
            'Proposal14',
            28,
            'Update owner parameters',
            actionHash
          );
        });
        it('17.121 Should Reject the proposal', async function() {
          await gv.submitVote(pId, 0);
        });
        it('17.122 Should execute defined automatic action', async function() {
          let isOwner = await nxms.isOwner(web3.eth.accounts[1]);
          assert.equal(isOwner, false, 'Action executed');
        });
      });
      describe('If Accepted', function() {
        it('17.123 Should create proposal', async function() {
          await increaseTime(604800);
          balance = await web3.eth.getBalance(notMember);
          pId = (await gv.getProposalLength()).toNumber();
          let actionHash = encode(
            'updateOwnerParameters(bytes8,address)',
            'OWNER',
            web3.eth.accounts[1]
          );
          await gv.createProposalwithVote(
            'Proposal14',
            'Proposal14',
            'Proposal14',
            28,
            'Update owner parameters',
            actionHash
          );
        });
        it('17.124 Should execute defined automatic action', async function() {
          await increaseTime(1000);
          let owner = await nxms.getOwnerParameters('OWNER');
          assert.equal(owner[1], web3.eth.accounts[1], 'Action not executed');
        });
      });
    });
  }
);
