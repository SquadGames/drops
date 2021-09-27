import { bufferToHex, keccak256 } from 'ethereumjs-util'

// Core merkle tree code

interface ProofMap {
  [key: string]: Buffer[]
}

export interface MerkleTree {
  data: Buffer // should be 32 bytes not sure how to guarantee that with types
  children: [MerkleTree, MerkleTree] | null
  proofs: ProofMap
}

export const hashFn = keccak256

function hashPair (left: Buffer, right: Buffer): Buffer {
  return hashFn(Buffer.concat([left, right].sort(Buffer.compare)))
}

function extendProofs (left: MerkleTree, right: MerkleTree): ProofMap {
  const proofMap: ProofMap = {}
  for (const leaf in left.proofs) {
    const proof = left.proofs[leaf]
    if (proof === undefined) {
      throw new Error('expected proof to be defined')
    }
    proofMap[leaf] = [...proof, right.data]
  }
  for (const leaf in right.proofs) {
    const proof = right.proofs[leaf]
    if (proof === undefined) {
      throw new Error('expected proof to be defined')
    }
    proofMap[leaf] = [...proof, left.data]
  }
  return proofMap
}

function _makeMerkleTree (layer: MerkleTree[]): MerkleTree[] {
  if (layer.length === 0) {
    throw new Error('Empty tree')
  }
  if (layer.length === 1) {
    // this is the root
    return layer
  }
  const nextLayer: MerkleTree[] = []
  for (let i = 0; i < layer.length; i += 2) {
    const left: MerkleTree | undefined = layer[i]
    if (left === undefined) {
      throw new Error('layer index out of bounds error')
    }
    const right: MerkleTree = layer[i + 1] ?? left
    nextLayer.push({
      data: hashPair(left.data, right.data),
      children: [left, right],
      proofs: extendProofs(left, right)
    })
  }
  return _makeMerkleTree(nextLayer)
}

export function makeMerkleTree (leaves: Buffer[]): MerkleTree {
  // remove duplicate leaves and sort them
  leaves = [...new Set(leaves)].sort(Buffer.compare)

  // create MerkleTree leaves from Buffer leaves
  const preparedLeaves: MerkleTree[] = leaves.map(
    (l: Buffer): MerkleTree => {
      const proofs: ProofMap = {}
      proofs[l.toString('hex')] = []
      return { data: l, children: null, proofs }
    }
  )

  const tree = _makeMerkleTree(preparedLeaves)[0]
  if (tree === undefined) {
    throw new Error('Could not create merkle tree')
  }
  return tree
}

export function getRoot (tree: MerkleTree): Buffer {
  return tree.data
}

export function getHexRoot (tree: MerkleTree): string {
  return bufferToHex(getRoot(tree))
}

export function getProof (tree: MerkleTree, leaf: Buffer): Buffer[] {
  const proof = tree.proofs[leaf.toString('hex')]
  if (proof === undefined) {
    throw new Error('leaf not in tree')
  }
  return proof
}

export function getHexProof (tree: MerkleTree, leaf: string): string[] {
  return getProof(tree, Buffer.from(leaf, 'hex')).map(bufferToHex)
}

export function verify (proof: Buffer[], root: Buffer, leaf: Buffer): boolean {
  const check = proof.reduce(
    (currentHash: Buffer, nextElement: Buffer): Buffer => {
      return hashPair(currentHash, nextElement)
    },
    leaf
  )
  return check.equals(root)
}