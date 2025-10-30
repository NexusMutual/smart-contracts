const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { config } = require('hardhat');
const { expect } = require('chai');

const extractStorageLayout = require(path.join(config.paths.root, 'scripts/extract-storage-layout'));

const cleanupType = type => {
  return (
    type
      // t_mapping(t_uint256,t_struct(CoverInfo)32880_storage)
      // ->
      // t_mapping(t_uint256,t_struct(CoverInfo)_storage)
      .replace(/\)\d+/, ')')
      // 2. replace contract types with t_address
      .replace(/t_contract\([^)]+\)/, 't_address')
      // 2. ignore payable specifier for addresses
      .replace(/t_address_payable/, 't_address')
  );
};

describe('Storage layout', function () {
  it('compare storage layout of proxy upgradable contracts', async function () {
    // generate current storage layout on the fly
    // only commit the layout json when we release a new version!
    const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'));
    const currentStorageFile = path.join(tempPath, 'currentLayout.json');

    await extractStorageLayout(currentStorageFile);

    const previousLayout = require(path.join(__dirname, './storage/mainnetLayout.json'));
    const currentLayout = require(currentStorageFile);

    // proxy contracts
    const contractsToCompare = [
      'Assessments',
      // 'Claims', add after adding new contract
      'Cover',
      'CoverProducts',
      'Governor',
      ['LegacyMemberRoles', 'MemberRoles'],
      'LimitOrders',
      'NXMaster',
      // 'Pool', add after converting to proxy
      'Ramm',
      'Registry',
      'SafeTracker',
      'StakingPool',
      'StakingProducts',
      // 'SwapOperator', add after converting to proxy
      'TokenController',
    ];

    // Exceptions / overrides
    // Use old contract/label as keys and define overrides. All items are optional.
    // OldContractName: {
    //   oldVariableName: {
    //     label: 'newVariableName',
    //     size: [oldSize, newSize],
    //     type: ['oldType', 'newType'],
    //     deleted: true,
    //   },
    // }
    const exceptions = {
      Cover: {
        master: {
          label: '__unused_0',
          size: [20, 288], // uses 9 slots now, 32 * 9 = 288 bytes
          type: ['t_address', 't_array(t_uint256)_storage'],
        },
        internalContracts: {
          deleted: true,
        },
        _status: {
          deleted: true,
        },
        __unused_0: {
          deleted: true,
        },
        __unused_1: {
          deleted: true,
        },
        _legacyCoverData: {
          deleted: true,
        },
        _legacyCoverSegmentAllocations: {
          deleted: true,
        },
        __unused_4: {
          deleted: true,
        },
        _legacyCoverSegments: {
          deleted: true,
        },
        __unused_8: {
          deleted: true,
        },
        __unused_9: {
          deleted: true,
        },
      },
      TokenController: {
        // the variable at slot 0 is now called _unused and uses 4 slots
        lockReason: {
          label: '_unused',
          size: [32, 128], // uses 4 slots now, 32 * 4 = 128 bytes
          type: ['t_mapping(t_address,t_array(t_bytes32)dyn_storage)', 't_array(t_uint256)_storage'],
        },
        // following 3 slots are marked as deleted
        locked: { deleted: true },
        master: { deleted: true },
        internalContracts: { deleted: true },
        coverInfo: {
          label: '_unused_coverInfo',
          type: ['t_mapping(t_uint256,t_struct(CoverInfo)_storage)', 't_uint256'],
        },
      },
      Ramm: {
        // the variable at slot 0 is now called _unused and uses 3 slots
        master: {
          label: '_unused',
          size: [20, 96], // from address (160 bits) to uint[3]
          type: ['t_address', 't_array(t_uint256)_storage'],
        },
        internalContracts: {
          deleted: true, // internal contracts mapping
        },
        _status: {
          deleted: true, // oz reentrnacy guard
        },
      },
      SafeTracker: {
        master: {
          label: '_unused',
          size: [20, 64], // from address (160 bits) to uint[2]
          type: ['t_address', 't_array(t_uint256)_storage'],
        },
        internalContracts: {
          deleted: true,
        },
      },
      // Example overrides:
      // PooledStaking: {
      //   initialized: { deleted: true },
      //   token: {
      //     label: 'internalContracts',
      //     size: [20, 32],
      //     type: ['t_address', 't_mapping(t_uint256,t_address)'],
      //   },
      // },
      // MemberRoles: {
      //   nxMasterAddress: {
      //     label: 'internalContracts',
      //     size: [20, 32],
      //     type: ['t_address', 't_mapping(t_uint256,t_address_payable)'],
      //   },
      //   ms: { label: 'master' },
      //   qd: { label: 'kycAuthAddress' },
      // },
    };

    contractsToCompare.forEach(contract => {
      const [prevContractName, currentContractName] = [contract, contract].flat();
      const contractBefore = previousLayout[prevContractName] || [];
      const contractAfter = currentLayout[currentContractName];

      contractBefore.forEach(varPrev => {
        // check if we have an exception for this variable
        const { [varPrev.label]: exception = {} } = exceptions[prevContractName] || {};

        if (exception.deleted) {
          return;
        }

        // find the variable in the new layout
        const varCurrent = contractAfter.find(({ slot, offset }) => slot === varPrev.slot && offset === varPrev.offset);
        expect(
          varCurrent,
          `${varPrev.label} not found in ${currentContractName} at slot ${varPrev.slot} and offset ${varPrev.slot}`,
        ).not.to.be.equal(undefined);

        // compose identifying error message
        const prevId = `${prevContractName}.${varPrev.label}`;
        const currentId = `${currentContractName}.${varCurrent.label}`;
        const identifier = `${prevId} vs ${currentId} at slot ${varPrev.slot} and offset ${varPrev.offset}`;

        // apply overrides
        if (exception) {
          const overrides = {};

          if (exception.label) {
            overrides.label = exception.label;
          }

          if (exception.size) {
            const [oldSize, newSize] = exception.size;
            expect(varPrev.size, `Exception size mismatch ${identifier}`).to.be.equal(oldSize);
            overrides.size = newSize;
          }

          if (exception.type) {
            const [oldType, newType] = exception.type;
            expect(cleanupType(varPrev.type), `Exception type mismatch ${identifier}`).to.be.equal(oldType);
            overrides.type = newType;
          }

          Object.assign(varPrev, overrides);
        }

        // check name
        if (!/_unused/.test(varCurrent.label)) {
          expect(varCurrent.label, `Label mismatch in ${identifier}`).to.be.equal(varPrev.label);
        }

        // check type
        expect(cleanupType(varCurrent.type), `Type mismatch in ${identifier}`).to.be.equal(cleanupType(varPrev.type));

        // check size
        expect(varPrev.size, `Size mismatch in ${identifier}`).to.be.equal(varCurrent.size);
      });
    });
  });
});
