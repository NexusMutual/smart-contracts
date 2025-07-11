import "hardhat/types/runtime";

declare module "hardhat/types/runtime" {
  interface HardhatRuntimeEnvironment {
    nexus: typeof import("./lib/index.js");
  }
}
