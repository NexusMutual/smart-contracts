const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { Addresses, getSigner } = require('../utils');

const { parseEther, formatEther } = ethers;
const { ADVISORY_BOARD_MULTISIG } = Addresses;
const { BigIntMath } = nexus.helpers;

const WSTETH = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const ONE_DAY = 24n * 60n * 60n;
const CHANGE_SLASH_RECEIVER_DELAY = 3n * ONE_DAY;
const SUBNETWORK_1_ID = 0;
const SUBNETWORK_2_ID = 1;

describe('Symbiotic Tests', function () {
  // (dev mode) - uncomment before block and set TENDERLY_SNAPSHOT_ID in .env file
  // before(async function () {
  //   console.info('Network: ', network.name);
  //   if (network.name === 'tenderly') {
  //     const { TENDERLY_SNAPSHOT_ID } = process.env;
  //     if (TENDERLY_SNAPSHOT_ID) {
  //       console.info('Reverting to snapshot: ', TENDERLY_SNAPSHOT_ID);
  //       await revertToSnapshot(TENDERLY_SNAPSHOT_ID);
  //     } else {
  //       console.info('Snapshot ID: ', await takeSnapshot());
  //     }
  //   }
  // });

  // (dev mode) - unskip this test and set contract addresses from snapshot
  it.skip('load contracts and signers from snapshot', async function () {
    // aBIs
    const VAULT_ABI = [
      'function owner() external view returns (address)',
      'function collateral() external view returns (address)',
      'function delegator() external view returns (address)',
      'function slasher() external view returns (address)',
      'function burner() external view returns (address)',
      'function activeStake() external view returns (uint256)',
      'function deposit(address onBehalfOf,uint256 amount) external returns (uint256,uint256)',
      'function withdraw(address claimer,uint256 amount) external returns (uint256,uint256)',
      'function redeem(address claimer,uint256 shares) external returns (uint256,uint256)',
      'function claim(address recipient,uint256 epoch) external returns (uint256 amount)',
      'function withdrawalsOf(uint256 epoch,address account) external view returns (uint256)',
      'function activeBalanceOf(address account) external view returns (uint256)',
      'function slashableBalanceOf(address account) external view returns (uint256)',
      'function totalStake() external view returns (uint256)',
      'function currentEpoch() external view returns (uint256)',
      'function currentEpochStart() public view returns (uint48)',
      'function nextEpochStart() public view returns (uint48)',
      'function epochDuration() external view returns (uint48)',
    ];

    const DELEGATOR_ABI = [
      'function setMaxNetworkLimit(uint96 identifier,uint256 amount) external',
      'function setNetworkLimit(bytes32 subnetwork,uint256 amount) external',
      'function stake(bytes32 subnetwork,address operator) external view returns (uint256)',
      'function networkLimit(bytes32 subnetwork) public view returns (uint256)',
      'function maxNetworkLimit(bytes32 subnetwork) external view returns (uint256)',
    ];

    const SLASHER_ABI = [
      'function slash(bytes32 subnetwork,address operator,uint256 amount,uint48 captureTimestamp,bytes hints)',
      'function slashableStake(bytes32,address,uint48,bytes) external view returns (uint256)',
      'function vault() external view returns (address)',
    ];

    const BURNER_ROUTER_ABI = [
      'function triggerTransfer(address receiver) external returns (uint256 amount)',
      'function setGlobalReceiver(address receiver) external',
      'function setOperatorNetworkReceiver(address network,address operator,address receiver) external',
      'function operatorNetworkReceiver(address network, address operator) external view returns (address)',
      'function pendingOperatorNetworkReceiver(address,address) external view returns (address,uint48)',
      'function acceptOperatorNetworkReceiver(address network, address operator) external',
      'function balanceOf(address receiver) external view returns (uint256)',
      'function lastBalance() external view returns (uint256)',
      'function onSlash(bytes32 subnetwork, address operator, uint256 amount, uint48 captureTimestamp) external',
    ];

    const NETWORK_MIDDLEWARE_ABI = [
      'function setMiddleware(address middleware) external',
      'function middleware(address network) external view returns (address)',
    ];

    const SLASHER_HINTS_ABI = ['function slashHints(address,bytes32,address,uint48) external view returns (bytes)'];

    // contract addresses from snapshot
    const NETWORK_ADDRESS = ADVISORY_BOARD_MULTISIG;
    const VAULT_1_ADDR = '0x285Ef2547470dc830FB079cbe41B5eDFF56E5868';
    const VAULT_2_ADDR = '0xBA8bB5409a4E3ec92ea33f0A4a2872f1D2B9Ff52';
    const VAULT_3_ADDR = '0x99D7544BaF70D5Dc7356E48917809f5CAD8db4B4';
    const BURNER_ROUTER_ADDR = '0x4eDC2b02BCD3D8714391A795079b7b1c4893b5f5';
    const NETWORK_MIDDLEWARE_SERVICE = '0xD7dC9B366c027743D90761F71858BCa83C6899Ad';
    const SLASHER_HINTS_ADDR = '0x234148646D8C1762C793FD04385AfAD94998a4C7';

    // load vaults
    this.vault1 = await ethers.getContractAt(VAULT_ABI, VAULT_1_ADDR);
    this.vault2 = await ethers.getContractAt(VAULT_ABI, VAULT_2_ADDR);
    this.vault3 = await ethers.getContractAt(VAULT_ABI, VAULT_3_ADDR);
    this.vault1Addr = VAULT_1_ADDR;
    this.vault2Addr = VAULT_2_ADDR;
    this.vault3Addr = VAULT_3_ADDR;

    // load delegators and slashers from vaults
    const [delegator1Addr, slasher1Addr, delegator2Addr, slasher2Addr, delegator3Addr, slasher3Addr] =
      await Promise.all([
        this.vault1.delegator(),
        this.vault1.slasher(),
        this.vault2.delegator(),
        this.vault2.slasher(),
        this.vault3.delegator(),
        this.vault3.slasher(),
      ]);

    this.delegator1 = await ethers.getContractAt(DELEGATOR_ABI, delegator1Addr);
    this.delegator2 = await ethers.getContractAt(DELEGATOR_ABI, delegator2Addr);
    this.delegator3 = await ethers.getContractAt(DELEGATOR_ABI, delegator3Addr);

    this.slasher1 = await ethers.getContractAt(SLASHER_ABI, slasher1Addr);
    this.slasher2 = await ethers.getContractAt(SLASHER_ABI, slasher2Addr);
    this.slasher3 = await ethers.getContractAt(SLASHER_ABI, slasher3Addr);

    this.slasherHints = await ethers.getContractAt(SLASHER_HINTS_ABI, SLASHER_HINTS_ADDR);

    // burner router
    this.burnerRouter = await ethers.getContractAt(BURNER_ROUTER_ABI, BURNER_ROUTER_ADDR);
    this.burnerRouterAddr = BURNER_ROUTER_ADDR;

    // middleware
    this.middlewareService = await ethers.getContractAt(NETWORK_MIDDLEWARE_ABI, NETWORK_MIDDLEWARE_SERVICE);

    // wstETH token
    this.wstETH = await ethers.getContractAt('ERC20Mock', WSTETH);

    // uSDC token
    this.usdc = await ethers.getContractAt('ERC20Mock', USDC);

    // signers
    this.advisoryBoard = await getSigner(ADVISORY_BOARD_MULTISIG);
    [this.staker1] = await ethers.getSigners();
    // tenderly bug workaround
    this.staker2 = await getSigner('0x26e25C69035C31A1C81973f69c499986dC5e632D');
    this.staker3 = await getSigner('0xbaE4E275515a76c6f365d776804256F65f1e9fCf');
    this.staker4 = await getSigner('0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be');
    this.staker5 = await getSigner('0x90f79bf6eb2c4f870365e785982e1f101e93b906');
    this.staker6 = await getSigner('0x15d34aaf54267db7d7c367839aaf71a00a2c6a65');

    this.network = this.advisoryBoard;
    this.operator1 = this.advisoryBoard;
    this.middleware = this.advisoryBoard;
    this.burnerRouterOwner = this.advisoryBoard;
    this.vault1Admin = this.advisoryBoard;
    this.delegator1Admin = this.advisoryBoard;
    this.vault2Admin = this.advisoryBoard;
    this.delegator2Admin = this.advisoryBoard;

    // setup subnetwork (using subnetwork1 which has vault1 and vault2)
    this.subnetwork1 = ethers.solidityPacked(['address', 'uint96'], [NETWORK_ADDRESS, SUBNETWORK_1_ID]);
    this.subnetwork2 = ethers.solidityPacked(['address', 'uint96'], [NETWORK_ADDRESS, SUBNETWORK_2_ID]);

    console.log('Loaded contracts from snapshot:');
    console.log('  Vault 1:', this.vault1Addr);
    console.log('  Vault 2:', this.vault2Addr);
    console.log('  Vault 3:', this.vault3Addr);
    console.log('  BurnerRouter:', this.burnerRouterAddr);
  });

  describe('slash', function () {
    const WAD = 10n ** 18n;

    // capture state snapshot for logging
    async function captureSnapshot({ vaults = [], delegators = [], subnetworks = [], operators = [] }) {
      const snapshot = {
        receiver: await this.wstETH.balanceOf(ADVISORY_BOARD_MULTISIG),
        burner: await this.wstETH.balanceOf(this.burnerRouter.target),
        vaults: {},
      };

      for (let i = 0; i < vaults.length; i++) {
        const vault = vaults[i];
        const vaultName = `vault${i + 1}`;
        const [activeStake, totalStake, currentEpoch, currentEpochStart, nextEpochStart] = await Promise.all([
          vault.activeStake(),
          vault.totalStake(),
          vault.currentEpoch(),
          vault.currentEpochStart(),
          vault.nextEpochStart(),
        ]);

        snapshot.vaults[vaultName] = {
          activeStake,
          totalStake,
          queued: totalStake - activeStake,
          currentEpoch,
          currentEpochStart,
          nextEpochStart,
          delegated: {},
        };

        // capture delegated stakes for each subnetwork
        if (delegators[i] && subnetworks.length > 0 && operators.length > 0) {
          for (const subnetwork of subnetworks) {
            for (const operator of operators) {
              const [delegated, limit] = await Promise.all([
                delegators[i].stake(subnetwork, operator.address),
                delegators[i].networkLimit(subnetwork),
              ]);
              const key = `${subnetwork.slice(0, 10)}...${operator.address.slice(0, 8)}`;
              snapshot.vaults[vaultName].delegated[key] = { delegated, limit };
            }
          }
        }
      }

      return snapshot;
    }

    // print start summary
    function printStart(testName, snapshot, extras = {}) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`START: ${testName}`);
      console.log(`${'='.repeat(80)}`);
      if (extras.routes) {
        console.log(`Routes: ${extras.routes}`);
      }
      console.log(`Receiver: ${formatEther(snapshot.receiver)} | Burner: ${formatEther(snapshot.burner)}`);
      Object.entries(snapshot.vaults).forEach(([name, v]) => {
        console.log(
          `${name}: active=${formatEther(v.activeStake)} total=${formatEther(v.totalStake)} queued=${formatEther(
            v.queued,
          )} epoch=${v.currentEpoch}`,
        );
        Object.entries(v.delegated).forEach(([route, d]) => {
          console.log(`  ${route}: delegated=${formatEther(d.delegated)} limit=${formatEther(d.limit)}`);
        });
      });
      console.log(`${'='.repeat(80)}\n`);
    }

    // print end summary
    function printEnd(testName, before, after, slashData = {}) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`END: ${testName}`);
      console.log(`${'='.repeat(80)}`);

      Object.entries(before.vaults).forEach(([name, vBefore]) => {
        const vAfter = after.vaults[name];
        const activeDelta = vAfter.activeStake - vBefore.activeStake;
        const totalDelta = vAfter.totalStake - vBefore.totalStake;
        console.log(
          `${name}: active ${formatEther(vBefore.activeStake)}→${formatEther(vAfter.activeStake)} (${
            activeDelta >= 0n ? '+' : ''
          }${formatEther(activeDelta)}) ` +
            `total ${formatEther(vBefore.totalStake)}→${formatEther(vAfter.totalStake)} (${
              totalDelta >= 0n ? '+' : ''
            }${formatEther(totalDelta)})`,
        );
      });

      if (slashData.amounts) {
        console.log(`Slash amounts: ${slashData.amounts.map(a => formatEther(a)).join(', ')}`);
      }
      if (slashData.total) {
        console.log(`Total slashed: ${formatEther(slashData.total)}`);
      }

      const burnerDelta = after.burner - before.burner;
      const receiverDelta = after.receiver - before.receiver;
      console.log(
        `Burner: ${formatEther(before.burner)}→${formatEther(after.burner)} (${
          burnerDelta >= 0n ? '+' : ''
        }${formatEther(burnerDelta)})`,
      );
      console.log(
        `Receiver: ${formatEther(before.receiver)}→${formatEther(after.receiver)} (${
          receiverDelta >= 0n ? '+' : ''
        }${formatEther(receiverDelta)})`,
      );
      console.log(`${'='.repeat(80)}\n`);
    }

    it('slash both vaults with only active stake', async function () {
      const before = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('slash both vaults with only active stake', before, {
        routes: '(subnetwork1, operator1) → vault1, vault2',
      });

      const beforeVault1Stake = before.vaults.vault1.activeStake;
      const beforeVault2Stake = before.vaults.vault2.activeStake;

      // verify expected initial state
      expect(beforeVault1Stake).to.equal(parseEther('30000'));
      expect(beforeVault2Stake).to.equal(parseEther('20000'));

      const amountToSlashVault1 = parseEther('2000');
      const amountToSlashVault2 = parseEther('2000');
      const totalSlashed = amountToSlashVault1 + amountToSlashVault2;
      const captureTimestamp = (await time.latest()) - 5; // must be w/in current epoch & not now

      const hints1 = await this.slasherHints.slashHints.staticCall(
        this.slasher1.target,
        this.subnetwork1,
        this.operator1.address,
        captureTimestamp,
      );

      // slash 2000 wstETH from vault 1
      await this.slasher1
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, amountToSlashVault1, captureTimestamp, hints1 || '0x');

      const hints2 = await this.slasherHints.slashHints.staticCall(
        this.slasher2.target,
        this.subnetwork1,
        this.operator1.address,
        captureTimestamp,
      );

      // slash 2000 wstETH from vault 2
      await this.slasher2
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, amountToSlashVault2, captureTimestamp, hints2 || '0x');

      // transfer slashed tokens to receiver
      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);

      const burnerRouterWstETHAfter = await this.wstETH.balanceOf(this.burnerRouter.target);

      // verify burner router balance returns to 0 after transfer
      expect(burnerRouterWstETHAfter).to.equal(0n);

      const after = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('slash both vaults with only active stake', before, after, {
        amounts: [amountToSlashVault1, amountToSlashVault2],
        total: totalSlashed,
      });

      // verify strong invariants: activeStake reduced by slash amount
      expect(after.vaults.vault1.activeStake).to.equal(beforeVault1Stake - amountToSlashVault1);
      expect(after.vaults.vault2.activeStake).to.equal(beforeVault2Stake - amountToSlashVault2);
      expect(after.receiver).to.equal(before.receiver + totalSlashed);

      // verify delegated stake formula: delegatedStake = min(activeStake, networkLimit)
      const [networkLimit1Sub1, networkLimit2Sub1, networkLimit1Sub2] = await Promise.all([
        this.delegator1.networkLimit(this.subnetwork1),
        this.delegator2.networkLimit(this.subnetwork1),
        this.delegator1.networkLimit(this.subnetwork2),
      ]);

      const delegatedVault1Sub1 = await this.delegator1.stake(this.subnetwork1, this.operator1.address);
      const delegatedVault2Sub1 = await this.delegator2.stake(this.subnetwork1, this.operator1.address);
      const delegatedVault1Sub2 = await this.delegator1.stake(this.subnetwork2, this.operator1.address);

      expect(delegatedVault1Sub1).to.equal(BigIntMath.min(after.vaults.vault1.activeStake, networkLimit1Sub1));
      expect(delegatedVault2Sub1).to.equal(BigIntMath.min(after.vaults.vault2.activeStake, networkLimit2Sub1));
      expect(delegatedVault1Sub2).to.equal(BigIntMath.min(after.vaults.vault1.activeStake, networkLimit1Sub2));
    });

    it('slash vault with active + queued withdrawal states', async function () {
      const staker4InitialBalance = await this.vault2.activeBalanceOf(this.staker4.address);
      const staker4WithdrawAmount = parseEther('5000');
      const epochN = await this.vault2.currentEpoch();
      const claimEpoch = epochN + 1n;

      // staker4 withdraws, stake queued for withdrawal on nextEpoch
      await this.vault2.connect(this.staker4).withdraw(this.staker4.address, staker4WithdrawAmount);

      // advance to next epoch
      await time.setNextBlockTimestamp(await this.vault2.nextEpochStart());
      await ethers.provider.send('evm_mine', []);
      expect(await this.vault2.currentEpoch()).to.equal(claimEpoch);

      // capture START snapshot
      const before = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('slash vault with active + queued withdrawal states', before, {
        routes: '(subnetwork1, operator1) → vault2',
      });

      // captureTimestamp must be in PREVIOUS epoch so withdrawals[currentEpoch] is slashable
      const currentEpochStart = await this.vault2.currentEpochStart();
      const prevEpochCaptureTs = currentEpochStart - 1n;
      expect(prevEpochCaptureTs).to.be.lt(currentEpochStart);

      const [staker3Active, staker4Active, staker4Queued] = await Promise.all([
        this.vault2.activeBalanceOf(this.staker3.address),
        this.vault2.activeBalanceOf(this.staker4.address),
        this.vault2.withdrawalsOf(claimEpoch, this.staker4.address),
      ]);

      // verify expected state before slash
      const expectedStaker4Active = staker4InitialBalance - staker4WithdrawAmount;
      expect(staker4Active).to.be.gte(expectedStaker4Active - 1n);
      expect(staker4Active).to.be.lte(expectedStaker4Active + 1n);
      expect(staker4Queued).to.be.equal(staker4WithdrawAmount);

      const hints2 = await this.slasherHints.slashHints.staticCall(
        this.slasher2.target,
        this.subnetwork1,
        this.operator1.address,
        prevEpochCaptureTs,
      );

      // slash vault 2 using previous epoch timestamp
      const amountToSlash = parseEther('9000'); // 50% of remaining stake (18000 * 0.5 = 9000)
      await this.slasher2
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, amountToSlash, prevEpochCaptureTs, hints2 || '0x');

      const [
        staker3AfterSlash,
        staker4ActiveAfterSlash,
        staker4QueuedAfterSlash,
        vault2TotalStakeAfterSlash,
        burnerRouter,
      ] = await Promise.all([
        this.vault2.activeBalanceOf(this.staker3.address),
        this.vault2.activeBalanceOf(this.staker4.address),
        this.vault2.withdrawalsOf(claimEpoch, this.staker4.address),
        this.vault2.totalStake(),
        this.wstETH.balanceOf(this.burnerRouter.target),
      ]);

      const staker3SlashedAmount = staker3Active - staker3AfterSlash;
      const staker4ActiveSlashed = staker4Active - staker4ActiveAfterSlash;
      const staker4QueuedSlashed = staker4Queued - staker4QueuedAfterSlash;
      const staker4TotalSlashed = staker4ActiveSlashed + staker4QueuedSlashed;

      const totalActuallySlashed = staker3SlashedAmount + staker4TotalSlashed;

      // verify total slashed amount (with -1 wei tolerance)
      expect(totalActuallySlashed).to.be.gte(amountToSlash - 1n);
      expect(totalActuallySlashed).to.be.lte(amountToSlash);

      // verify vault total stake reduced correctly (with -1 wei tolerance)
      const expectedVault2TotalStake = before.vaults.vault2.totalStake - totalActuallySlashed;
      expect(vault2TotalStakeAfterSlash).to.gte(expectedVault2TotalStake - 1n);
      expect(vault2TotalStakeAfterSlash).to.lte(expectedVault2TotalStake);

      // verify slashed tokens went to burner router (with ±1 wei tolerance for totalActuallySlashed)
      expect(burnerRouter).to.be.gte(before.burner + totalActuallySlashed);
      expect(burnerRouter).to.be.lte(before.burner + totalActuallySlashed + 1n);

      // transfer slashed tokens from burner router to receiver
      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);

      const [burnerAfter, receiverAfter] = await Promise.all([
        this.wstETH.balanceOf(this.burnerRouter.target),
        this.wstETH.balanceOf(ADVISORY_BOARD_MULTISIG),
      ]);

      // verify end-to-end token flow
      expect(burnerAfter).to.equal(0n);
      expect(receiverAfter - before.receiver).to.equal(burnerRouter);

      const staker3TotalBefore = staker3Active;
      const staker4TotalBefore = staker4Active + staker4Queued;
      const totalSlashableBefore = staker3TotalBefore + staker4TotalBefore;

      // verify proportionality across stakers using WAD-based shares
      // this avoids the magnification of rounding errors from cross-multiplication
      const staker3ExpectedShare = (staker3TotalBefore * WAD) / totalSlashableBefore;
      const staker4ExpectedShare = (staker4TotalBefore * WAD) / totalSlashableBefore;
      const staker3ActualShare = (staker3SlashedAmount * WAD) / totalActuallySlashed;
      const staker4ActualShare = (staker4TotalSlashed * WAD) / totalActuallySlashed;
      expect(staker3ActualShare).to.equal(staker3ExpectedShare);
      expect(staker4ActualShare).to.equal(staker4ExpectedShare);

      // verify within-staker4 proportionality using WAD-based shares
      const staker4ActiveExpectedShare = (staker4Active * WAD) / staker4TotalBefore;
      const staker4QueuedExpectedShare = (staker4Queued * WAD) / staker4TotalBefore;
      const staker4ActiveActualShare = (staker4ActiveSlashed * WAD) / staker4TotalSlashed;
      const staker4QueuedActualShare = (staker4QueuedSlashed * WAD) / staker4TotalSlashed;
      expect(staker4ActiveActualShare).to.equal(staker4ActiveExpectedShare);
      expect(staker4QueuedActualShare).to.equal(staker4QueuedExpectedShare);

      // verify delegator stake post-slash: delegatedStake = min(activeStake, networkLimit)
      const vault2ActiveStake = await this.vault2.activeStake();
      const delegatedStake = await this.delegator2.stake(this.subnetwork1, this.operator1.address);
      const networkLimit = await this.delegator2.networkLimit(this.subnetwork1);
      expect(delegatedStake).to.equal(BigIntMath.min(vault2ActiveStake, networkLimit));

      // capture END snapshot
      const after = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('slash vault with active + queued withdrawal states', before, after, {
        amounts: [amountToSlash],
        total: totalActuallySlashed,
      });
    });

    it('slash vault with active + queued + claim-eligible states', async function () {
      const staker2FirstWithdraw = parseEther('3000');
      const epochN = await this.vault1.currentEpoch();
      const epochNPlus1 = epochN + 1n;
      const epochNPlus2 = epochN + 2n;

      // epochN: staker2 withdraws (will be claimable in epochNPlus2)
      await this.vault1.connect(this.staker2).withdraw(this.staker2.address, staker2FirstWithdraw);

      // advance to epochNPlus1
      await time.increaseTo(await this.vault1.nextEpochStart());
      expect(await this.vault1.currentEpoch()).to.equal(epochNPlus1);

      // epochNPlus1: staker2 makes second withdrawal
      const staker2SecondWithdraw = parseEther('3000');
      await this.vault1.connect(this.staker2).withdraw(this.staker2.address, staker2SecondWithdraw);

      // advance to epochNPlus2: first withdrawal now claim-eligible, second is slashable
      await time.increaseTo(await this.vault1.nextEpochStart());
      expect(await this.vault1.currentEpoch()).to.equal(epochNPlus2);

      // capture START snapshot
      const before = await captureSnapshot.call(this, {
        vaults: [this.vault1],
        delegators: [this.delegator1],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('slash vault with active + queued + claim-eligible states', before, {
        routes: '(subnetwork1, operator1) → vault1',
      });

      const [staker1Active, staker2Active, staker2QueuedEpoch3, staker2ClaimEligibleEpoch2] = await Promise.all([
        this.vault1.activeBalanceOf(this.staker1.address),
        this.vault1.activeBalanceOf(this.staker2.address),
        this.vault1.withdrawalsOf(epochNPlus2, this.staker2.address),
        this.vault1.withdrawalsOf(epochNPlus1, this.staker2.address),
      ]);

      // use previous epoch captureTimestamp so withdrawals[currentEpoch] is slashable
      const currentEpochStart = await this.vault1.currentEpochStart();
      const previousEpochCaptureTs = currentEpochStart - 1n;
      expect(previousEpochCaptureTs).to.be.lt(currentEpochStart);

      // compute amount to slash from live state (50% of slashable funds)
      const slashableFundsBefore = before.vaults.vault1.activeStake + staker2QueuedEpoch3;
      const amountToSlash = slashableFundsBefore / 2n;
      expect(amountToSlash).to.be.lte(slashableFundsBefore);

      const hints1 = await this.slasherHints.slashHints.staticCall(
        this.slasher1.target,
        this.subnetwork1,
        this.operator1.address,
        previousEpochCaptureTs,
      );

      // slash: activeStake + withdrawal[currentEpoch] is slashable
      // withdrawal[previousEpoch] which is now claim-eligible is NOT slashable
      await this.slasher1
        .connect(this.middleware)
        .slash(this.subnetwork1, ADVISORY_BOARD_MULTISIG, amountToSlash, previousEpochCaptureTs, hints1 || '0x');

      const [
        staker1AfterSlash,
        staker2ActiveAfterSlash,
        staker2QueuedEpoch3AfterSlash,
        staker2ClaimEligibleEpoch2AfterSlash,
        vault1TotalStakeAfterSlash,
        burnerMid,
      ] = await Promise.all([
        this.vault1.activeBalanceOf(this.staker1.address),
        this.vault1.activeBalanceOf(this.staker2.address),
        this.vault1.withdrawalsOf(epochNPlus2, this.staker2.address),
        this.vault1.withdrawalsOf(epochNPlus1, this.staker2.address),
        this.vault1.totalStake(),
        this.wstETH.balanceOf(this.burnerRouter.target),
      ]);

      const staker1SlashedAmount = staker1Active - staker1AfterSlash;
      const staker2ActiveSlashed = staker2Active - staker2ActiveAfterSlash;
      const staker2QueuedSlashed = staker2QueuedEpoch3 - staker2QueuedEpoch3AfterSlash;
      const staker2TotalSlashed = staker2ActiveSlashed + staker2QueuedSlashed;
      const totalActuallySlashed = staker1SlashedAmount + staker2TotalSlashed;

      // verify total slashed matches expected (-1 wei tolerance)
      expect(totalActuallySlashed).to.be.gte(amountToSlash - 1n);
      expect(totalActuallySlashed).to.be.lte(amountToSlash);

      // verify vault total stake reduced correctly (-1 wei tolerance)
      expect(vault1TotalStakeAfterSlash).to.be.gte(before.vaults.vault1.totalStake - totalActuallySlashed - 1n);
      expect(vault1TotalStakeAfterSlash).to.be.lte(before.vaults.vault1.totalStake - totalActuallySlashed);

      // verify staker2's claim-eligible amount is NOT slashed
      expect(staker2ClaimEligibleEpoch2AfterSlash).to.equal(staker2ClaimEligibleEpoch2);

      // verify slashed tokens went to burner router (+1 wei tolerance)
      expect(burnerMid).to.be.gte(before.burner + totalActuallySlashed);
      expect(burnerMid).to.be.lte(before.burner + totalActuallySlashed + 1n);

      // transfer slashed tokens from burner router to receiver
      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);

      const [burnerAfter, receiverAfter] = await Promise.all([
        this.wstETH.balanceOf(this.burnerRouter.target),
        this.wstETH.balanceOf(ADVISORY_BOARD_MULTISIG),
      ]);

      // verify end-to-end token flow
      expect(burnerAfter).to.equal(0n);
      expect(receiverAfter - before.receiver).to.equal(burnerMid);

      // verify proportionality across slashable balances using WAD-based shares
      // Only staker1 (active) and staker2 (active+queued epoch3) are slashable
      // staker2's claim-eligible (epochNPlus1) is NOT slashable
      const staker1TotalBefore = staker1Active;
      const staker2SlashableBefore = staker2Active + staker2QueuedEpoch3;
      const totalSlashableBefore = staker1TotalBefore + staker2SlashableBefore;

      const staker1ExpectedShare = (staker1TotalBefore * WAD) / totalSlashableBefore;
      const staker2ExpectedShare = (staker2SlashableBefore * WAD) / totalSlashableBefore;
      const staker1ActualShare = (staker1SlashedAmount * WAD) / totalActuallySlashed;
      const staker2ActualShare = (staker2TotalSlashed * WAD) / totalActuallySlashed;

      expect(staker1ActualShare).to.equal(staker1ExpectedShare);
      expect(staker2ActualShare).to.equal(staker2ExpectedShare);

      // verify within-staker2 proportionality (active vs queued)
      const staker2ActiveExpectedShare = (staker2Active * WAD) / staker2SlashableBefore;
      const staker2QueuedExpectedShare = (staker2QueuedEpoch3 * WAD) / staker2SlashableBefore;
      const staker2ActiveActualShare = (staker2ActiveSlashed * WAD) / staker2TotalSlashed;
      const staker2QueuedActualShare = (staker2QueuedSlashed * WAD) / staker2TotalSlashed;

      expect(staker2ActiveActualShare).to.equal(staker2ActiveExpectedShare);
      expect(staker2QueuedActualShare).to.equal(staker2QueuedExpectedShare);

      // verify delegator stake post-slash: delegatedStake = min(activeStake, networkLimit)
      const vault1ActiveStakeAfter = await this.vault1.activeStake();
      const delegatedSub1 = await this.delegator1.stake(this.subnetwork1, this.operator1.address);
      const limitSub1 = await this.delegator1.networkLimit(this.subnetwork1);
      expect(delegatedSub1).to.equal(BigIntMath.min(vault1ActiveStakeAfter, limitSub1));

      // also check subnetwork2 if vault1 is cross-allocated
      const delegatedSub2 = await this.delegator1.stake(this.subnetwork2, this.operator1.address);
      const limitSub2 = await this.delegator1.networkLimit(this.subnetwork2);
      expect(delegatedSub2).to.equal(BigIntMath.min(vault1ActiveStakeAfter, limitSub2));

      // capture END snapshot
      const after = await captureSnapshot.call(this, {
        vaults: [this.vault1],
        delegators: [this.delegator1],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('slash vault with active + queued + claim-eligible states', before, after, {
        amounts: [amountToSlash],
        total: totalActuallySlashed,
      });

      // staker2 claims epochNPlus1 withdrawal and verifies full unslashed amount
      await time.setNextBlockTimestamp(await this.vault1.nextEpochStart());
      await ethers.provider.send('evm_mine', []);
      expect(await this.vault1.currentEpoch()).to.equal(epochNPlus2 + 1n);

      const staker2WstEthBefore = await this.wstETH.balanceOf(this.staker2.address);
      await this.vault1.connect(this.staker2).claim(this.staker2.address, epochNPlus1, { gasLimit: 21e6 });
      const staker2WstEthAfter = await this.wstETH.balanceOf(this.staker2.address);
      const staker2ClaimedAmount = staker2WstEthAfter - staker2WstEthBefore;

      expect(staker2ClaimedAmount).to.equal(staker2FirstWithdraw);
    });

    it('slash both vaults with different state', async function () {
      const staker1WithdrawAmount = parseEther('1200');
      const staker4WithdrawAmount = parseEther('500');

      // create withdrawals
      await this.vault1.connect(this.staker1).withdraw(this.staker1.address, staker1WithdrawAmount);
      const vault1ClaimEpoch = (await this.vault1.currentEpoch()) + 1n;

      await this.vault2.connect(this.staker4).withdraw(this.staker4.address, staker4WithdrawAmount);
      const vault2ClaimEpoch = (await this.vault2.currentEpoch()) + 1n;

      // advance to later of two next epoch starts
      const [vault1NextEpochStart, vault2NextEpochStart] = await Promise.all([
        this.vault1.nextEpochStart(),
        this.vault2.nextEpochStart(),
      ]);
      const targetTime = vault1NextEpochStart > vault2NextEpochStart ? vault1NextEpochStart : vault2NextEpochStart;
      await time.increaseTo(targetTime);

      // verify both vaults transitioned to claim epoch
      expect(await this.vault1.currentEpoch()).to.equal(vault1ClaimEpoch);
      expect(await this.vault2.currentEpoch()).to.equal(vault2ClaimEpoch);

      // capture START snapshot
      const before = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('slash both vaults with different state', before, {
        routes: '(subnetwork1, operator1) → vault1, vault2',
      });

      // verify queued withdrawals exist
      const [staker1Queued, staker4Queued] = await Promise.all([
        this.vault1.withdrawalsOf(vault1ClaimEpoch, this.staker1.address),
        this.vault2.withdrawalsOf(vault2ClaimEpoch, this.staker4.address),
      ]);
      expect(staker1Queued).to.be.gt(0n);
      expect(staker4Queued).to.be.gt(0n);

      // use vault-specific capture timestamps from previous epoch (currentEpochStart - 1)
      // this ensures the timestamp is always valid for each vault's slasher
      const [vault1CaptureTimestamp, vault2CaptureTimestamp] = await Promise.all([
        this.vault1.currentEpochStart().then(start => start - 1n),
        this.vault2.currentEpochStart().then(start => start - 1n),
      ]);

      // get slashable amounts and calculate slash amounts (50%)
      const [vault1SlashableBefore, vault2SlashableBefore] = await Promise.all([
        this.slasher1.slashableStake(this.subnetwork1, this.operator1.address, vault1CaptureTimestamp, '0x'),
        this.slasher2.slashableStake(this.subnetwork1, this.operator1.address, vault2CaptureTimestamp, '0x'),
      ]);

      const slashVault1Amount = vault1SlashableBefore / 2n;
      const slashVault2Amount = vault2SlashableBefore / 2n;
      const totalSlashed = slashVault1Amount + slashVault2Amount;

      expect(slashVault1Amount).to.be.gt(0n);
      expect(slashVault2Amount).to.be.gt(0n);
      expect(slashVault1Amount).to.be.lte(vault1SlashableBefore);
      expect(slashVault2Amount).to.be.lte(vault2SlashableBefore);

      // execute slashes with vault-specific capture timestamps
      const [hints1, hints2] = await Promise.all([
        this.slasherHints.slashHints.staticCall(
          this.slasher1.target,
          this.subnetwork1,
          this.operator1.address,
          vault1CaptureTimestamp,
        ),
        this.slasherHints.slashHints.staticCall(
          this.slasher2.target,
          this.subnetwork1,
          this.operator1.address,
          vault2CaptureTimestamp,
        ),
      ]);

      await this.slasher1
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, slashVault1Amount, vault1CaptureTimestamp, hints1 || '0x');

      await this.slasher2
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, slashVault2Amount, vault2CaptureTimestamp, hints2 || '0x');

      // verify token flow: burner router received slashed tokens
      const burnerBalanceAfterSlash = await this.wstETH.balanceOf(this.burnerRouter.target);
      expect(burnerBalanceAfterSlash).to.equal(before.burner + totalSlashed);

      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);

      const [receiverBalanceAfter, burnerBalanceAfterTransfer] = await Promise.all([
        this.wstETH.balanceOf(ADVISORY_BOARD_MULTISIG),
        this.wstETH.balanceOf(this.burnerRouter.target),
      ]);

      const receiverReceived = receiverBalanceAfter - before.receiver;
      expect(burnerBalanceAfterTransfer).to.equal(0n);
      expect(receiverReceived).to.equal(totalSlashed);

      const after = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('slash both vaults with different state', before, after, {
        amounts: [slashVault1Amount, slashVault2Amount],
        total: totalSlashed,
      });

      // verify proportional slashing
      const vault1TotalSlashable = before.vaults.vault1.activeStake + staker1Queued;
      const vault2TotalSlashable = before.vaults.vault2.activeStake + staker4Queued;
      const expectedV1ActiveDecrease = (before.vaults.vault1.activeStake * slashVault1Amount) / vault1TotalSlashable;
      const expectedV2ActiveDecrease = (before.vaults.vault2.activeStake * slashVault2Amount) / vault2TotalSlashable;
      const vault1ActiveChange = before.vaults.vault1.activeStake - after.vaults.vault1.activeStake;
      const vault2ActiveChange = before.vaults.vault2.activeStake - after.vaults.vault2.activeStake;

      expect(vault1ActiveChange).to.be.gte(expectedV1ActiveDecrease - 1n);
      expect(vault1ActiveChange).to.be.lte(expectedV1ActiveDecrease + 1n);
      expect(vault2ActiveChange).to.be.gte(expectedV2ActiveDecrease - 1n);
      expect(vault2ActiveChange).to.be.lte(expectedV2ActiveDecrease + 1n);

      // delegator sanity checks
      const [delegated1, limit1, delegated2, limit2] = await Promise.all([
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.delegator1.networkLimit(this.subnetwork1),
        this.delegator2.stake(this.subnetwork1, this.operator1.address),
        this.delegator2.networkLimit(this.subnetwork1),
      ]);

      expect(delegated1).to.equal(BigIntMath.min(after.vaults.vault1.activeStake, limit1));
      expect(delegated2).to.equal(BigIntMath.min(after.vaults.vault2.activeStake, limit2));
    });

    it('multi-epoch slash sequence with state transitions', async function () {
      const epochN = await this.vault1.currentEpoch();
      const epochNPlus1 = epochN + 1n;
      const epochNPlus2 = epochN + 2n;

      // staker1 withdraws to create queued state
      const staker1WithdrawAmount = parseEther('800');
      await this.vault1.connect(this.staker1).withdraw(this.staker1.address, staker1WithdrawAmount);

      // advance to next epoch, capture timestamp just before
      const nextEpochStart = await this.vault1.nextEpochStart();
      await time.increaseTo(Number(nextEpochStart - 10n));
      const captureTsEpochN = BigInt(await time.latest());
      await time.increaseTo(Number(nextEpochStart));

      expect(await this.vault1.currentEpoch()).to.equal(epochNPlus1);
      expect(captureTsEpochN).to.be.lt(await this.vault1.currentEpochStart());

      // capture START snapshot (Epoch N+1, first slash)
      const beforeFirstSlash = await captureSnapshot.call(this, {
        vaults: [this.vault1],
        delegators: [this.delegator1],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('multi-epoch slash sequence - FIRST SLASH (epoch N+1)', beforeFirstSlash, {
        routes: '(subnetwork1, operator1) → vault1',
      });

      // verify queued state
      const staker1QueuedEpochNPlus1 = await this.vault1.withdrawalsOf(epochNPlus1, this.staker1.address);
      expect(staker1QueuedEpochNPlus1).to.equal(staker1WithdrawAmount);

      // calculate first slash amount
      const staker1ActiveBefore1 = await this.vault1.activeBalanceOf(this.staker1.address);
      const slashable1 = staker1ActiveBefore1 + staker1QueuedEpochNPlus1;
      const firstSlashAmount = slashable1 / 2n;

      // execute first slash
      const hints1 = await this.slasherHints.slashHints.staticCall(
        this.slasher1.target,
        this.subnetwork1,
        this.operator1.address,
        captureTsEpochN,
      );

      await this.slasher1
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, firstSlashAmount, captureTsEpochN, hints1 || '0x');

      // capture state after first slash
      const afterFirstSlash = await captureSnapshot.call(this, {
        vaults: [this.vault1],
        delegators: [this.delegator1],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('multi-epoch slash sequence - FIRST SLASH', beforeFirstSlash, afterFirstSlash, {
        amounts: [firstSlashAmount],
        total: firstSlashAmount,
      });

      // verify proportional slashing
      const vault1TotalSlashed = beforeFirstSlash.vaults.vault1.totalStake - afterFirstSlash.vaults.vault1.totalStake;
      expect(vault1TotalSlashed).to.equal(firstSlashAmount);

      // verify token flow
      const burnerIncrease1 = afterFirstSlash.burner - beforeFirstSlash.burner;
      expect(burnerIncrease1).to.be.equal(firstSlashAmount);

      // delegator sanity check
      const [delegated1, limit1] = await Promise.all([
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.delegator1.networkLimit(this.subnetwork1),
      ]);
      expect(delegated1).to.equal(BigIntMath.min(afterFirstSlash.vaults.vault1.activeStake, limit1));

      // advance to epoch N+2: first withdrawal becomes claim-eligible
      const nextEpochStart2 = await this.vault1.nextEpochStart();
      await time.increaseTo(Number(nextEpochStart2 - 10n));
      const captureTsEpochNPlus1 = BigInt(await time.latest());
      await time.increaseTo(Number(nextEpochStart2));

      expect(await this.vault1.currentEpoch()).to.equal(epochNPlus2);
      expect(captureTsEpochNPlus1).to.be.lt(await this.vault1.currentEpochStart());

      // capture START snapshot for second slash (Epoch N+2)
      const beforeSecondSlash = await captureSnapshot.call(this, {
        vaults: [this.vault1],
        delegators: [this.delegator1],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('multi-epoch slash sequence - SECOND SLASH (epoch N+2)', beforeSecondSlash, {
        routes: '(subnetwork1, operator1) → vault1',
      });

      // verify claim-eligible withdrawal exists (not slashable)
      const staker1ClaimEligible = await this.vault1.withdrawalsOf(epochNPlus1, this.staker1.address);
      const staker1QueuedEpochNPlus2 = await this.vault1.withdrawalsOf(epochNPlus2, this.staker1.address);
      expect(staker1ClaimEligible).to.be.gt(0n);
      expect(staker1QueuedEpochNPlus2).to.equal(0n);

      // calculate second slash amount
      const staker1ActiveBefore2 = await this.vault1.activeBalanceOf(this.staker1.address);
      const slashable2 = staker1ActiveBefore2 + staker1QueuedEpochNPlus2;
      const secondSlashAmount = slashable2 / 2n;

      // execute second slash
      const hints2 = await this.slasherHints.slashHints.staticCall(
        this.slasher1.target,
        this.subnetwork1,
        this.operator1.address,
        captureTsEpochNPlus1,
      );

      await this.slasher1
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, secondSlashAmount, captureTsEpochNPlus1, hints2 || '0x');

      // capture state after second slash
      const afterSecondSlash = await captureSnapshot.call(this, {
        vaults: [this.vault1],
        delegators: [this.delegator1],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('multi-epoch slash sequence - SECOND SLASH', beforeSecondSlash, afterSecondSlash, {
        amounts: [secondSlashAmount],
        total: secondSlashAmount,
      });

      // verify claim-eligible amount unchanged (key invariant)
      const staker1ClaimEligibleAfter = await this.vault1.withdrawalsOf(epochNPlus1, this.staker1.address);
      expect(staker1ClaimEligibleAfter).to.equal(staker1ClaimEligible);

      // verify active balance decreased
      const staker1ActiveAfter2 = await this.vault1.activeBalanceOf(this.staker1.address);
      expect(staker1ActiveAfter2).to.be.lt(staker1ActiveBefore2);

      // verify token flow
      const burnerIncrease2 = afterSecondSlash.burner - beforeSecondSlash.burner;
      expect(burnerIncrease2).to.be.equal(secondSlashAmount);

      // delegator sanity check
      const [delegated2, limit2] = await Promise.all([
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.delegator1.networkLimit(this.subnetwork1),
      ]);
      expect(delegated2).to.equal(BigIntMath.min(afterSecondSlash.vaults.vault1.activeStake, limit2));

      // transfer all slashed tokens to receiver
      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);
      const [burnerFinal, receiverFinal] = await Promise.all([
        this.wstETH.balanceOf(this.burnerRouter.target),
        this.wstETH.balanceOf(ADVISORY_BOARD_MULTISIG),
      ]);

      expect(burnerFinal).to.equal(0n);
      const totalSlashed = firstSlashAmount + secondSlashAmount;
      const totalReceiverIncrease = receiverFinal - beforeFirstSlash.receiver;
      expect(totalReceiverIncrease).to.be.equal(totalSlashed);

      // staker1 claims the claim-eligible amount
      const staker1WstEthBefore = await this.wstETH.balanceOf(this.staker1.address);
      await this.vault1.connect(this.staker1).claim(this.staker1.address, epochNPlus1);
      const staker1WstEthAfter = await this.wstETH.balanceOf(this.staker1.address);
      expect(staker1WstEthAfter - staker1WstEthBefore).to.equal(staker1ClaimEligible);
    });

    it('queued withdrawal flows through slash and claim correctly', async function () {
      const staker4WithdrawAmount = parseEther('500');
      const epochN = await this.vault2.currentEpoch();
      const claimEpoch = epochN + 1n;

      // staker4 withdraws
      await this.vault2.connect(this.staker4).withdraw(this.staker4.address, staker4WithdrawAmount);

      // advance to epoch N+1, capture timestamp just before
      const epochNPlus1Start = await this.vault2.nextEpochStart();
      await time.increaseTo(Number(epochNPlus1Start - 10n));
      const epochNCaptureTs = BigInt(await time.latest());
      await time.increaseTo(Number(epochNPlus1Start));

      expect(await this.vault2.currentEpoch()).to.equal(claimEpoch);
      expect(epochNCaptureTs).to.be.lt(await this.vault2.currentEpochStart());

      // capture START snapshot
      const before = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printStart('queued withdrawal flows through slash and claim', before, {
        routes: '(subnetwork1, operator1) → vault2',
      });

      // verify queued withdrawal
      const staker4QueuedBefore = await this.vault2.withdrawalsOf(claimEpoch, this.staker4.address);
      expect(staker4QueuedBefore).to.be.equal(staker4WithdrawAmount);

      // calculate slash amount
      const slashable = await this.slasher2.slashableStake(
        this.subnetwork1,
        this.operator1.address,
        epochNCaptureTs,
        '0x',
      );
      const slashAmount = slashable / 2n;

      // execute slash
      const hints = await this.slasherHints.slashHints.staticCall(
        this.slasher2.target,
        this.subnetwork1,
        this.operator1.address,
        epochNCaptureTs,
      );

      await this.slasher2
        .connect(this.middleware)
        .slash(this.subnetwork1, this.operator1.address, slashAmount, epochNCaptureTs, hints || '0x');

      // verify queued withdrawal was slashed
      const staker4QueuedAfter = await this.vault2.withdrawalsOf(claimEpoch, this.staker4.address);
      expect(staker4QueuedAfter).to.be.lt(staker4QueuedBefore);
      const queuedSlashed = staker4QueuedBefore - staker4QueuedAfter;
      expect(queuedSlashed).to.be.gt(0n);

      // transfer slashed tokens
      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);

      // capture END snapshot
      const after = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2],
        delegators: [this.delegator1, this.delegator2],
        subnetworks: [this.subnetwork1],
        operators: [this.operator1],
      });

      printEnd('queued withdrawal flows through slash and claim', before, after, {
        amounts: [slashAmount],
        total: slashAmount,
      });

      // verify burner emptied
      expect(after.burner).to.equal(0n);
      expect(after.receiver - before.receiver).to.be.equal(slashAmount);

      // delegator sanity check
      const [delegated, limit] = await Promise.all([
        this.delegator2.stake(this.subnetwork1, this.operator1.address),
        this.delegator2.networkLimit(this.subnetwork1),
      ]);
      expect(delegated).to.equal(BigIntMath.min(after.vaults.vault2.activeStake, limit));

      // advance to claim epoch
      await time.increaseTo(Number(await this.vault2.nextEpochStart()));
      expect(await this.vault2.currentEpoch()).to.equal(epochN + 2n);

      // staker4 claims reduced amount
      const staker4WstEthBefore = await this.wstETH.balanceOf(this.staker4.address);
      await this.vault2.connect(this.staker4).claim(this.staker4.address, claimEpoch);
      const staker4WstEthAfter = await this.wstETH.balanceOf(this.staker4.address);
      expect(staker4WstEthAfter - staker4WstEthBefore).to.equal(staker4QueuedAfter);

      const key = `${this.subnetwork1.slice(0, 10)}...${this.operator1.address.slice(0, 8)}`;

      const { delegated: delegatedBefore, limit: limitBefore } = before.vaults.vault2.delegated[key];
      const { delegated: delegatedAfter, limit: limitAfter } = after.vaults.vault2.delegated[key];

      const activeBefore = before.vaults.vault2.activeStake;
      const activeAfter = after.vaults.vault2.activeStake;

      // should follow the formula: delegatedStake = min(activeStake, networkLimit)
      expect(delegatedBefore).to.equal(BigIntMath.min(activeBefore, limitBefore));
      expect(delegatedAfter).to.equal(BigIntMath.min(activeAfter, limitAfter));
      expect(delegatedAfter).to.be.lte(delegatedBefore);

      expect(limitAfter).to.be.gte(activeAfter);
      expect(delegatedAfter).to.equal(activeAfter);
    });

    it('can slash using cover-buy captureTimestamp even after networkLimit is reduced', async function () {
      // capture timestamp (simulates cover-buy timestamp)
      const captureTimestamp = BigInt(await time.latest());

      // increase time so captureTimestamp is != now
      await time.increase(1000);

      // get slashable amount at capture time
      const slashableBefore = await this.slasher3.slashableStake(
        this.subnetwork2,
        this.operator1.address,
        captureTimestamp,
        '0x',
      );
      expect(slashableBefore).to.be.gt(parseEther('1000'), 'Should have sufficient slashable stake at capture time');

      // capture START snapshot
      const before = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2, this.vault3],
        delegators: [this.delegator1, this.delegator2, this.delegator3],
        subnetworks: [this.subnetwork1, this.subnetwork2],
        operators: [this.operator1],
      });

      printStart('slash with old captureTimestamp after networkLimit reduced', before, {
        routes: '(subnetwork2, operator2) → vault3',
        slashableBefore: formatEther(slashableBefore),
      });

      // vault 3 has 20K allocated to subnetwork2, reduce it to 100 ETH
      const reducedAllocation = parseEther('100');
      await this.delegator3.connect(this.advisoryBoard).setNetworkLimit(this.subnetwork2, reducedAllocation);

      // verify current delegated stake is now reduced
      const vault3ActiveStakeNow = await this.vault3.activeStake();
      const expectedCurrentStake = BigIntMath.min(vault3ActiveStakeNow, reducedAllocation);
      const stakeAfterReduction = await this.delegator3.stake(this.subnetwork2, this.operator1.address);
      expect(stakeAfterReduction).to.equal(expectedCurrentStake);

      // step 3: Slash using the OLD captureTimestamp for amount > current stake but <= old snapshot
      // choose slashAmount that clearly exceeds the new reduced limit
      const desiredSlashAmount = parseEther('1000');
      const slashAmount = BigIntMath.min(desiredSlashAmount, slashableBefore);

      // key assertion: we're slashing more than what's currently allocated
      expect(slashAmount).to.be.gt(
        stakeAfterReduction,
        'slashAmount must exceed current stake after reduction (proves old snapshot is used)',
      );
      expect(slashAmount).to.be.lte(slashableBefore, 'slashAmount must be <= slashable at capture');

      // get hints for slash
      const hints = await this.slasherHints.slashHints.staticCall(
        this.slasher3.target,
        this.subnetwork2,
        this.operator1.address,
        captureTimestamp,
      );

      // execute slash using old captureTimestamp (should succeed despite exceeding current limit)
      await this.slasher3
        .connect(this.middleware)
        .slash(this.subnetwork2, this.operator1.address, slashAmount, captureTimestamp, hints || '0x');

      // transfer slashed tokens to receiver
      await this.burnerRouter.triggerTransfer(ADVISORY_BOARD_MULTISIG);

      // capture END snapshot
      const after = await captureSnapshot.call(this, {
        vaults: [this.vault1, this.vault2, this.vault3],
        delegators: [this.delegator1, this.delegator2, this.delegator3],
        subnetworks: [this.subnetwork1, this.subnetwork2],
        operators: [this.operator1],
      });

      printEnd('slash with old captureTimestamp after networkLimit reduced', before, after, {
        amounts: [slashAmount],
        total: slashAmount,
        stakeAfterReduction: formatEther(stakeAfterReduction),
      });

      // verify slash happened correctly
      const vault3Slashed = before.vaults.vault3.totalStake - after.vaults.vault3.totalStake;
      expect(vault3Slashed).to.equal(slashAmount, 'Vault3 should be slashed by exact amount');

      // verify token flow
      expect(after.burner).to.equal(0n, 'Burner should be empty after transfer');
      const receiverIncrease = after.receiver - before.receiver;
      expect(receiverIncrease).to.equal(slashAmount, 'Receiver should receive exact slashed amount');

      // key invariant proven: slash succeeded for amount > current stake, using old captureTimestamp
    });
  });

  describe('update configs', function () {
    before(async function () {
      this.newMiddleware = (await ethers.getSigners())[1];
      if (!this.newMiddleware) {
        // tenderly bug workaround
        this.newMiddleware = await getSigner('0x220Dd3EAf87C74C4ef04230071842428bf222399');
      }
    });

    after(async function () {
      // set middleware back to original middleware slasher
      await this.middlewareService.connect(this.network).setMiddleware(this.middleware.address);
    });

    it('change burner router operatorNetwork receiver for (network, operator)', async function () {
      const network = ADVISORY_BOARD_MULTISIG;
      const operator = ADVISORY_BOARD_MULTISIG;
      const newOpReceiver = this.newMiddleware.address;

      const beforeOpReceiver = await this.burnerRouter.operatorNetworkReceiver(network, operator);
      expect(beforeOpReceiver).to.equal(this.advisoryBoard.address);

      // change operator-network slash receiver
      await this.burnerRouter
        .connect(this.burnerRouterOwner)
        .setOperatorNetworkReceiver(network, operator, newOpReceiver);

      const [beforePendingOpReceiver] = await this.burnerRouter.pendingOperatorNetworkReceiver(network, operator);
      expect(beforePendingOpReceiver).to.equal(newOpReceiver);

      // advance time past the change receiver delay (3 days)
      await time.increase(CHANGE_SLASH_RECEIVER_DELAY);
      await this.burnerRouter.acceptOperatorNetworkReceiver(network, operator);

      const afterOpReceiver = await this.burnerRouter.operatorNetworkReceiver(network, operator);
      expect(afterOpReceiver).to.equal(newOpReceiver);

      const [afterPendingOpReceiver] = await this.burnerRouter.pendingOperatorNetworkReceiver(network, operator);
      expect(afterPendingOpReceiver).to.equal(ethers.ZeroAddress);

      const amountToSlash = parseEther('150');

      const [beforeVaultStake, beforeDelegatedStake, beforeNewOpReceiverBalance] = await Promise.all([
        this.vault1.activeStake(),
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.wstETH.balanceOf(newOpReceiver),
      ]);

      // slash
      const captureTimestamp = await time.latest();
      await this.slasher1
        .connect(this.middleware)
        .slash(this.subnetwork1, ADVISORY_BOARD_MULTISIG, amountToSlash, captureTimestamp, '0x');

      // slashed tokens should now be routed to newOpReceiver
      await this.burnerRouter.triggerTransfer(newOpReceiver);

      const [afterVaultStake, afterDelegatedStake, afterNewOpReceiverBalance] = await Promise.all([
        this.vault1.activeStake(),
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.wstETH.balanceOf(newOpReceiver),
      ]);

      const expectedAfterVaultStake = beforeVaultStake - amountToSlash;
      const expectedAfterDelegatedStake = beforeDelegatedStake - amountToSlash;
      const expectedAfterNewOpReceiverBalance = beforeNewOpReceiverBalance + amountToSlash;

      expect(afterVaultStake).to.equal(expectedAfterVaultStake);
      expect(afterDelegatedStake).to.equal(expectedAfterDelegatedStake);
      expect(afterNewOpReceiverBalance).to.equal(expectedAfterNewOpReceiverBalance);
    });

    it('change middleware slasher and slash via new middleware slasher', async function () {
      // set new middleware slasher
      await this.middlewareService.connect(this.network).setMiddleware(this.newMiddleware.address);
      expect(await this.middlewareService.middleware(this.network.address)).to.equal(this.newMiddleware.address);

      const [beforeVaultStake, beforeDelegatedStake, beforeReceiverBalance] = await Promise.all([
        this.vault1.activeStake(),
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.wstETH.balanceOf(this.newMiddleware),
      ]);

      const amountToSlash = parseEther('500');
      const captureTimestamp = await time.latest();

      // slash via new middleware slasher
      await this.slasher1
        .connect(this.newMiddleware)
        .slash(this.subnetwork1, ADVISORY_BOARD_MULTISIG, amountToSlash, captureTimestamp, '0x');

      // transfer slashed wstETH
      await this.burnerRouter.triggerTransfer(this.newMiddleware.address);

      const [afterVaultStake, afterDelegatedStake, afterReceiverBalance] = await Promise.all([
        this.vault1.activeStake(),
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.wstETH.balanceOf(this.newMiddleware),
      ]);

      const expectedAfterVaultStake = beforeVaultStake - amountToSlash;
      const expectedAfterDelegatedStake = beforeDelegatedStake - amountToSlash;
      const expectedAfterReceiverBalance = beforeReceiverBalance + amountToSlash;

      expect(afterVaultStake).to.equal(expectedAfterVaultStake);
      expect(afterDelegatedStake).to.equal(expectedAfterDelegatedStake);
      expect(afterReceiverBalance).to.equal(expectedAfterReceiverBalance);
    });

    it('adjust network limits to reduce delegated stake cap', async function () {
      const [beforeVaultStake, beforeDelegatedStake, beforeNetLimit] = await Promise.all([
        this.vault1.activeStake(),
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.delegator1.networkLimit(this.subnetwork1),
      ]);

      // 10% of beforeDelegatedStake
      const newMax = beforeDelegatedStake / 10n;

      await this.delegator1.connect(this.network).setMaxNetworkLimit(SUBNETWORK_1_ID, newMax);

      const [afterVaultStake, afterDelegatedStake, afterNetLimit, afterMax] = await Promise.all([
        this.vault1.activeStake(),
        this.delegator1.stake(this.subnetwork1, this.operator1.address),
        this.delegator1.networkLimit(this.subnetwork1),
        this.delegator1.maxNetworkLimit(this.subnetwork1),
      ]);

      expect(afterVaultStake).to.equal(beforeVaultStake);
      expect(afterMax).to.equal(newMax);
      expect(afterNetLimit).to.be.lte(newMax);

      if (beforeNetLimit > newMax) {
        expect(afterNetLimit).to.equal(newMax);
      }

      const expectedDelegated = BigIntMath.min(afterVaultStake, afterNetLimit);
      expect(afterDelegatedStake).to.equal(expectedDelegated);
      expect(afterDelegatedStake).to.be.lte(newMax);
      expect(afterDelegatedStake).to.be.lte(beforeDelegatedStake);
    });
  });
});
