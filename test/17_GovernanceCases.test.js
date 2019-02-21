const Governance = artifacts.require('Governance');
const ProposalCategory = artifacts.require('ProposalCategory');
const MemberRoles = artifacts.require('MemberRoles');
const NXMaster = artifacts.require('NXMaster');
const PoolData = artifacts.require('PoolData');
const EventCaller = artifacts.require('EventCaller');
const ClaimsReward = artifacts.require('ClaimsReward');
const TokenController = artifacts.require('TokenController');
const NXMToken = artifacts.require('NXMToken');
const expectEvent = require('./utils/expectEvent');
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
      tc = await TokenController.deployed();
      pd = await PoolData.deployed();
      await mr.addInitialABMembers([ab2, ab3, ab4, ab5]);
      await nxmToken.approve(tc.address, maxAllowance);
      let bal = await nxmToken.balanceOf(ab1);
      await tc.burnFrom(ab1, 1500000 * 1e18);
      // await nxmToken.transfer(notMember, 267600*1e18);
      let balances = [
        24000,
        16000,
        8000,
        8000,
        8000,
        400,
        1200,
        2000,
        24000,
        20000,
        800,
        0,
        0,
        20000,
        267600
      ];
      for (let i = 0; i < 15; i++) {
        await nxmToken.approve(cr.address, maxAllowance, {
          from: web3.eth.accounts[i]
        });
        await mr.payJoiningFee(web3.eth.accounts[i], {
          value: 2000000000000000,
          from: web3.eth.accounts[i]
        });
        await mr.kycVerdict(web3.eth.accounts[i], true, {
          from: web3.eth.accounts[i]
        });
        await tc.mint(web3.eth.accounts[i], balances[i] * 1e18);
      }
      await gv.delegateVote(ab1, { from: ab2 });
      await gv.delegateVote(ab1, { from: mem1 });
      await gv.delegateVote(ab1, { from: mem2 });
      await gv.delegateVote(ab3, { from: mem3 });
      await gv.delegateVote(mem4, { from: mem8 });
      await gv.delegateVote(mem5, { from: mem6 });
      increaseTime(604800);
    });

    describe('Proposals which required white listing', function() {
      describe('And open for member vote.', function() {
        describe('When threshold is reached', function() {
          describe('Accepted by majority vote,', function() {
            describe('with no Automatic action', function() {
              it('Should create proposal', async function() {
                increaseTime(604800);
                pId = (await gv.getProposalLength()).toNumber();
                await assertRevert(
                  gv.createProposalwithSolution(
                    'Proposal',
                    'Proposal',
                    'Proposal',
                    12,
                    'Changes to pricing model',
                    '0x'
                  )
                );
                await gv.createProposal(
                  'Proposal1',
                  'Proposal1',
                  'Proposal1',
                  0
                );
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[1].toNumber(), 2);
              });
              it('Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 12, 130 * 1e18);
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[2].toNumber(), 1);
              });
              it('Should open for voting', async function() {
                await gv.submitProposalWithSolution(
                  pId,
                  'changes to pricing model',
                  '0x'
                );
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[3].toNumber(), 1);
                let action = await gv.getSolutionAction(pId, 1);
                assert.equal(action[1], '0x');
              });
              it('should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                let voteWeight = await gv.voteTallyData(pId, 1);
                assert.equal(voteWeight[1].toNumber(), 2);
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: ab4 });
                await gv.submitVote(pId, 1, { from: ab5 });
                await gv.submitVote(pId, 0, { from: mem4 });
                await gv.submitVote(pId, 0, { from: mem5 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('Should close vote', async function() {
                increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
                let proposalsStatus = await gv.getStatusOfProposals();
                assert.equal(proposalsStatus[4].toNumber(), 1);
              });
              it('Should get rewards', async function() {
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
              it('Should claim rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  await cr.claimAllPendingReward([pId], {
                    from: web3.eth.accounts[i]
                  });
                }
              });
            });
            describe('with Automatic action', function() {
              it('Should create proposal', async function() {
                increaseTime(604800);
                balance = await web3.eth.getBalance(notMember);
                pId = (await gv.getProposalLength()).toNumber();
                await gv.createProposal(
                  'Proposal2',
                  'Proposal2',
                  'Proposal2',
                  0
                );
              });
              it('Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 13, 130 * 1e18);
              });
              it('Should open for voting', async function() {
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
              it('should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: ab4 });
                await gv.submitVote(pId, 1, { from: ab5 });
                await gv.submitVote(pId, 0, { from: mem4 });
                await gv.submitVote(pId, 0, { from: mem5 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('Should close vote', async function() {
                increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
              });
              it('Should execute defined automatic action', async function() {
                let bal = await web3.eth.getBalance(notMember);
                assert.isAbove(
                  bal.toNumber(),
                  balance.toNumber(),
                  'Action not executed'
                );
              });
              it('Should get rewards', async function() {
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
              it('Should claim rewards', async function() {
                for (let i = 0; i < 13; i++) {
                  await cr.claimAllPendingReward([pId], {
                    from: web3.eth.accounts[i]
                  });
                }
              });
            });
          });
          describe('If Rejected', function() {
            it('Should create proposal', async function() {
              increaseTime(604800);
              balance = await web3.eth.getBalance(notMember);
              pId = (await gv.getProposalLength()).toNumber();
              await gv.createProposal('Proposal3', 'Proposal3', 'Proposal3', 0);
            });
            it('Should whitelist proposal and set Incentives', async function() {
              await gv.categorizeProposal(pId, 13, 130 * 1e18);
            });
            it('Should open for voting', async function() {
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
            it('should follow voting process', async function() {
              await gv.submitVote(pId, 0, { from: ab1 });
              await gv.submitVote(pId, 1, { from: ab3 });
              await gv.submitVote(pId, 1, { from: ab4 });
              await gv.submitVote(pId, 0, { from: ab5 });
              await gv.submitVote(pId, 0, { from: mem4 });
              await gv.submitVote(pId, 0, { from: mem5 });
              await gv.submitVote(pId, 1, { from: mem7 });
            });
            it('Should close vote', async function() {
              increaseTime(604800);
              await gv.closeProposal(pId);
            });
            it('Proposal should be rejected', async function() {
              let proposal = await gv.proposal(pId);
              assert.equal(proposal[2].toNumber(), 4, 'Incorrect result');
              let proposalsStatus = await gv.getStatusOfProposals();
              assert.equal(proposalsStatus[5].toNumber(), 1);
            });
            it('Should get rewards', async function() {
              for (let i = 0; i < 13; i++) {
                assert.equal(
                  (await gv.getPendingReward(web3.eth.accounts[i])).toNumber(),
                  10 * 1e18,
                  web3.eth.accounts[i] + " didn't get reward"
                );
              }
            });
            it('Should claim rewards', async function() {
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
                it('Should whitelist proposal and set Incentives', async function() {
                  await gv.categorizeProposal(pId, 11, 140 * 1e18);
                });
                it('Should open for voting', async function() {
                  await gv.submitProposalWithSolution(
                    pId,
                    'Changes to capital model',
                    '0x'
                  );
                });
                it('Should follow voting process', async function() {
                  await gv.submitVote(pId, 1, { from: ab1 });
                  await gv.submitVote(pId, 1, { from: ab3 });
                  await gv.submitVote(pId, 1, { from: mem7 });
                });
                it('Should close vote', async function() {
                  increaseTime(604800);
                  await gv.closeProposal(pId);
                });
                it('Proposal should be accepted', async function() {
                  let proposal = await gv.proposal(pId);
                  assert.equal(proposal[2].toNumber(), 3);
                });
                it('Should get rewards', async function() {
                  voters = [ab1, ab2, ab3, mem1, mem2, mem3, mem7];
                  for (let i = 0; i < voters.length; i++) {
                    assert.equal(
                      (await gv.getPendingReward(voters[i])).toNumber(),
                      20 * 1e18,
                      voters[i] + "didn't get reward"
                    );
                  }
                });
                it('Should claim rewards', async function() {
                  for (let i = 0; i < voters.length; i++) {
                    await cr.claimAllPendingReward([pId], { from: voters[i] });
                  }
                });
              });
              describe('with Automatic action', function() {
                it('Should create proposal', async function() {
                  increaseTime(604800);
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
                it('Should whitelist proposal and set Incentives', async function() {
                  await gv.categorizeProposal(pId, 16, 140 * 1e18);
                });
                it('Should open for voting', async function() {
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
                it('should follow voting process', async function() {
                  await gv.submitVote(pId, 1, { from: ab3 });
                  await gv.submitVote(pId, 1, { from: ab4 });
                  await gv.submitVote(pId, 1, { from: ab5 });
                  await gv.submitVote(pId, 0, { from: mem5 });
                  await gv.submitVote(pId, 0, { from: mem7 });
                });
                it('Should close vote', async function() {
                  increaseTime(604800);
                  await gv.closeProposal(pId);
                });
                it('Proposal should be accepted', async function() {
                  let proposal = await gv.proposal(pId);
                  assert.equal(proposal[2].toNumber(), 3);
                });
                it('Should execute defined automatic action', async function() {
                  let status1 = await pd.getInvestmentAssetDetails(
                    web3.toHex('DAI')
                  );
                  assert.notEqual(status[2], status1[2], 'Action not executed');
                });
                it('Should get rewards', async function() {
                  voters = [ab3, ab4, ab5, mem3, mem5, mem6, mem7];
                  for (let i = 0; i < voters.length; i++) {
                    assert.equal(
                      (await gv.getPendingReward(voters[i])).toNumber(),
                      20 * 1e18,
                      voters[i] + "didn't get reward"
                    );
                  }
                });
                it('Should claim rewards', async function() {
                  for (let i = 0; i < voters.length; i++) {
                    await cr.claimAllPendingReward([pId], { from: voters[i] });
                  }
                });
              });
            });
            describe('If AB majority not reached', function() {
              it('Should create proposal', async function() {
                pId = (await gv.getProposalLength()).toNumber();
                await gv.createProposal(
                  'Proposal6',
                  'Proposal6',
                  'Proposal6',
                  0
                );
              });
              it('Should whitelist proposal and set Incentives', async function() {
                await gv.categorizeProposal(pId, 11, 140 * 1e18);
              });
              it('Should open for voting', async function() {
                await gv.submitProposalWithSolution(
                  pId,
                  'changes to capital model',
                  '0x'
                );
              });
              it('should follow voting process', async function() {
                await gv.submitVote(pId, 1, { from: ab1 });
                await gv.submitVote(pId, 1, { from: ab3 });
                await gv.submitVote(pId, 1, { from: mem7 });
              });
              it('Should close vote', async function() {
                increaseTime(604800);
                await gv.closeProposal(pId);
              });
              it('Proposal should be accepted', async function() {
                let proposal = await gv.proposal(pId);
                assert.equal(proposal[2].toNumber(), 3);
              });
              it('Should get rewards', async function() {
                voters = [ab1, ab2, ab3, mem1, mem2, mem3, mem7];
                for (let i = 0; i < voters.length; i++) {
                  assert.equal(
                    (await gv.getPendingReward(voters[i])).toNumber(),
                    20 * 1e18,
                    voters[i] + "didn't get reward"
                  );
                }
              });
              it('Should claim rewards', async function() {
                for (let i = 0; i < voters.length; i++) {
                  await cr.claimAllPendingReward([pId], { from: voters[i] });
                }
              });
            });
          });
        });
        describe('If none of the members voted', function() {
          it('Should create proposal', async function() {
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal(
              'Proposal12',
              'Proposal12',
              'Proposal12',
              0
            );
          });
          it('Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 11, 0);
          });
          it('Shpuld not close proposal before opening for vote', async function() {
            let canClose = await gv.canCloseProposal(pId);
            assert.equal(canClose.toNumber(), 0);
            await assertRevert(gv.closeProposal(pId));
          });
          it('Should open for voting', async function() {
            await gv.submitProposalWithSolution(
              pId,
              'changes to capital model',
              '0x'
            );
          });
          it('Should not close proposal before time is completed', async function() {
            let canClose = await gv.canCloseProposal(pId);
            assert.equal(canClose.toNumber(), 0);
            await assertRevert(gv.closeProposal(pId));
          });
          it('Should close vote', async function() {
            increaseTime(604805);
            let canClose = await gv.canCloseProposal(pId);
            assert.equal(canClose.toNumber(), 1);
            await gv.closeProposal(pId);
          });
          it('Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
        });
      });
      describe('And open for only AB vote.', function() {
        describe('If majority is reached', function() {
          it('Should create proposal', async function() {
            await nxmToken.approve(tc.address, maxAllowance, { from: mem9 });
            await tc.lock(CLA, 500 * 1e18, validity, { from: mem9 });
            console.log(
              'Tokens locked for claims assessment - ' +
                (await tc.tokensLocked(mem9, CLA))
            );
            increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal('Proposal7', 'Proposal7', 'Proposal7', 0);
          });
          it('Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 10, 140 * 1e18);
          });
          it('Should open for voting', async function() {
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
          it('should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab1 });
            await gv.submitVote(pId, 0, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
          });
          it('Should close vote', async function() {
            increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('Proposal should be accepted', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 3);
          });
          it('Should execute defined automatic action', async function() {
            console.log(
              'Locked token balance after burning the tokens-' +
                (await tc.tokensLocked(mem9, CLA))
            );
            assert.equal((await tc.tokensLocked(mem9, CLA)).toNumber(), 0);
          });
          it('No reward should be distributed if voting is open only for Advisory Board', async function() {
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
          it('Should create proposal', async function() {
            await nxmToken.approve(tc.address, maxAllowance, { from: mem9 });
            await tc.lock(CLA, 500 * 1e18, validity, { from: mem9 });
            console.log(
              'Tokens locked for claims assessment - ' +
                (await tc.tokensLocked(mem9, CLA))
            );
            increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            await gv.createProposal('Proposal8', 'Proposal8', 'Proposal8', 0);
          });
          it('Should whitelist proposal and set Incentives', async function() {
            await gv.categorizeProposal(pId, 10, 140 * 1e18);
          });
          it('Should open for voting', async function() {
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
          it('Should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab1 });
            await gv.submitVote(pId, 0, { from: ab3 });
          });
          it('Should close vote', async function() {
            increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('Should not execute defined automatic action', async function() {
            console.log(
              'Locked token balance after burning the tokens-' +
                (await tc.tokensLocked(mem9, CLA))
            );
            assert.equal(
              (await tc.tokensLocked(mem9, CLA)).toNumber(),
              500 * 1e18
            );
          });
          it('No reward should be distributed if voting is open only for Advisory Board', async function() {
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
          it('Should create proposal with solution', async function() {
            increaseTime(604800);
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
              17,
              'Swap AB Member',
              actionHash,
              { from: mem1 }
            );
          });
          it('should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
            await gv.submitVote(pId, 1, { from: mem4 });
            await gv.submitVote(pId, 0, { from: mem5 });
          });
          it('Should close vote', async function() {
            increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('Proposal should be accepted', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 3);
          });
          it('Should execute defined automatic action', async function() {
            let roleCheck = await mr.checkRole(ab5, 1);
            assert.equal(roleCheck, false);
            let roleCheck1 = await mr.checkRole(mem9, 1);
            assert.equal(roleCheck1, true);
          });
          it('Should not get rewards if incentive is zero', async function() {
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
          it('Should create proposal with solution', async function() {
            increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            let actionHash = encode('swapABMember(address,address)', mem9, ab5);
            await gv.createProposalwithSolution(
              'Proposal10',
              'Proposal10',
              'Proposal10',
              17,
              'Swap AB Member',
              actionHash,
              { from: mem1 }
            );
          });
          it('should follow voting process', async function() {
            await gv.submitVote(pId, 1, { from: ab3 });
            await gv.submitVote(pId, 1, { from: ab4 });
            await gv.submitVote(pId, 1, { from: ab5 });
          });
          it('Should close vote', async function() {
            increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('Should not execute defined automatic action', async function() {
            let roleCheck = await mr.checkRole(ab5, 1);
            assert.equal(roleCheck, true);
            let roleCheck1 = await mr.checkRole(mem9, 1);
            assert.equal(roleCheck1, false);
          });
          it('Should not get rewards if incentive is zero', async function() {
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
          it('Should create proposal with solution', async function() {
            increaseTime(604800);
            pId = (await gv.getProposalLength()).toNumber();
            let actionHash = encode('swapABMember(address,address)', mem9, ab5);
            await gv.createProposalwithSolution(
              'Proposal11',
              'Proposal11',
              'Proposal11',
              17,
              'Swap AB Member',
              actionHash,
              { from: mem1 }
            );
          });
          it('Should close vote', async function() {
            increaseTime(604800);
            await gv.closeProposal(pId);
          });
          it('Proposal should be denied', async function() {
            let proposal = await gv.proposal(pId);
            assert.equal(proposal[2].toNumber(), 6);
          });
          it('Should not execute defined automatic action', async function() {
            let roleCheck = await mr.checkRole(ab5, 1);
            assert.equal(roleCheck, true);
            let roleCheck1 = await mr.checkRole(mem9, 1);
            assert.equal(roleCheck1, false);
          });
        });
      });
    });

    describe('Special resultions', function() {
      describe('Open for member vote', function() {
        describe('Accepted', function() {
          describe('with no Automatic action', function() {
            it('Should create proposal', async function() {
              increaseTime(604800);
              pId = (await gv.getProposalLength()).toNumber();
              await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
            });
            it('Should whitelist proposal and set Incentives', async function() {
              await gv.categorizeProposal(pId, 18, 130 * 1e18);
            });
            it('Should open for voting', async function() {
              await gv.submitProposalWithSolution(
                pId,
                'changes to pricing model',
                '0x'
              );
            });
            it('should follow voting process', async function() {
              await gv.submitVote(pId, 1, { from: ab1 });
              await gv.submitVote(pId, 1, { from: ab3 });
              await gv.submitVote(pId, 1, { from: ab4 });
              await gv.submitVote(pId, 1, { from: ab5 });
              await gv.submitVote(pId, 1, { from: mem4 });
              await gv.submitVote(pId, 0, { from: mem5 });
              await gv.submitVote(pId, 1, { from: mem7 });
            });
            it('Should close vote', async function() {
              increaseTime(604800);
              await gv.closeProposal(pId);
            });
            it('Proposal should be accepted', async function() {
              let proposal = await gv.proposal(pId);
              assert.equal(proposal[2].toNumber(), 3);
            });
            it('Should get rewards', async function() {
              for (let i = 0; i < 14; i++) {
                if (web3.eth.accounts[i] != mem9) {
                  assert.equal(
                    (await gv.getPendingReward(
                      web3.eth.accounts[i]
                    )).toNumber(),
                    10 * 1e18,
                    web3.eth.accounts[i] + ' ' + i + " didn't get reward"
                  );
                }
              }
            });
            it('Should claim rewards', async function() {
              for (let i = 0; i < 14; i++) {
                if (web3.eth.accounts[i] != mem9) {
                  await cr.claimAllPendingReward([pId], {
                    from: web3.eth.accounts[i]
                  });
                }
              }
            });
          });
        });
      });
    });
  }
);
