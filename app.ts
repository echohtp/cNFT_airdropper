import { WrapperConnection } from '@/ReadApi/WrapperConnection';
import { createTree, createCollection, mintCompressedNFT } from '@/utils/compression';
import { numberFormatter } from '@/utils/helpers';
import { CreateMetadataAccountArgsV3, TokenStandard } from '@metaplex-foundation/mpl-token-metadata';
import { MetadataArgs, TokenProgramVersion } from '@metaplex-foundation/mpl-bubblegum';
import { ValidDepthSizePair, getConcurrentMerkleTreeAccountSize } from '@solana/spl-account-compression';
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58'


type Data = {
  collectors: string[]
}

export default async function handler() {


  const CLUSTER_URL = "RPC GOES HERE";

  // create a new rpc connection, using the ReadApi wrapper
  const connection = new WrapperConnection(CLUSTER_URL);

  // load keypair for the payer
  const SKua = bs58.decode("PAYER WALLET PRIVATE KEY GOES HERE")
  const payer = Keypair.fromSecretKey(SKua)

  console.log("Payer address:", payer.publicKey.toBase58());


  // get the payer's starting balance (only used for demonstration purposes)
  let initBalance = await connection.getBalance(payer.publicKey);

  console.log(
    "Starting account balance:",
    numberFormatter(initBalance / LAMPORTS_PER_SOL),
    "SOL\n",
  );

  /*
    Define our tree size parameters
  */
  const maxDepthSizePair: ValidDepthSizePair = {
    // max=8 nodes
    //maxDepth: 3,
    //maxBufferSize: 8,

    // max=16,384 nodes
    // maxDepth: 14,
    // maxBufferSize: 64,

    // max=131,072 nodes
    // maxDepth: 17,
    // maxBufferSize: 64,

    // max=1,048,576 nodes
    maxDepth: 20,
    maxBufferSize: 256,

    // max=1,073,741,824 nodes
    // maxDepth: 30,
    // maxBufferSize: 2048,
  };
  const canopyDepth = maxDepthSizePair.maxDepth - 5;

  //////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////////////

  /*
    For demonstration purposes, we can compute how much space our tree will 
    need to allocate to store all the records. As well as the cost to allocate 
    this space (aka minimum balance to be rent exempt)
    ---
    NOTE: These are performed automatically when using the `createAllocTreeIx` 
    function to ensure enough space is allocated, and rent paid.
  */

  // calculate the space available in the tree
  const requiredSpace = getConcurrentMerkleTreeAccountSize(
    maxDepthSizePair.maxDepth,
    maxDepthSizePair.maxBufferSize,
    canopyDepth,
  );

  const storageCost = await connection.getMinimumBalanceForRentExemption(requiredSpace);

  // demonstrate data points for compressed NFTs
  console.log("Space to allocate:", numberFormatter(requiredSpace), "bytes");
  console.log("Estimated cost to allocate space:", numberFormatter(storageCost / LAMPORTS_PER_SOL));
  console.log(
    "Max compressed NFTs for collection:",
    numberFormatter(Math.pow(2, maxDepthSizePair.maxDepth)),
    "\n",
  );

  // ensure the payer has enough balance to create the allocate the Merkle tree
  if (initBalance < storageCost) return console.error("Not enough SOL to allocate the merkle tree");
  // printConsoleSeparator();


  // define the address the tree will live at
  const treeKeypair = Keypair.generate();

  // create and send the transaction to create the tree on chain
  const tree = await createTree(connection, payer, treeKeypair, maxDepthSizePair, canopyDepth);



  /*
    Create the actual NFT collection (using the normal Metaplex method)
    (nothing special about compression here)
  */

  // define the metadata to be used for creating the NFT collection
  const collectionMetadataV3: CreateMetadataAccountArgsV3 = {
    data: {
      name: "Compressed Demo " + (new Date()).toLocaleDateString('en-US'),
      symbol: "xnftd",
      // specific json metadata for the collection
      uri: "https://supersweetcollection.notarealurl/collection.json",
      sellerFeeBasisPoints: 100,
      creators: [
        {
          address: payer.publicKey,
          verified: false,
          share: 100,
        },
      ],
      collection: null,
      uses: null,
    },
    isMutable: false,
    collectionDetails: null,
  };

  // create a full token mint and initialize the collection (with the `payer` as the authority)
  const collection = await createCollection(connection, payer, collectionMetadataV3);

  /*
    Mint a single compressed NFT
  */

  
  const compressedNFTMetadata: MetadataArgs = {
    sellerFeeBasisPoints: 0,
    name: "Compressed Demo",
    symbol: collectionMetadataV3.data.symbol,

    // specific json metadata for each NFT
    uri: "https://bafkreibme6bqku67yz6rn3shjjvipiqkmzmc75rb7tj5zebuiyyiiyh6gu.ipfs.nftstorage.link",
    creators: [
      {
        address: payer.publicKey,
        verified: false,
        share: 100,
      }
    ],
    // key: 6,
    // mint: collection.mint,
    // collectionDetails: coption,
    // programmableConfig: ,
    tokenProgramVersion: TokenProgramVersion.Original,
    // updateAuthority: payer.publicKey,
    editionNonce: 0,
    uses: null,
    collection: null,
    primarySaleHappened: false,
    isMutable: false,
    // these values are taken from the Bubblegum package
    // tokenProgramVersion: TokenProgramVersion.Original,
    // NonFungible = 0,
    // FungibleAsset = 1,
    // Fungible = 2,
    // NonFungibleEdition = 3
    tokenStandard: 0,
  };

  // fully mint a single compressed NFT to the payer
  let promArr = []
  // LOOP BECAUSE WE WANT TO SHIP 8 NFTs TO THE SAME PLACE
  for (var i = 0; i < 8; i++) {
    console.log(`Minting a single compressed NFT to ${payer.publicKey.toBase58()}...`);
     promArr.push(mintCompressedNFT(
      connection,
      payer,
      treeKeypair.publicKey,
      collection.mint,
      collection.metadataAccount,
      collection.masterEditionAccount,
      compressedNFTMetadata,
      // mint to this specific wallet (in this case, the tree owner aka `payer`)
      new PublicKey("232PpcrPc6Kz7geafvbRzt5HnHP4kX88yvzUCN69WXQC"),
    ))
  }

  Promise.all(promArr).then((res)=>{
    console.log(res)
  })

  // fetch the payer's final balance
  let balance = await connection.getBalance(payer.publicKey);

  console.log(`===============================`);
  console.log(
    "Total cost:",
    numberFormatter((initBalance - balance) / LAMPORTS_PER_SOL, true),
    "SOL\n",
  );
}
