import { expect } from 'chai';
import { normalizedCombine } from '../src/index';

describe('Normalized combine', () => {
  
  it("Reduce list of same ingredients to single ingredient", () => {
    const ingredients = normalizedCombine([
      {
        unit: 'lb',
        ingredient: 'onion',
        quantity: '1.2',
        minQty: null, maxQty: null
      },
      {
        unit: 'oz',
        ingredient: 'onion',
        quantity: '2/5',
        minQty: null, maxQty: null
      }
    ]);
    expect(ingredients).to.deep.equal([
      {
        unit: 'lbs',
        ingredient: 'onion',
        quantity: '1.2249999999779535',
        minQty: null,
        maxQty: null
      }
    ]);
  });
});