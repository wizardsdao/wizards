import "@nomiclabs/hardhat-ethers";
import { task, types } from 'hardhat/config';
import ImageData from '../files/image-data.json';
import { chunkArray } from '../utils';
import promptjs from 'prompt';

promptjs.colors = false;
promptjs.message = '> ';
promptjs.delimiter = '';

task('populate-descriptor', 'Populates the descriptor with Wizard data')
  .addOptionalParam(
    'nftdescriptor',
    'The `NFTDescriptor` contract address',
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    types.string,
  )
  .addOptionalParam(
    'descriptor',
    'The `Descriptor` contract address',
    '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    types.string,
  )
  .setAction(async ({ nftdescriptor, descriptor }, { ethers }) => {
    console.log(nftdescriptor, descriptor)
    const descriptorFactory = await ethers.getContractFactory('Descriptor', {
      libraries: {
        NFTDescriptor: nftdescriptor,
      },
    });
    
    const descriptorContract = descriptorFactory.attach(descriptor);
    const { bgcolors, palette, images } = ImageData;
    const { eye, hat, mouth, skin, item, cloth, acc, one } = images;

    promptjs.start();

    let gasPrice = await ethers.provider.getGasPrice();

    let cost = await descriptorContract.estimateGas.addManyBackgrounds(bgcolors);
    let ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute backgrounds ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyBackgrounds(bgcolors);
    console.log('added backgrounds')

    // =====

    gasPrice = await ethers.provider.getGasPrice();
    cost = await descriptorContract.estimateGas.addManyColorsToPalette(0, palette);
    ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute palettes ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyColorsToPalette(0, palette);
    console.log('added palette')

    // =====

    gasPrice = await ethers.provider.getGasPrice();
    cost = await descriptorContract.estimateGas.addManyEyes(eye.map(({ data }) => data));
    ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute add eyes ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyEyes(eye.map(({ data }) => data));
    console.log('added eyes')
    
    // =====

    gasPrice = await ethers.provider.getGasPrice();
    cost = await descriptorContract.estimateGas.addManyHats(hat.map(({ data }) => data));
    ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute add hats ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyHats(hat.map(({ data }) => data));
    console.log('added hat')

    // =====

    gasPrice = await ethers.provider.getGasPrice();
    cost = await descriptorContract.estimateGas.addManyBgItems(item.map(({ data }) => data));
    ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute add bgitems ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyBgItems(item.map(({ data }) => data));
    console.log('added bg items')

    // =====

    gasPrice = await ethers.provider.getGasPrice();
    cost = await descriptorContract.estimateGas.addManyClothes(cloth.map(({ data }) => data));
    ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute add clothes ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyClothes(cloth.map(({ data }) => data));
    console.log('added clothes')

    // =====

    gasPrice = await ethers.provider.getGasPrice();
    cost = await descriptorContract.estimateGas.addManyAccessories(acc.map(({ data }) => data));
    ok = await promptjs.get([
      {
        properties: {
          confirm: {
            type: 'string',
            description: `
            cost to execute add accessories ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
            Y/y to continue:
            `,
          },
        },
      },
    ]);

    if (ok.confirm.toString().toLowerCase() != 'y') {
      console.log('Exiting');
      return;
    }

    await descriptorContract.addManyAccessories(acc.map(({ data }) => data));
    console.log('added accessories')

    // chunk to reduce gas costs    
    const skinChunk = chunkArray(skin, 10);
    let i = 1;
    for (const chunk of skinChunk) {
      // =====

      gasPrice = await ethers.provider.getGasPrice();
      cost = await descriptorContract.estimateGas.addManySkins(chunk.map(({ data }) => data));
      ok = await promptjs.get([
        {
          properties: {
            confirm: {
              type: 'string',
              description: `
              cost to execute add skins ${i} ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
              Y/y to continue:
              `,
            },
          },
        },
      ]);

      if (ok.confirm.toString().toLowerCase() != 'y') {
        console.log('Exiting');
        return;
      }
      
      await descriptorContract.addManySkins(chunk.map(({ data }) => data));
      console.log('added sking chunk', i)
      i++
    }
    
    const mouthChunk = chunkArray(mouth, 10);
    let j = 1
    for (const chunk of mouthChunk) {
      // =====

      gasPrice = await ethers.provider.getGasPrice();
      cost = await descriptorContract.estimateGas.addManyMouths(chunk.map(({ data }) => data));
      ok = await promptjs.get([
        {
          properties: {
            confirm: {
              type: 'string',
              description: `
              cost to execute add mouths ${j} ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
              Y/y to continue:
              `,
            },
          },
        },
      ]);

      if (ok.confirm.toString().toLowerCase() != 'y') {
        console.log('Exiting');
        return;
      }

      await descriptorContract.addManyMouths(chunk.map(({ data }) => data));
      console.log('added mouth', j)
      j++
    }

    const oneOfOneChunks = chunkArray(one, 10);
    let p = 1
    for (const chunk of oneOfOneChunks) {
      // =====

      gasPrice = await ethers.provider.getGasPrice();
      cost = await descriptorContract.estimateGas.addManyOneOfOnes(chunk.map(({ data }) => data));
      ok = await promptjs.get([
        {
          properties: {
            confirm: {
              type: 'string',
              description: `
              cost to execute add oneofones ${p} ${ethers.utils.formatUnits(cost.mul(gasPrice),'ether')} ETH
              Y/y to continue:
              `,
            },
          },
        },
      ]);

      if (ok.confirm.toString().toLowerCase() != 'y') {
        console.log('Exiting');
        return;
      }

      await descriptorContract.addManyOneOfOnes(chunk.map(({ data }) => data));
      console.log('added one of one', p)
      p++
    }

    console.log('Descriptor populated with palettes and parts');
  });