const MCR = artifacts.require('MCR');
const PoolData = artifacts.require('PoolDataMock');
const NXMToken = artifacts.require('NXMToken');
const TokenFunctions = artifacts.require('TokenFunctionMock');
const TokenController = artifacts.require('TokenController');
const TokenData = artifacts.require('TokenDataMock');
const NXMaster = artifacts.require('NXMaster');
const Pool1 = artifacts.require('Pool1Mock');
const MemberRoles = artifacts.require('MemberRoles');
const Governance = artifacts.require('Governance');

const { ether, toHex, toWei } = require('./utils/ethTools');
const { assertRevert } = require('./utils/assertRevert');
const { increaseTimeTo } = require('./utils/increaseTime');
const { latestTime } = require('./utils/latestTime');
const CA_ETH = '0x45544800';
const expectEvent = require('./utils/expectEvent');
const gvProp = require('./utils/gvProposal.js').gvProposal;
const encode = require('./utils/encoder.js').encode;
const getValue = require('./utils/getMCRPerThreshold.js').getValue;

const ETH = '0x455448';

let P1;
let nxms;
let pd;
let tk;
let tf;
let tc;
let td;
let mr;
const BN = web3.utils.BN;
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('NXMToken', function([
  owner,
  member1,
  member2,
  member3,
  notMember,
  spender2,
  govVoter1,
  govVoter2,
  govVoter3,
  govVoter4
]) {
  const fee = ether(0.002);
  const tokenAmount = ether(2);
  const tokens = ether(1);
  const initialFounderTokens = new web3.utils.BN(toWei(1500000));

  before(async function() {
    tk = await NXMToken.deployed();
    tf = await TokenFunctions.deployed();
    td = await TokenData.deployed();
    P1 = await Pool1.deployed();
    mcr = await MCR.deployed();
    pd = await PoolData.deployed();
    nxms = await NXMaster.deployed();
    tc = await TokenController.at(await nxms.getLatestAddress(toHex('TC')));
    mr = await MemberRoles.at(await nxms.getLatestAddress('0x4d52'));
    await mr.addMembersBeforeLaunch([], []);
    (await mr.launched()).should.be.equal(true);
    // await mr.payJoiningFee(web3.eth.accounts[0], {
    //   from: web3.eth.accounts[0],
    //   value: fee
    // });
    // await mr.kycVerdict(web3.eth.accounts[0], true);
    const Web3 = require('web3');
    const web3 = new Web3(
      new Web3.providers.HttpProvider('http://localhost:8545')
    );
    for (let itr = 6; itr < 9; itr++) {
      await mr.payJoiningFee(web3.eth.accounts[itr], {
        from: web3.eth.accounts[itr],
        value: fee
      });
      await mr.kycVerdict(web3.eth.accounts[itr], true);
      let isMember = await nxms.isMember(web3.eth.accounts[itr]);
      isMember.should.equal(true);

      await tk.transfer(web3.eth.accounts[itr], toWei(37500));
    }
  });

  describe('token details', function() {
    it('3.1 should return correct symbol', async function() {
      const symbol = 'NXM';
      symbol.should.equal(await tk.symbol());
    });
    it('3.2 should return correct total Supply', async function() {
      const ts = await tk.totalSupply();
      ts.toString().should.be.equal(initialFounderTokens.toString());
    });
    it('3.3 should return non zero token price', async function() {
      (await tf.getTokenPrice(ETH))
        .toString()
        .should.be.not.equal((0).toString());
    });
    it('3.4 should return correct decimals', async function() {
      const decimals = 18;
      decimals.toString().should.be.equal((await tk.decimals()).toString());
    });
    it('3.5 should return zero available balance for non member', async function() {
      (await tk.balanceOf(notMember))
        .toString()
        .should.be.equal((0).toString());
    });
  });

  describe('buying tokens', function() {
    before(async function() {
      await mr.payJoiningFee(member1, { from: member1, value: fee });
      await mr.kycVerdict(member1, true);
    });
    it('3.6 should not able to buy tokens if not member', async function() {
      await assertRevert(P1.buyToken({ from: notMember, value: tokenAmount }));
    });
    it('3.7 should be able to buy tokens if member', async function() {
      await P1.buyToken({ from: member1, value: tokenAmount });
      (await tk.balanceOf(member1))
        .toString()
        .should.be.not.equal((0).toString());
    });
  });

  describe('balanceOf', function() {
    describe('when the requested account is a member and has no tokens', function() {
      it('3.8 returns zero', async function() {
        await mr.payJoiningFee(member2, { from: member2, value: fee });
        await mr.kycVerdict(member2, true);
        (await tk.balanceOf(member2))
          .toString()
          .should.be.equal((0).toString());
      });
    });
    describe('when the requested account is a member and has some tokens', function() {
      beforeEach(async function() {});
      it('3.9 returns the non zero amount of tokens', async function() {
        (await tk.balanceOf(member1))
          .toString()
          .should.be.not.equal((0).toString());
      });
    });
    describe('when the requested account is not a member', function() {
      it('3.10 returns zero', async function() {
        (await tk.balanceOf(notMember))
          .toString()
          .should.be.equal((0).toString());
      });
    });
  });

  describe('transfer', function() {
    const transferTokens = ether(1);
    before(async function() {
      tk.transfer(member1, ether(26), { from: govVoter1 });
    });

    describe('when the recipient is a member', function() {
      const to = notMember;

      describe('when the sender is not a member', function() {
        const to = member1;
        it('3.11 reverts', async function() {
          await assertRevert(
            tk.transfer(to, transferTokens, { from: notMember })
          );
        });
      });

      describe('when the sender is a member', function() {
        const to = member2;
        describe('when the sender does not have enough balance', function() {
          it('3.12 reverts', async function() {
            await assertRevert(
              tk.transfer(to, await tk.totalSupply(), { from: member1 })
            );
          });
        });

        describe('when the sender does have enough balance', function() {
          it('3.13 transfers the requested amount', async function() {
            await tk.transfer(to, transferTokens, { from: member1 });
            (await tk.balanceOf(member2))
              .toString()
              .should.be.not.equal((0).toString());
          });

          it('3.14 emits a transfer event', async function() {
            const { logs } = await tk.transfer(to, transferTokens, {
              from: member1
            });
            const event = expectEvent.inLogs(logs, 'Transfer', {
              from: member1,
              to: member2
            });

            event.args.value
              .toString()
              .should.be.equal(transferTokens.toString());
          });
        });
      });
    });

    describe('when the recipient is not a member', function() {
      it('3.15 reverts', async function() {
        to = notMember;
        await assertRevert(tk.transfer(to, transferTokens, { from: member1 }));
      });
    });
  });

  describe('approve', function() {
    describe('when the sender is a member', function() {
      const spender = member2;
      describe('when approve amount is less than balance of sender', function() {
        const approveTokens = ether(2);
        it('3.16 approves the requested amount', async function() {
          await tk.approve(spender, approveTokens, { from: member1 });
          (await tk.allowance(member1, spender))
            .toString()
            .should.be.equal(approveTokens.toString());
        });
      });
      describe('when approve amount is more than balance of sender', function() {
        it('3.17 approves the requested amount', async function() {
          const approveTokens = new BN(
            (await tk.balanceOf(member1)).toString()
          ).add(new BN(toWei(1).toString()));
          tk.approve(spender2, approveTokens, { from: member1 });
          (await tk.allowance(member1, spender2))
            .toString()
            .should.be.equal(approveTokens.toString());
        });
      });
    });

    describe('when sender is not a member', function() {
      const spender = member2;
      const approveTokens = ether(2);

      it('3.18 approves the requested amount', async function() {
        await tk.approve(spender, approveTokens, { from: notMember });
        (await tk.allowance(notMember, spender))
          .toString()
          .should.be.equal(approveTokens.toString());
      });
    });
  });

  describe('transfer from', function() {
    const sender = member1;
    const spender = member2;
    const to = member3;

    before(async function() {
      await mr.payJoiningFee(member3, { from: member3, value: fee });
      await mr.kycVerdict(member3, true);
    });

    describe('when the spender is not a member', function() {
      it('3.19 reverts', async function() {
        await assertRevert(tk.transferFrom(sender, to, 1, { from: notMember }));
      });
    });

    describe('when the spender is a member', function() {
      describe('when the sender is not a member', function() {
        it('3.20 reverts', async function() {
          await assertRevert(
            tk.transferFrom(notMember, to, 1, { from: spender })
          );
        });
      });

      describe('when the sender is a member', function() {
        describe('when the recipient is not a member', function() {
          it('3.21 reverts', async function() {
            await assertRevert(
              tk.transferFrom(sender, notMember, 1, { from: spender })
            );
          });
        });
        describe('when the recipient is a member', function() {
          describe('when the sender has enough balance', function() {
            const amount = ether(1.6);
            beforeEach(async function() {
              await tk.approve(spender, amount, { from: sender });
              await tk.transfer(sender, ether(50), { from: govVoter1 });
            });

            it('3.22 transfers the requested amount', async function() {
              const initialTokenBalance = await tk.balanceOf(sender);
              await tk.transferFrom(sender, to, amount, { from: spender });

              (await tk.balanceOf(sender))
                .toString()
                .should.be.equal(
                  new BN(initialTokenBalance.toString())
                    .sub(new BN(amount.toString()))
                    .toString()
                );
              (await tk.balanceOf(to))
                .toString()
                .should.be.equal(amount.toString());
            });

            it('3.23 decreases the spender allowance', async function() {
              await tk.transferFrom(sender, to, amount, { from: spender });

              (await tk.allowance(sender, spender))
                .toString()
                .should.be.equal((0).toString());
            });

            it('3.24 emits a transfer event', async function() {
              const { logs } = await tk.transferFrom(sender, to, amount, {
                from: spender
              });

              logs.length.should.equal(1);
              logs[0].event.should.equal('Transfer');
              logs[0].args.from.should.equal(sender);
              logs[0].args.to.should.equal(to);
              logs[0].args.value.toString().should.be.equal(amount.toString());
            });
          });

          describe('when the sender does not have enough balance', function() {
            it('3.25 reverts', async function() {
              const amount = await tk.balanceOf(sender);
              await assertRevert(
                tk.transferFrom(
                  sender,
                  to,
                  new BN(amount.toString()).add(new BN(toWei(1).toString())),
                  {
                    from: spender
                  }
                )
              );
            });
          });

          describe('when the spender does not have enough approved balance', function() {
            beforeEach(async function() {
              await tk.approve(spender, ether(1.5), { from: owner });
            });
            const amount = ether(1.6);
            it('3.26 reverts', async function() {
              await assertRevert(
                tk.transferFrom(sender, to, amount, { from: spender })
              );
            });
          });
        });
        describe('when the recipient is ZERO_ADDRESS', function() {
          const amount = ether(1.6);
          let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
          beforeEach(async function() {
            await tk.approve(spender, amount, { from: sender });
            await tk.transfer(sender, ether(50), { from: govVoter1 });
          });
          it('3.27 reverts', async function() {
            await assertRevert(
              tk.transferFrom(sender, ZERO_ADDRESS, amount, { from: spender })
            );
          });
        });
      });
    });
  });

  describe('Sell Tokens', function() {
    const sellTokens = ether(0.002);
    it('3.28 should able to sell tokens', async function() {
      await tk.approve(tc.address, sellTokens, { from: member1 });
      const initialTokenBalance = await tk.balanceOf(member1);
      const sellTokensWorth = await P1.getWei(sellTokens);
      const initialPoolBalance = await web3.eth.getBalance(P1.address);
      const initialTotalSupply = await tk.totalSupply();
      await P1.sellNXMTokens(sellTokens, { from: member1 });
      const newPoolBalance = new BN(initialPoolBalance.toString()).sub(
        new BN(sellTokensWorth.toString())
      );
      const newTokenBalance = new BN(initialTokenBalance.toString()).sub(
        new BN(sellTokens.toString())
      );
      const newTotalSupply = new BN(initialTotalSupply.toString()).sub(
        new BN(sellTokens.toString())
      );
      newTokenBalance
        .toString()
        .should.be.equal((await tk.balanceOf(member1)).toString());
      newTotalSupply
        .toString()
        .should.be.equal((await tk.totalSupply()).toString());
      newPoolBalance
        .toString()
        .should.be.equal((await web3.eth.getBalance(P1.address)).toString());
    });

    it('3.29 should not be to sell tokens more than balance', async function() {
      const tokenBalance = await tk.balanceOf(member1);
      await assertRevert(
        P1.sellNXMTokens(
          new BN(tokenBalance.toString()).add(new BN(toWei(1).toString())),
          { from: member1 }
        )
      );
    });

    it('3.30 should not be to sell tokens more than maxSellTokens', async function() {
      const maxSellTokens = await mcr.getMaxSellTokens({ from: member1 });
      await assertRevert(
        P1.sellNXMTokens(
          new BN(maxSellTokens.toString()).add(new BN(toWei(1).toString())),
          { from: member1 }
        )
      );
    });
  });

  describe('Burn', function() {
    describe('Tokens Less than balance', function() {
      it('3.31 should be able to burn tokens', async function() {
        const { logs } = await tk.burn(tokens, { from: member1 });
        const event = expectEvent.inLogs(logs, 'Transfer', {
          from: member1
        });
        await event.args.value.toString().should.be.equal(tokens.toString());
      });
    });

    describe('Tokens more than balance', function() {
      it('3.32 reverts', async function() {
        const burnAmount = await tk.totalSupply();
        await assertRevert(tk.burn(burnAmount, { from: member1 }));
      });
    });
  });

  describe('Misc', function() {
    describe('Buy Tokens at zero price', function() {
      before(async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode('updateUintParameters(bytes8,uint)', toHex('A'), 0);
        await gvProp(25, actionHash, oldMR, oldGv, 2);
        let val = await pd.getUintParameters(toHex('A'));
        (val[1] / 1).should.be.equal(0);
        // await pd.changeA(0, { from: owner });
        await mcr.addMCRData(
          await getValue(toWei(2), pd, mcr),
          0,
          toWei(2),
          ['0x455448', '0x444149'],
          [100, 15517],
          20190219
        );
      });
      it('3.33 reverts', async function() {
        const initialTokenBalance = await tk.balanceOf(member1);
        await assertRevert(P1.buyToken({ from: member1, value: tokenAmount }));
        (await tk.balanceOf(member1))
          .toString()
          .should.be.equal(initialTokenBalance.toString());
      });
    });

    describe('Emergency Pause', function() {
      before(async function() {
        await nxms.addEmergencyPause(true, '0x4142');
      });

      after(async function() {
        await nxms.addEmergencyPause(false, '0x4142');
      });
    });

    describe('Setter functions', function() {
      it('3.34 should be able to change joining fee', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('JOINFEE'),
          1
        );
        await gvProp(21, actionHash, oldMR, oldGv, 2);
        let val = await td.getUintParameters(toHex('JOINFEE'));
        val[1].toString().should.be.equal((1).toString());
      });
      it('3.35 should be able to change BookTime', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('CABOOKT'),
          1
        );
        await gvProp(21, actionHash, oldMR, oldGv, 2);
        let val = await td.getUintParameters(toHex('CABOOKT'));
        val[1].toString().should.be.equal((1).toString());
      });
      it('3.36 should be able to change lockCADays', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('CALOCKT'),
          1
        );
        await gvProp(21, actionHash, oldMR, oldGv, 2);
        let val = await td.getUintParameters(toHex('CALOCKT'));
        val[1].toString().should.be.equal((1).toString());
      });
      it('3.37 should be able to change SCValidDays', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('RALOCKT'),
          1
        );
        await gvProp(21, actionHash, oldMR, oldGv, 2);
        let val = await td.getUintParameters(toHex('RALOCKT'));
        val[1].toString().should.be.equal((1).toString());
      });
      it('3.38 should be able to change LockTokenTimeAfterCoverExp', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('QUOLOCKT'),
          1
        );
        await gvProp(20, actionHash, oldMR, oldGv, 2);
        let val = await td.getUintParameters(toHex('QUOLOCKT'));
        val[1].toString().should.be.equal((1).toString());
      });
      // it('3.39 should be able to change CanAddMemberAddress', async function() {
      //   await assertRevert(
      //     tf.changeCanAddMemberAddress(member1, { from: member1 })
      //   );
      //   await tf.changeCanAddMemberAddress(member1, { from: owner });
      // });

      it('3.40 only governance call should be able to change MVDays', async function() {
        let oldMR = await MemberRoles.at(
          await nxms.getLatestAddress(toHex('MR'))
        );
        let oldGv = await Governance.at(
          await nxms.getLatestAddress(toHex('GV'))
        );
        actionHash = encode(
          'updateUintParameters(bytes8,uint)',
          toHex('MVLOCKT'),
          1
        );
        await gvProp(21, actionHash, oldMR, oldGv, 2);
        let val = await td.getUintParameters(toHex('MVLOCKT'));
        val[1].toString().should.be.equal((1).toString());
      });
    });
  });
});
