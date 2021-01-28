import { expect } from 'chai';
import { goodEnoughCombine } from '../src/index';

describe('Normalized combine', () => {
  it('Reduce list of same ingredients to single ingredient', () => {
    const ingredients = goodEnoughCombine([
      {
        unit: 'lb',
        ingredient: 'onion',
        quantity: '1.2',
        minQty: null,
        maxQty: null,
      },
      {
        unit: 'oz',
        ingredient: 'onion',
        quantity: '2/5',
        minQty: null,
        maxQty: null,
      },
    ]);
    const expected = [
      {
        unit: 'lbs',
        ingredient: 'onion',
        quantity: '1.2249999999779535',
        minQty: null,
        maxQty: null,
      },
    ];
    expect(ingredients).to.deep.equal(expected);
  });

  it('Reduce list with same items but different unit kind ', () => {
    const ingredients = goodEnoughCombine([
      {
        unit: 'lb', // mass
        ingredient: 'egg',
        quantity: '1.2',
        minQty: '1',
        maxQty: '2',
      },
      {
        unit: 'oz',
        ingredient: 'egg',
        quantity: '2/5',
        minQty: null,
        maxQty: null,
      },
      {
        unit: 'floz', // volume
        ingredient: 'egg',
        quantity: '2.3',
        minQty: null,
        maxQty: null,
      },
      {
        unit: 'teaspoon', // volume
        ingredient: 'egg',
        quantity: '2',
        minQty: null,
        maxQty: null,
      },
      {
        unit: null, // count
        ingredient: 'egg',
        quantity: '5',
        minQty: null,
        maxQty: null,
      },
    ]);
    const expected = [
      {
        unit: 'lbs',
        ingredient: 'egg',
        quantity: '1.2249999999779535',
        minQty: null,
        maxQty: null,
      },
      {
        unit: 'floz',
        ingredient: 'egg',
        quantity: '2.6333333328824797',
        minQty: null,
        maxQty: null,
      },
      {
        unit: null,
        ingredient: 'egg',
        quantity: '5',
        minQty: null,
        maxQty: null,
      },
    ];
    expect(ingredients).to.deep.equal(expected);
  });
});
