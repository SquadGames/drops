import hre from "hardhat"
import fs from "fs"

import { Drops } from '../typechain/Drops'
import { Drops__factory } from '../typechain/factories/Drops__factory'
import config from '../config'

async function main() {
  const signer = (await hre.ethers.getSigners())[0]
  if (!signer) { throw new Error("no signer") }
  const DropsFactory = new Drops__factory(signer)
  const drops: Drops = await DropsFactory.deploy(config.hardhat.WETH_ADDRESS)
  console.log("Drops:", drops.address)
  console.log("Drops owner:", await signer.getAddress())
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })