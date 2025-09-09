const { config } = require('hardhat');
const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
      'NXMaster',
      ['LegacyMemberRoles', 'MemberRoles'],
      'Registry',
      'Governor',
      'TokenController',
      'Assessments',
      'Claims',
      'Cover',
      'CoverProducts',
      // 'Pool', add after converting to proxy
      'StakingProducts',
      'StakingPool',
      'Ramm',
      'SafeTracker',
      // 'SwapOperator', add after converting to proxy
      'LimitOrders',
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
        _unused_products: {
          label: '__unused_0',
          type: ['t_array(t_struct(Product)_storage)dyn_storage', 't_uint256'],
        },
        _unused_productTypes: {
          label: '__unused_1',
          type: ['t_array(t_struct(ProductType)_storage)dyn_storage', 't_uint256'],
        },
        coverSegmentAllocations: {
          label: '_legacyCoverSegmentAllocations',
        },
        _unused_allowedPools: {
          label: '__unused_4',
          type: ['t_mapping(t_uint256,t_array(t_uint256)dyn_storage)', 't_uint256'],
        },
        _coverSegments: {
          label: '_legacyCoverSegments',
          type: [
            't_mapping(t_uint256,t_array(t_struct(CoverSegment)_storage)dyn_storage)',
            't_mapping(t_uint256,t_array(t_struct(LegacyCoverSegment)_storage)dyn_storage)',
          ],
        },
        _unused_productNames: {
          label: '__unused_8',
          type: ['t_mapping(t_uint256,t_string_storage)', 't_uint256'],
        },
        _unused_productTypeNames: {
          label: '__unused_9',
          type: ['t_mapping(t_uint256,t_string_storage)', 't_uint256'],
        },
      },
      TokenController: {
        coverInfo: {
          label: '_unused_coverInfo',
          type: ['t_mapping(t_uint256,t_struct(CoverInfo)_storage)', 't_uint256'],
        },
        // mark packed unused as deleted
        master: {
          deleted: true,
        },
        internalContracts: {
          deleted: true,
        },
        lockReason: {
          deleted: true,
        },
        locked: {
          deleted: true,
        },
      },
      Ramm: {
        // mark packed unused as deleted
        master: {
          deleted: true,
        },
        internalContracts: {
          deleted: true,
        },
        _status: {
          deleted: true,
        },
      },
      SafeTracker: {
        // mark packed unused as deleted
        master: {
          deleted: true,
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
