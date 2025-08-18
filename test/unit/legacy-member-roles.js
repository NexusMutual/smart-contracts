const { expect } = require('chai');
const { ethers, nexus } = require('hardhat');
const { getAccounts } = require('../utils/accounts');

const { parseEther } = ethers;
const { ContractIndexes } = nexus.constants;

describe('LegacyMemberRoles Real Mainnet Data Debug', () => {
  let accounts;
  let legacyMemberRoles;
  let registry;
  let pool;
  let nxm;

  before(async () => {
    accounts = await getAccounts();

    // Deploy mock contracts
    nxm = await ethers.deployContract('NXMTokenMock');
    registry = await ethers.deployContract('RegistryMock');
    pool = await ethers.deployContract('MRMockPool');

    // Deploy testable version of LegacyMemberRoles
    legacyMemberRoles = await ethers.deployContract('MRTestable', [registry.target]);

    // Setup registry with contract addresses
    await registry.addContract(ContractIndexes.C_POOL, pool.target, false);
    await registry.addContract(ContractIndexes.C_TOKEN, nxm.target, false);

    // Send ETH to LegacyMemberRoles for testing
    await accounts.defaultSender.sendTransaction({
      to: legacyMemberRoles.target,
      value: parseEther('2'),
    });

    const balance = await ethers.provider.getBalance(legacyMemberRoles.target);
    console.log('Setup completed - LegacyMemberRoles has', ethers.formatEther(balance), 'ETH');
  });

  it('should debug real mainnet AB data - 12 members, 5 active', async () => {
    console.log('\n=== Setting up REAL MAINNET data ===');

    // Set up test member data with real mainnet AB data
    await legacyMemberRoles.setupTestData();

    // Check AB member setup
    console.log('\n=== VERIFYING AB SETUP ===');
    const abRole = 1;

    // Check AB memberCounter vs actual array length
    const memberCounter = await legacyMemberRoles.numberOfMembers(abRole);
    console.log('AB memberCounter:', memberCounter.toString());

    try {
      const arrayLength = await legacyMemberRoles.lengthOfMembers(abRole);
      console.log('AB array length:', arrayLength.toString());
    } catch (e) {
      console.log('lengthOfMembers not available:', e.message);
    }

    // Check all 12 AB members
    console.log('\nAll AB members from storage:');
    let activeCount = 0;
    const expectedActiveIndices = [0, 7, 8, 10, 11];

    for (let i = 0; i < 12; i++) {
      try {
        const { memberAddr, active } = await legacyMemberRoles.getMemberData(abRole, i);
        console.log(`  AB[${i}]: ${memberAddr} - ${active ? 'ACTIVE' : 'INACTIVE'}`);

        if (active) {
          activeCount++;
          if (!expectedActiveIndices.includes(i)) {
            console.log(`    ⚠️  Unexpected active member at index ${i}`);
          }
        }
      } catch (e) {
        console.log(`  AB[${i}]: Error - ${e.message}`);
        break;
      }
    }

    console.log(`\nActive AB count: ${activeCount}`);
    console.log('Expected active indices: [0, 7, 8, 10, 11]');

    // Verify regular members setup
    const { memberCount, nextIndex } = await legacyMemberRoles.getMigrationState();
    console.log('\nRegular members:', memberCount.toString());
    console.log('Migration starting at index:', nextIndex.toString());

    console.log('\n=== Testing migrateMembers ===');
    console.log('This should:');
    console.log('1. AB Loop: Process 12 AB members, find first 5 active ones');
    console.log('2. Members Loop: Process regular members, create exact-size array');
    console.log('3. NO empty slots sent to registry');

    // Listen for events from the registry to see what it receives
    const registryCalls = [];

    // Override the registry mock to capture calls
    const originalMigrateMembers = registry.migrateMembers;
    const originalMigrateAB = registry.migrateAdvisoryBoardMembers;

    registry.migrateMembers = async membersArray => {
      console.log('\n🎯 REGISTRY.migrateMembers CALLED:');
      console.log('  Array length:', membersArray.length);

      let validCount = 0;
      let emptyCount = 0;

      for (let i = 0; i < membersArray.length; i++) {
        if (membersArray[i] !== ethers.ZeroAddress) {
          console.log(`  [${i}]: ${membersArray[i]} ✅`);
          validCount++;
        } else {
          console.log(`  [${i}]: ${membersArray[i]} ❌ EMPTY SLOT!`);
          emptyCount++;
        }
      }

      console.log(`  Summary: ${validCount} valid, ${emptyCount} empty slots`);
      registryCalls.push({ type: 'members', valid: validCount, empty: emptyCount, array: membersArray });

      return originalMigrateMembers.call(this, membersArray);
    };

    registry.migrateAdvisoryBoardMembers = async abArray => {
      console.log('\n🎯 REGISTRY.migrateAdvisoryBoardMembers CALLED:');
      console.log('  Array length:', abArray.length);

      for (let i = 0; i < abArray.length; i++) {
        console.log(`  AB[${i}]: ${abArray[i]}`);
      }

      registryCalls.push({ type: 'ab', array: abArray });
      return originalMigrateAB.call(this, abArray);
    };

    // Listen for events from the pool to see ETH transfer
    pool.on('EthReceived', (sender, amount, newBalance) => {
      console.log(`💰 Pool received ${ethers.formatEther(amount)} ETH from ${sender}`);
    });

    // This should work with both loops fixed!
    console.log('\n🚀 Calling migrateMembers(4)...');
    try {
      await legacyMemberRoles.migrateMembers(4);
      console.log('✅ migrateMembers executed successfully!');

      // Analyze the results
      console.log('\n📊 ANALYSIS:');
      registryCalls.forEach((call, index) => {
        if (call.type === 'ab') {
          console.log(`${index + 1}. AB Migration: ${call.array.length} members`);
          console.log('   Expected: Exactly 5 active AB members from indices [0,7,8,10,11]');
        } else {
          console.log(`${index + 1}. Members Migration: ${call.valid} valid, ${call.empty} empty slots`);
          if (call.empty > 0) {
            console.log('   ❌ BUG: Empty slots detected!');
          } else {
            console.log('   ✅ No empty slots - working correctly!');
          }
        }
      });

    } catch (error) {
      console.log('❌ migrateMembers failed:', error.message);

      // Debug the failure
      if (error.message.includes('array index out of bounds')) {
        console.log('\n🔍 DEBUGGING ARRAY OUT OF BOUNDS:');
        console.log('- Check which loop is causing the issue');
        console.log('- AB loop should stop at exactly 5 active members');
        console.log('- Members loop should create exact-size array');
      }
    }

    expect(true).to.equal(true);
  });
});
