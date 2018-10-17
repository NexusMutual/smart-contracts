const MCR = artifacts.require('MCR');
const MCRDataMock = artifacts.require('MCRDataMock');
const MemberRoles = artifacts.require('MemberRoles');
const NXMToken1 = artifacts.require('NXMToken1');
const NXMToken2 = artifacts.require('NXMToken2');
const NXMTokenData = artifacts.require('NXMTokenData');
const NXMaster = artifacts.require('NXMaster');
const Pool1 = artifacts.require('Pool1');

const { ether } = require('./utils/ether');
const { assertRevert } = require('./utils/assertRevert');
const { increaseTimeTo, duration } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const expectEvent = require('./utils/expectEvent');

const ETH = '0x455448';
const BurnEvent = '0x4275726e';

let nxmtk2;
let nxmtk1;
let nxmtd;
let P1;
let nxms;
let mcr;
let mcrd;

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken', function([owner, member1, member2, member3, notMember]) {
  const fee = ether(0.002);
  const tokenAmount = ether(2);
  const tokens = ether(1);
  const P_18 = new BigNumber(1e18);
  const initialFounderTokens = new BigNumber(15e23);

  before(async function() {
    nxmtk1 = await NXMToken1.deployed();
    nxmtk2 = await NXMToken2.deployed();
    nxmtd = await NXMTokenData.deployed();
    P1 = await Pool1.deployed();
    mcr = await MCR.deployed();
    mcrd = await MCRDataMock.deployed();
    nxms = await NXMaster.deployed();
  });

  describe('token details', function() {
    it('should return correct symbol', async function() {
      const symbol = 'NXM';
      symbol.should.equal(await nxmtk1.symbol());
    });
    it('should return correct total Supply', async function() {
      const ts = await nxmtk1.totalSupply();
      ts.should.be.bignumber.equal(initialFounderTokens);
    });
    it('should return non zero token price', async function() {
      (await nxmtk2.getTokenPrice(ETH)).should.be.bignumber.not.equal(0);
    });
    it('should return correct decimals', async function() {
      const decimals = 18;
      decimals.should.be.bignumber.equal(await nxmtk1.decimals());
    });
    it('should return zero available balance for non member', async function() {
      (await nxmtk1.getAvailableTokens(notMember)).should.be.bignumber.equal(0);
    });
  });

  describe('buying tokens', function() {
    before(async function() {
      await nxmtk2.payJoiningFee(member1, { from: member1, value: fee });
      await nxmtk2.kycVerdict(member1, true);
    });
    it('should not able to buy tokens if not member', async function() {
      await assertRevert(
        P1.buyTokenBegin({ from: notMember, value: tokenAmount })
      );
    });
    it('should be able to buy tokens if member', async function() {
      await P1.buyTokenBegin({ from: member1, value: tokenAmount });
      (await nxmtk1.balanceOf(member1)).should.be.bignumber.not.equal(0);
    });
  });

  describe("Founder's tokens", function() {
    it('should return current initial tokens', async function() {
      (await nxmtd.getInitialFounderTokens()).should.be.bignumber.equal(
        initialFounderTokens
      );
    });
    it('should be able to change initial token', async function() {
      await assertRevert(
        nxmtd.changeIntialTokens(initialFounderTokens.plus(tokens), {
          from: notMember
        })
      );
      await nxmtd.changeIntialTokens(0, { from: owner });
      await nxmtd.changeIntialTokens(initialFounderTokens.plus(tokens));
      (await nxmtd.getInitialFounderTokens()).should.be.bignumber.equal(
        initialFounderTokens.plus(tokens)
      );
    });
    describe('if owner', function() {
      it('should be able to allocate tokens using founders token', async function() {
        await nxmtk1.allocateFounderTokens(member1, tokens, {
          from: owner
        });
      });
      it('should add allocated tokens', async function() {
        (await nxmtd.getCurrentFounderTokens()).should.be.bignumber.equal(
          tokens
        );
      });
      it('should not be able to allocate FounderTokens more than current tokens', async function() {
        const initialCurrentFT = await nxmtd.getCurrentFounderTokens();
        await nxmtk1.allocateFounderTokens(
          member1,
          initialFounderTokens.plus(1e18),
          {
            from: owner
          }
        );
        (await nxmtd.getCurrentFounderTokens()).should.be.bignumber.equal(
          initialCurrentFT
        );
      });
    });
    describe('if not owner', function() {
      it('should not be able to allocate tokens using founders token', async function() {
        await assertRevert(
          nxmtk1.allocateFounderTokens(member1, tokens, { from: notMember })
        );
      });
    });
  });

  describe('balanceOf', function() {
    describe('when the requested account is a member and has no tokens', function() {
      it('returns zero', async function() {
        await nxmtk2.payJoiningFee(member2, { from: member2, value: fee });
        await nxmtk2.kycVerdict(member2, true);
        (await nxmtk1.balanceOf(member2)).should.be.bignumber.equal(0);
      });
    });
    describe('when the requested account is a member and has some tokens', function() {
      beforeEach(async function() {});
      it('returns the non zero amount of tokens', async function() {
        (await nxmtk1.balanceOf(member1)).should.be.bignumber.not.equal(0);
      });
    });
    describe('when the requested account is not a member', function() {
      it('returns zero', async function() {
        (await nxmtk1.balanceOf(notMember)).should.be.bignumber.equal(0);
      });
    });
  });

  describe('transfer', function() {
    const transferTokens = ether(1);
    describe('when the recipient is a member', function() {
      const to = notMember;

      describe('when the sender is not a member', function() {
        const to = member1;
        it('reverts', async function() {
          await assertRevert(
            nxmtk1.transfer(to, transferTokens, { from: notMember })
          );
        });
      });

      describe('when the sender is a member', function() {
        const to = member2;
        describe('when the sender does not have enough balance', function() {
          it('reverts', async function() {
            await assertRevert(
              nxmtk1.transfer(to, await nxmtk1.totalSupply(), { from: member1 })
            );
          });
        });

        describe('when transfer amount is zero', function() {
          it('reverts', async function() {
            await assertRevert(nxmtk1.transfer(to, 0, { from: member1 }));
          });
        });
        describe('when the sender does have enough balance', function() {
          it('transfers the requested amount', async function() {
            await nxmtk1.transfer(to, transferTokens, { from: member1 });
            (await nxmtk1.balanceOf(member2)).should.be.bignumber.not.equal(0);
          });

          it('emits a transfer event', async function() {
            const { logs } = await nxmtk1.transfer(to, transferTokens, {
              from: member1
            });
            const event = expectEvent.inLogs(logs, 'Transfer', {
              from: member1,
              to: member2
            });

            event.args.value.should.be.bignumber.equal(transferTokens);
          });
        });
      });
    });

    describe('when the recipient is not a member', function() {
      it('reverts', async function() {
        to = notMember;
        await assertRevert(
          nxmtk1.transfer(to, transferTokens, { from: member1 })
        );
      });
    });
  });

  describe('approve', function() {
    describe('when the sender is a member', function() {
      const spender = member2;
      describe('when approve amount is less than balance of sender', function() {
        const approveTokens = ether(2);
        it('approves the requested amount', async function() {
          await nxmtk1.approve(spender, approveTokens, { from: member1 });
          (await nxmtd.getAllowerSpenderAllowance(
            member1,
            spender
          )).should.be.bignumber.equal(approveTokens);
        });
      });
      describe('when approve amount is more than balance of sender', function() {
        it('approves the requested amount', async function() {
          const approveTokens = (await nxmtk1.totalBalanceOf(member1)).plus(
            1e18
          );
          nxmtk1.approve(spender, approveTokens, { from: member1 });
          (await nxmtd.getAllowerSpenderAllowance(
            member1,
            spender
          )).should.be.bignumber.equal(approveTokens);
        });
      });
    });

    describe('when sender is not a member', function() {
      const spender = member2;
      const approveTokens = ether(2);

      it('approves the requested amount', async function() {
        await nxmtk1.approve(spender, approveTokens, { from: notMember });
        (await nxmtd.getAllowerSpenderAllowance(
          notMember,
          spender
        )).should.be.bignumber.equal(approveTokens);
      });
    });
  });

  describe('transfer from', function() {
    const sender = member1;
    const spender = member2;
    const to = member3;

    before(async function() {
      await nxmtk2.payJoiningFee(member3, { from: member3, value: fee });
      await nxmtk2.kycVerdict(member3, true);
    });

    describe('when the spender is not a member', function() {
      it('reverts', async function() {
        await assertRevert(
          nxmtk1.transferFrom(sender, to, 1, { from: notMember })
        );
      });
    });

    describe('when the spender is a member', function() {
      describe('when the sender is not a member', function() {
        it('reverts', async function() {
          await assertRevert(
            nxmtk1.transferFrom(notMember, to, 1, { from: spender })
          );
        });
      });

      describe('when the sender is a member', function() {
        describe('when the recipient is not a member', function() {
          it('reverts', async function() {
            await assertRevert(
              nxmtk1.transferFrom(sender, notMember, 1, { from: spender })
            );
          });
        });
        describe('when the recipient is a member', function() {
          describe('when the sender has enough balance', function() {
            const amount = ether(1.6);
            beforeEach(async function() {
              await nxmtk1.approve(spender, amount, { from: sender });
            });

            it('transfers the requested amount', async function() {
              const initialTokenBalance = await nxmtk1.balanceOf(sender);
              await nxmtk1.transferFrom(sender, to, amount, { from: spender });

              (await nxmtk1.balanceOf(sender)).should.be.bignumber.equal(
                initialTokenBalance.minus(amount)
              );

              (await nxmtk1.balanceOf(to)).should.be.bignumber.equal(amount);
            });

            it('decreases the spender allowance', async function() {
              await nxmtk1.transferFrom(sender, to, amount, { from: spender });

              (await nxmtd.getAllowerSpenderAllowance(
                sender,
                spender
              )).should.be.bignumber.equal(0);
            });

            it('emits a transfer event', async function() {
              const { logs } = await nxmtk1.transferFrom(sender, to, amount, {
                from: spender
              });

              logs.length.should.equal(1);
              logs[0].event.should.equal('Transfer');
              logs[0].args.from.should.equal(sender);
              logs[0].args.to.should.equal(to);
              logs[0].args.value.should.be.bignumber.equal(amount);
            });
          });

          describe('when the sender does not have enough balance', function() {
            it('reverts', async function() {
              const amount = await nxmtk1.balanceOf(sender);
              await assertRevert(
                nxmtk1.transferFrom(sender, to, amount.plus(1e18), {
                  from: spender
                })
              );
            });
          });

          describe('when the spender does not have enough approved balance', function() {
            beforeEach(async function() {
              await nxmtk1.approve(spender, ether(1.5), { from: owner });
            });
            const amount = ether(1.6);
            it('reverts', async function() {
              await assertRevert(
                nxmtk1.transferFrom(sender, to, amount, { from: spender })
              );
            });
          });
        });
      });
    });
  });

  describe('Sell Tokens', function() {
    const sellTokens = ether(5);
    it('should able to sell tokens', async function() {
      const initialTokenBalance = await nxmtk1.totalBalanceOf(member1);
      const sellPrice = (await mcr.calculateTokenPrice(ETH)).times(
        new BigNumber(0.975)
      );
      const initialPoolBalance = await P1.getEtherPoolBalance();
      const initialTotalSupply = await nxmtd.totalSupply();
      const initialMemberETHBalance = await web3.eth.getBalance(member1);
      P1.sellNXMTokens(sellTokens, { from: member1 });
      const sellTokensWorth = sellPrice.times(sellTokens).div(P_18);
      const newPoolBalance = initialPoolBalance
        .minus(sellTokensWorth)
        .div(P_18)
        .toFixed(1);
      const newTokenBalance = initialTokenBalance.minus(sellTokens);
      const newTotalSupply = initialTotalSupply.minus(sellTokens);
      const newMemberETHBalance = initialMemberETHBalance
        .plus(sellTokensWorth)
        .div(P_18)
        .toFixed(0);
      newTokenBalance.should.be.bignumber.equal(
        await nxmtk1.totalBalanceOf(member1)
      );
      newTotalSupply.should.be.bignumber.equal(await nxmtd.totalSupply());
      newMemberETHBalance.should.be.bignumber.equal(
        (await web3.eth.getBalance(member1)).div(P_18).toFixed(0)
      );
      newPoolBalance.should.be.bignumber.equal(
        (await P1.getEtherPoolBalance()).div(P_18).toFixed(1)
      );
    });

    it('should not be to sell tokens more than balance', async function() {
      const tokenBalance = await nxmtk1.totalBalanceOf(member1);
      await assertRevert(
        P1.sellNXMTokens(tokenBalance.plus(1e18), { from: member1 })
      );
    });

    it('should not be to sell tokens more than maxSellTokens', async function() {
      const maxSellTokens = await mcr.getMaxSellTokens({ from: member1 });
      await assertRevert(
        P1.sellNXMTokens(maxSellTokens.plus(1e18), { from: member1 })
      );
    });
  });

  describe('Burn', function() {
    describe('Tokens Less than balance', function() {
      const amount = ether(1);
      let initialTokenBalance;
      let initialTotalSupply;
      before(async function() {
        initialTokenBalance = await nxmtk1.balanceOf(member1);
        initialTotalSupply = await nxmtk1.totalSupply();
        const { logs } = await nxmtk1.burnToken(member1, BurnEvent, 0, amount);
        this.logs = logs;
      });

      it('decrements totalSupply', async function() {
        const expectedSupply = initialTotalSupply.minus(amount);
        (await nxmtk1.totalSupply()).should.be.bignumber.equal(expectedSupply);
      });

      it('decrements member balance', async function() {
        const expectedBalance = initialTokenBalance.minus(amount);
        (await nxmtk1.balanceOf(member1)).should.be.bignumber.equal(
          expectedBalance
        );
      });

      it('emits Burn event', async function() {
        const event = expectEvent.inLogs(this.logs, 'Burn', {
          _of: member1
        });

        event.args.tokens.should.be.bignumber.equal(amount);
      });
    });

    describe('Tokens more than balance', function() {
      it('reverts', async function() {
        await assertRevert(
          nxmtk1.burnToken(member1, BurnEvent, 0, await nxmtk1.totalSupply())
        );
      });
    });
  });

  describe('Misc', function() {
    it('should not be able to change master address', async function() {
      await assertRevert(
        nxmtk1.changeMasterAddress(member1, { from: member1 })
      );
      await assertRevert(
        nxmtk2.changeMasterAddress(member1, { from: member1 })
      );
      await assertRevert(nxmtd.changeMasterAddress(member1, { from: member1 }));
    });

    it('should not able to call onlyInternal functions', async function() {
      await assertRevert(
        nxmtk1.changeDependentContractAddress({ from: member1 })
      );
      await assertRevert(
        nxmtk2.changeDependentContractAddress({ from: member1 })
      );
      await assertRevert(
        nxmtd.changeDependentContractAddress({ from: member1 })
      );
    });

    describe('Buy Tokens at zero price', function() {
      before(async function() {
        await mcrd.changeSF(0, { from: owner });
      });
      it('reverts', async function() {
        const initialTokenBalance = await nxmtk1.balanceOf(member1);
        await P1.buyTokenBegin({ from: member1, value: tokenAmount });
        (await nxmtk1.balanceOf(member1)).should.be.bignumber.equal(
          initialTokenBalance
        );
      });
    });

    describe('Emergency Pause', function() {
      before(async function() {
        await nxms.addEmergencyPause(true, '0x4142');
      });
      it('should not be to call paused functions', async function() {
        await assertRevert(nxmtk1.approve(member2, tokens, { from: member1 }));
      });
      after(async function() {
        await nxms.addEmergencyPause(false, '0x4142');
      });
    });

    describe('Misc', function() {
      it('should be able to change joining fee', async function() {
        await nxmtd.setJoiningfee(1);
        (await nxmtd.joiningFee()).should.be.bignumber.equal(1);
      });
      it('should be able to change MinVoteLockPeriod ', async function() {
        await nxmtd.changeMinVoteLockPeriod(1, { from: owner });
        (await nxmtd.getMinVoteLockPeriod()).should.be.bignumber.equal(1);
      });
      it('should be able to change BookTime', async function() {
        await nxmtd.changeBookTime(1, { from: owner });
        await nxmtd.pushBookedCA(member3, 2);
        await increaseTimeTo((await latestTime()) + 3);
        await nxmtd.getBookedCA(member3);
        (await nxmtd.getBookTime()).should.be.bignumber.equal(1);
      });
      it('should be able to change lockCADays', async function() {
        await nxmtd.setlockCADays(1);
        (await nxmtd.lockCADays()).should.be.bignumber.equal(1);
      });
      it('should be able to change SCValidDays', async function() {
        await nxmtd.changeSCValidDays(1);
        (await nxmtd.scValidDays()).should.be.bignumber.equal(1);
      });
      it('should be able to change LockTokenTimeAfterCoverExp', async function() {
        await nxmtd.setLockTokenTimeAfterCoverExp(1);
        (await nxmtd.lockTokenTimeAfterCoverExp()).should.be.bignumber.equal(1);
      });
      it('should be able to change CanAddMemberAddress', async function() {
        await assertRevert(
          nxmtk2.changeCanAddMemberAddress(member1, { from: member1 })
        );
        await nxmtk2.changeCanAddMemberAddress(member1, { from: owner });
      });
    });
  });

  //end of contract block
});
