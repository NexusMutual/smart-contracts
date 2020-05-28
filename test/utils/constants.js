const ParamType = {
  MIN_ALLOCATION: 0,
  MAX_LEVERAGE: 1,
  MIN_DEALLOCATION: 2,
  DEALLOCATE_LOCK_TIME: 3,
};

const Role = {
  NonMember: 0,
  Member: 1,
  AdvisoryBoard: 2,
  Owner: 3,
};

module.exports = {
  ParamType,
  Role,
};
